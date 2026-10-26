package io.nexusflow;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import jakarta.servlet.http.*;
import org.springframework.http.ResponseCookie;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v2/auth/email")
class EmailAuth {
    final Identity identity;
    final SecureRandom random=new SecureRandom();
    EmailAuth(Identity identity) { this.identity=identity; }

    String email(Map<String,Object> body) {
        String value=Json.string(body,"email").trim().toLowerCase(Locale.ROOT);
        if(value.length()>254 || !value.matches("[a-z0-9._%+\\-]+@[a-z0-9.\\-]+\\.[a-z]{2,63}")) throw new ApiFailure(422,"INVALID_EMAIL");
        return value;
    }
    String digest(UUID challenge,String email,String code) {
        try {
            String pepper=System.getenv("NF_EMAIL_PEPPER");
            if(pepper==null || pepper.length()<32) throw new IllegalStateException();
            Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(pepper.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(Json.write(List.of(challenge.toString(),email,"login",code)).getBytes(StandardCharsets.UTF_8)));
        } catch(Exception error) { throw new ApiFailure(503,"AUTH_CONFIGURATION_REQUIRED"); }
    }
    boolean testRecipient(String email) { return "true".equals(System.getenv("NF_TEST_MODE")) && email.endsWith("@acceptance.nexusflow.test"); }
    JavaMailSenderImpl sender(String email) {
        boolean test=testRecipient(email);
        String host=test?"127.0.0.1":System.getenv("NF_SMTP_HOST");
        if(host==null || host.isBlank()) throw new ApiFailure(503,"SMTP_NOT_CONFIGURED");
        var sender=new JavaMailSenderImpl();sender.setHost(host);sender.setDefaultEncoding("UTF-8");
        boolean secure=!test && "true".equals(System.getenv("NF_SMTP_SECURE"));
        int port;
        try { port=test?19083:Integer.parseInt(Optional.ofNullable(System.getenv("NF_SMTP_PORT")).orElse(secure?"465":"587")); }
        catch(NumberFormatException error) { throw new ApiFailure(503,"SMTP_NOT_CONFIGURED"); }
        if(port<1 || port>65535) throw new ApiFailure(503,"SMTP_NOT_CONFIGURED");
        sender.setPort(port);
        if(!test) {
            String user=System.getenv("NF_SMTP_USER"),password=System.getenv("NF_SMTP_PASSWORD");
            if(user!=null && !user.isBlank()) {
                if(password==null || password.isBlank()) throw new ApiFailure(503,"SMTP_NOT_CONFIGURED");
                sender.setUsername(user);sender.setPassword(password);
            }
        }
        var properties=sender.getJavaMailProperties();
        properties.setProperty("mail.smtp.auth",Boolean.toString(sender.getUsername()!=null));
        properties.setProperty("mail.smtp.ssl.enable",Boolean.toString(secure));
        properties.setProperty("mail.smtp.ssl.checkserveridentity","true");
        properties.setProperty("mail.smtp.starttls.enable",Boolean.toString(!secure && !test));
        properties.setProperty("mail.smtp.starttls.required",Boolean.toString(!secure && !test));
        for(String key:List.of("connectiontimeout","timeout","writetimeout")) properties.setProperty("mail.smtp."+key,"10000");
        return sender;
    }

    @PostMapping("/code")
    Map<String,Object> send(@RequestBody Map<String,Object> body) {
        String address=email(body);var sender=sender(address);
        String from=testRecipient(address)?"noreply@acceptance.nexusflow.test":System.getenv("NF_SMTP_FROM");
        if(from==null || from.isBlank() || from.length()>320 || from.matches("(?s).*[\\r\\n\\x00].*")) throw new ApiFailure(503,"SMTP_NOT_CONFIGURED");
        UUID challenge=UUID.randomUUID();String code=String.format(Locale.ROOT,"%06d",random.nextInt(1000000));String hashed=digest(challenge,address,code);
        identity.tx.executeWithoutResult(status->{
            identity.db.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?,0))","email:"+address);
            if(identity.db.queryForObject("SELECT count(*) FROM email_challenge WHERE email=? AND created_at>now()-interval '60 seconds'",Integer.class,address)>0 || identity.db.queryForObject("SELECT count(*) FROM email_challenge WHERE email=? AND created_at>now()-interval '1 day'",Integer.class,address)>=20) throw new ApiFailure(429,"EMAIL_RATE_LIMIT");
            identity.db.update("UPDATE email_challenge SET state='EXPIRED' WHERE email=? AND state IN ('PENDING','SENT')",address);
            identity.db.update("INSERT INTO email_challenge(id,email,code_hash,expires_at) VALUES(?,?,?,now()+interval '5 minutes')",challenge,address,hashed);
        });
        try {
            var message=new SimpleMailMessage();message.setFrom(from);message.setTo(address);message.setSubject("NexusFlow 登录验证码");
            message.setText("你的 NexusFlow 登录验证码是："+code+"\n有效期 5 分钟，请勿向他人透露。\n如果不是你发起的请求，请忽略此邮件。");
            sender.send(message);
            identity.db.update("UPDATE email_challenge SET state='SENT' WHERE id=? AND state='PENDING'",challenge);
        } catch(Exception failure) {
            identity.db.update("UPDATE email_challenge SET state='FAILED' WHERE id=?",challenge);
            throw new ApiFailure(503,"MAIL_UNAVAILABLE");
        }
        return Map.of("challengeId",challenge,"retryAfterSeconds",60,"expiresInSeconds",300);
    }

    @PostMapping("/login")
    Map<String,Object> login(@RequestBody Map<String,Object> body,HttpServletResponse response) {
        String address=email(body),code=Json.string(body,"code");UUID challenge=Json.uuid(body.get("challengeId"));
        if(!code.matches("[0-9]{6}")) throw new ApiFailure(401,"AUTH_CODE_INVALID");
        String candidate=digest(challenge,address,code);
        String token=identity.tx.execute(status->{
            identity.db.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?,0))","email:"+address);
            var rows=identity.db.queryForList("SELECT *,expires_at>now() AS fresh FROM email_challenge WHERE id=? AND email=? FOR UPDATE",challenge,address);
            if(rows.isEmpty()) return null;
            var row=rows.getFirst();
            if(!"SENT".equals(row.get("state")) || !Boolean.TRUE.equals(row.get("fresh")) || ((Number)row.get("attempts")).intValue()>=5) return null;
            identity.db.update("UPDATE email_challenge SET attempts=attempts+1 WHERE id=?",challenge);
            if(!MessageDigest.isEqual(candidate.getBytes(StandardCharsets.UTF_8),row.get("code_hash").toString().getBytes(StandardCharsets.UTF_8))) return null;
            identity.db.update("UPDATE email_challenge SET state='CONSUMED' WHERE id=?",challenge);
            UUID account=account(address);String value=Identity.token();
            identity.db.update("INSERT INTO auth_session VALUES(?,?,now()+interval '8 hours')",Json.hash(value),account);
            var workspace=identity.db.queryForObject("SELECT home_workspace_id FROM account WHERE id=?",UUID.class,account);
            identity.db.update("INSERT INTO control_audit(workspace_id,actor_id,action,resource_id) VALUES(?,?,'identity.email_login',?)",workspace,account,account);
            return value;
        });
        if(token==null) throw new ApiFailure(401,"AUTH_CODE_INVALID");
        response.addHeader("Set-Cookie",ResponseCookie.from("nf_session",token).httpOnly(true).sameSite("Strict").path("/api/v2").maxAge(28800).build().toString());
        return Map.of("authenticated",true);
    }

    UUID account(String email) {
        var existing=identity.db.queryForList("SELECT id FROM account WHERE email=?",email);
        if(!existing.isEmpty()) return (UUID)existing.getFirst().get("id");
        String owner=Optional.ofNullable(System.getenv("NF_OWNER_EMAIL")).orElse("").trim().toLowerCase(Locale.ROOT);
        if(!owner.isEmpty() && owner.equals(email)) {
            var bootstrap=identity.db.queryForList("SELECT id,email FROM account WHERE username=? FOR UPDATE",System.getenv("NF_BOOTSTRAP_USER"));
            if(!bootstrap.isEmpty() && bootstrap.getFirst().get("email")==null) {
                UUID account=(UUID)bootstrap.getFirst().get("id");identity.db.update("UPDATE account SET email=? WHERE id=?",email,account);return account;
            }
        }
        UUID account=UUID.randomUUID(),workspace=UUID.randomUUID();boolean test=testRecipient(email);
        identity.db.update("INSERT INTO workspace(id,name,purpose) VALUES(?,?,?)",workspace,test?"自动化验收":"我的工作空间",test?"TEST":"PERSONAL");
        identity.db.update("INSERT INTO account(id,username,password_hash,email,home_workspace_id) VALUES(?,?,'OTP_ONLY',?,?)",account,email,email,workspace);
        identity.db.update("INSERT INTO membership VALUES(?,?,'owner')",workspace,account);
        return account;
    }
}
