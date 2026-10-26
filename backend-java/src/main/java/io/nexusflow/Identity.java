package io.nexusflow;

import java.io.IOException;
import java.io.ByteArrayInputStream;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Instant;
import java.util.*;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.ReadListener;
import jakarta.servlet.http.*;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.filter.OncePerRequestFilter;

record Actor(UUID id, UUID workspace, String role) {}

@Component
class Identity implements ApplicationRunner {
    final JdbcTemplate db;
    final TransactionTemplate tx;
    Identity(JdbcTemplate db, TransactionTemplate tx) { this.db=db; this.tx=tx; }

    static String passwordHash(String password, String salt) {
        try {
            var spec = new PBEKeySpec(password.toCharArray(), salt.getBytes(StandardCharsets.UTF_8), 180000, 256);
            return HexFormat.of().formatHex(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded());
        } catch (Exception error) { throw new IllegalStateException(error); }
    }
    static String token() { byte[] bytes=new byte[32]; new SecureRandom().nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }

    public void run(ApplicationArguments arguments) {
        String username=System.getenv("NF_BOOTSTRAP_USER"), password=System.getenv("NF_BOOTSTRAP_PASSWORD");
        if (username==null || password==null || password.length()<16) throw new IllegalStateException("Bootstrap credentials required");
        tx.executeWithoutResult(status -> {
            db.execute("SELECT pg_advisory_xact_lock(172621)");
            bootstrap(username,password,"PERSONAL","我的工作空间");
            String testPassword=System.getenv("NF_ACCEPTANCE_PASSWORD");
            if("true".equals(System.getenv("NF_TEST_MODE")) && testPassword!=null && testPassword.length()>=16)
                bootstrap("acceptance",testPassword,"TEST","自动化验收");
        });
    }

    void bootstrap(String username,String password,String purpose,String name) {
        var accounts=db.queryForList("SELECT id,home_workspace_id FROM account WHERE username=?",username);
        UUID user;
        if(accounts.isEmpty()) {
            user=UUID.randomUUID(); String salt=token();
            db.update("INSERT INTO account(id,username,password_hash) VALUES(?,?,?)",user,username,salt+":"+passwordHash(password,salt));
        } else {
            if(accounts.getFirst().get("home_workspace_id")!=null) return;
            user=(UUID)accounts.getFirst().get("id");
        }
        UUID workspace=UUID.randomUUID();
        db.update("INSERT INTO workspace(id,name,purpose) VALUES(?,?,?)",workspace,name,purpose);
        db.update("INSERT INTO membership VALUES(?,?,?)",workspace,user,"owner");
        db.update("UPDATE account SET home_workspace_id=? WHERE id=?",workspace,user);
        // One-time development bootstrap, never regrant permissions on normal startup.
        db.update("INSERT INTO connection_use_grant VALUES(?,?)",workspace,"validation-model");
    }

    String login(String username, String password) {
        if(!"true".equals(System.getenv("NF_TEST_MODE")) || !Set.of("developer","acceptance").contains(username)) throw new ApiFailure(401,"INVALID_CREDENTIALS");
        var rows=db.queryForList("SELECT * FROM account WHERE username=?",username);
        if (rows.isEmpty()) { passwordHash(password,"invalid-account-timing"); throw new ApiFailure(401,"INVALID_CREDENTIALS"); }
        var account=rows.getFirst(); var saved=account.get("password_hash").toString().split(":",2);
        if (!MessageDigest.isEqual(passwordHash(password,saved[0]).getBytes(StandardCharsets.UTF_8),saved[1].getBytes(StandardCharsets.UTF_8))) throw new ApiFailure(401,"INVALID_CREDENTIALS");
        String value=token();
        db.update("INSERT INTO auth_session VALUES(?,?,now()+interval '8 hours')",Json.hash(value),account.get("id"));
        return value;
    }

    Actor actor(HttpServletRequest request) {
        String value=Arrays.stream(Optional.ofNullable(request.getCookies()).orElse(new Cookie[0])).filter(c->c.getName().equals("nf_session")).map(Cookie::getValue).findFirst().orElse("");
        var rows=db.queryForList("SELECT account_id FROM auth_session WHERE token_hash=? AND expires_at>now()",Json.hash(value));
        if (rows.isEmpty()) throw new ApiFailure(401,"AUTH_REQUIRED");
        UUID user=(UUID)rows.getFirst().get("account_id");
        String selector=request.getHeader("X-Workspace-ID");
        var memberships=selector==null?db.queryForList("SELECT m.workspace_id,m.role FROM membership m JOIN account a ON a.id=m.account_id WHERE m.account_id=? ORDER BY (m.workspace_id=a.home_workspace_id) DESC NULLS LAST,m.workspace_id LIMIT 1",user):
            db.queryForList("SELECT workspace_id,role FROM membership WHERE account_id=? AND workspace_id=?",user,Json.uuid(selector));
        if (memberships.isEmpty()) throw new ApiFailure(403,"WORKSPACE_ACCESS_DENIED");
        return new Actor(user,(UUID)memberships.getFirst().get("workspace_id"),memberships.getFirst().get("role").toString());
    }
}

@Component
class AccessFilter extends OncePerRequestFilter {
    final Identity identity;
    final Map<String,Long> loginAttempts=new HashMap<>();
    AccessFilter(Identity identity) { this.identity=identity; }
    protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
        boolean internal=request.getRequestURI().equals("/internal/mcp/context");
        if (!request.getRequestURI().startsWith("/api/v2") && !internal) { chain.doFilter(request,response); return; }
        response.setHeader("Cache-Control","no-store"); response.setHeader("X-Content-Type-Options","nosniff");
        try {
            if (request.getContentLengthLong()>262144) throw new ApiFailure(413,"BODY_TOO_LARGE");
            String origin=request.getHeader("Origin");
            if (!request.getMethod().equals("GET") && origin!=null && !origin.equals(System.getenv("NF_BROWSER_ORIGIN"))) throw new ApiFailure(403,"ORIGIN_DENIED");
            if (internal) {
                String expected="Bearer "+System.getenv("NF_SERVICE_TOKEN");
                if(!java.security.MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),Objects.toString(request.getHeader("Authorization"),"").getBytes(StandardCharsets.UTF_8))) throw new ApiFailure(401,"SERVICE_AUTH_REQUIRED");
            } else if (Set.of("/api/v2/auth/login","/api/v2/auth/email/code","/api/v2/auth/email/login").contains(request.getRequestURI())) {
                synchronized(loginAttempts) {
                    long window=Instant.now().getEpochSecond()/60; String key=request.getRemoteAddr()+":"+window;
                    if (loginAttempts.size()>1024) loginAttempts.clear();
                    long count=loginAttempts.getOrDefault(key,0L)+1; loginAttempts.put(key,count);
                    if (count>30) throw new ApiFailure(429,"LOGIN_RATE_LIMIT");
                }
            } else if (!request.getRequestURI().equals("/api/v2/health")) {
                Actor actor=identity.actor(request); request.setAttribute("actor",actor);
                if (!request.getMethod().equals("GET") && !request.getRequestURI().equals("/api/v2/auth/logout") && !Set.of("owner","editor").contains(actor.role())) throw new ApiFailure(403,"WRITE_ACCESS_DENIED");
            }
            // Count bytes for chunked requests too; Content-Length is only an early rejection.
            if (!Set.of("GET","HEAD").contains(request.getMethod())) {
                byte[] body=request.getInputStream().readNBytes(262145);
                if (body.length>262144) throw new ApiFailure(413,"BODY_TOO_LARGE");
                chain.doFilter(new HttpServletRequestWrapper(request) {
                    public ServletInputStream getInputStream() {
                        var source=new ByteArrayInputStream(body);
                        return new ServletInputStream() {
                            public int read() { return source.read(); }
                            public int read(byte[] bytes,int offset,int length) { return source.read(bytes,offset,length); }
                            public boolean isFinished() { return source.available()==0; }
                            public boolean isReady() { return true; }
                            public void setReadListener(ReadListener listener) { throw new IllegalStateException("Synchronous request body"); }
                        };
                    }
                    public BufferedReader getReader() { return new BufferedReader(new InputStreamReader(getInputStream(),StandardCharsets.UTF_8)); }
                },response);
            } else chain.doFilter(request,response);
        } catch(ApiFailure error) {
            response.setStatus(error.status); response.setContentType("application/json"); response.getWriter().write(Json.write(Map.of("code",error.code)));
        }
    }
}
