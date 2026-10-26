package io.nexusflow;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.spec.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

/** Connection governance only. MCP negotiation and execution remain in Python. */
@RestController
class McpConnections {
    final ControlApi control;
    McpConnections(ControlApi control) { this.control=control; }
    Actor owner(HttpServletRequest request) {
        Actor actor=control.actor(request);
        if(!"owner".equals(actor.role())) throw new ApiFailure(403,"CONNECTION_MANAGE_DENIED");
        return actor;
    }
    void service(HttpServletRequest request) {
        String expected="Bearer "+System.getenv("NF_SERVICE_TOKEN");
        if(!MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),Objects.toString(request.getHeader("Authorization"),"").getBytes(StandardCharsets.UTF_8))) throw new ApiFailure(401,"SERVICE_AUTH_REQUIRED");
    }
    String crypt(String value,UUID id,boolean encrypt) {
        try {
            byte[] key=Base64.getDecoder().decode(System.getenv("NF_TOOL_ENCRYPTION_KEY"));
            if(key.length!=32) throw new IllegalArgumentException();
            byte[] iv=new byte[12]; var cipher=Cipher.getInstance("AES/GCM/NoPadding");
            byte[] source;
            if(encrypt) { new SecureRandom().nextBytes(iv); source=value.getBytes(StandardCharsets.UTF_8); }
            else { byte[] packed=Base64.getDecoder().decode(value); iv=Arrays.copyOf(packed,12); source=Arrays.copyOfRange(packed,12,packed.length); }
            cipher.init(encrypt?Cipher.ENCRYPT_MODE:Cipher.DECRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,iv));
            cipher.updateAAD(id.toString().getBytes(StandardCharsets.UTF_8));
            byte[] result=cipher.doFinal(source);
            if(!encrypt) return new String(result,StandardCharsets.UTF_8);
            byte[] packed=Arrays.copyOf(iv,iv.length+result.length); System.arraycopy(result,0,packed,iv.length,result.length);
            return Base64.getEncoder().encodeToString(packed);
        } catch(Exception failure) { throw new ApiFailure(503,"CONNECTION_SECRET_UNAVAILABLE"); }
    }
    Map<String,Object> connection(UUID id,UUID workspace) {
        var rows=control.db.queryForList("SELECT * FROM mcp_connection WHERE id=? AND workspace_id=?",id,workspace);
        if(rows.isEmpty()) throw new ApiFailure(404,"RESOURCE_NOT_FOUND");
        return rows.getFirst();
    }
    Map<String,Object> dto(Map<String,Object> row) {
        return Map.of("id",row.get("id"),"name",row.get("name"),"url",row.get("url"),"authType",row.get("auth_type"),"hasCredential",row.get("credential")!=null,"enabled",row.get("enabled"),"revision",row.get("revision"),"tools",Json.MAPPER.readValue(row.get("catalog").toString(),List.class),"readTools",Json.MAPPER.readValue(row.get("read_tools").toString(),List.class));
    }
    Map<String,Object> config(Map<String,Object> row,UUID workspace) {
        var result=new LinkedHashMap<String,Object>();
        result.put("url",row.get("url")); result.put("authType",row.get("auth_type"));
        result.put("testWorkspace","TEST".equals(control.db.queryForObject("SELECT purpose FROM workspace WHERE id=?",String.class,workspace)));
        if(row.get("credential")!=null) result.put("token",crypt(row.get("credential").toString(),(UUID)row.get("id"),false));
        return result;
    }
    @GetMapping("/api/v2/mcp/connections") List<Map<String,Object>> list(HttpServletRequest request) {
        Actor actor=control.actor(request);
        return control.db.queryForList("SELECT * FROM mcp_connection WHERE workspace_id=? ORDER BY name,id",actor.workspace()).stream().map(this::dto).toList();
    }
    @PostMapping("/api/v2/mcp/connections") @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    Map<String,Object> create(@RequestBody Map<String,Object> body,HttpServletRequest request) {
        Actor actor=owner(request); UUID id=UUID.randomUUID();
        String name=Json.string(body,"name"),url=Json.string(body,"url"),auth=Objects.toString(body.get("authType"),"none");
        if(name.length()>128 || url.length()>2048 || !Set.of("none","bearer").contains(auth)) throw new ApiFailure(422,"INVALID_CONNECTION");
        // Python validates the same controlled transport for validation, discovery and execution.
        control.runtime.json("POST","mcp/validate-url",Map.of("url",url,"testWorkspace","TEST".equals(control.db.queryForObject("SELECT purpose FROM workspace WHERE id=?",String.class,actor.workspace()))),actor.workspace());
        String credential="bearer".equals(auth)?crypt(Json.string(body,"token"),id,true):null;
        return control.tx.execute(status->{
            control.db.update("INSERT INTO mcp_connection(id,workspace_id,name,url,auth_type,credential) VALUES(?,?,?,?,?,?)",id,actor.workspace(),name,url,auth,credential);
            control.audit(actor,"mcp.created",id); return dto(connection(id,actor.workspace()));
        });
    }
    @PostMapping("/api/v2/mcp/connections/{id}/discover") Map<String,Object> discover(@PathVariable UUID id,HttpServletRequest request) {
        Actor actor=owner(request); var old=connection(id,actor.workspace());
        var result=control.runtime.json("POST","mcp/discover",config(old,actor.workspace()),actor.workspace());
        return control.tx.execute(status->{
            int changed=control.db.update("UPDATE mcp_connection SET catalog=?::jsonb,read_tools='[]',enabled=false,revision=revision+1,updated_at=now() WHERE id=? AND workspace_id=? AND revision=?",Json.write(result.get("tools")),id,actor.workspace(),old.get("revision"));
            if(changed!=1) throw new ApiFailure(409,"CONNECTION_CHANGED");
            control.audit(actor,"mcp.discovered",id); return dto(connection(id,actor.workspace()));
        });
    }
    @PutMapping("/api/v2/mcp/connections/{id}") Map<String,Object> update(@PathVariable UUID id,@RequestBody Map<String,Object> body,HttpServletRequest request) {
        Actor actor=owner(request); var old=connection(id,actor.workspace());
        Object raw=body.get("readTools");
        if(!(raw instanceof List<?> names) || names.size()>64 || names.stream().anyMatch(n->!(n instanceof String))) throw new ApiFailure(422,"INVALID_TOOL_AUTHORIZATION");
        List<?> catalog=Json.MAPPER.readValue(old.get("catalog").toString(),List.class);
        var known=new HashSet<String>(); for(Object tool:catalog) {
            var descriptor=Json.object(tool);
            if(Boolean.TRUE.equals(descriptor.get("reportedReadOnly")) && !Boolean.TRUE.equals(descriptor.get("reportedDestructive"))) known.add(Json.string(descriptor,"name"));
        }
        if(!known.containsAll((List<?>)raw) || !(body.get("enabled") instanceof Boolean)) throw new ApiFailure(422,"INVALID_TOOL_AUTHORIZATION");
        String secret=old.get("credential")==null?null:old.get("credential").toString();
        if(body.containsKey("token")) {
            if(!"bearer".equals(old.get("auth_type"))) throw new ApiFailure(422,"INVALID_CONNECTION");
            secret=crypt(Json.string(body,"token"),id,true);
        }
        final String credential=secret;
        return control.tx.execute(status->{
            int changed=control.db.update("UPDATE mcp_connection SET enabled=?,read_tools=?::jsonb,credential=?,revision=revision+1,updated_at=now() WHERE id=? AND workspace_id=? AND revision=?",body.get("enabled"),Json.write(raw),credential,id,actor.workspace(),body.get("revision"));
            if(changed!=1) throw new ApiFailure(409,"CONNECTION_CHANGED");
            control.audit(actor,"mcp.authorization.updated",id); return dto(connection(id,actor.workspace()));
        });
    }
    static List<Map<String,Object>> snapshot(org.springframework.jdbc.core.JdbcTemplate db,UUID workspace) {
        var result=new ArrayList<Map<String,Object>>();
        for(var row:db.queryForList("SELECT id,catalog,read_tools FROM mcp_connection WHERE workspace_id=? AND enabled",workspace)) {
            List<?> allowed=Json.MAPPER.readValue(row.get("read_tools").toString(),List.class);
            List<?> catalog=Json.MAPPER.readValue(row.get("catalog").toString(),List.class);
            for(Object raw:catalog) {
                var tool=Json.object(raw); if(!allowed.contains(tool.get("name"))) continue;
                var item=new LinkedHashMap<>(tool); item.put("connectionId",row.get("id").toString()); result.add(item);
            }
        }
        if(result.size()>64) throw new ApiFailure(422,"TOOL_CATALOG_TOO_LARGE");
        return result;
    }
    @PostMapping("/internal/mcp/context") Map<String,Object> context(@RequestBody Map<String,Object> body,HttpServletRequest request) {
        service(request); UUID run=Json.uuid(body.get("runId")),workspace=Json.uuid(body.get("workspaceId")),id=Json.uuid(body.get("connectionId"));
        var rows=control.db.queryForList("SELECT r.account_id FROM run_request r JOIN membership m ON m.account_id=r.account_id AND m.workspace_id=r.workspace_id WHERE r.id=? AND r.workspace_id=? AND m.role IN ('owner','editor')",run,workspace);
        if(rows.isEmpty()) throw new ApiFailure(403,"CONNECTION_USE_DENIED");
        var row=connection(id,workspace);
        if(!Boolean.TRUE.equals(row.get("enabled"))) throw new ApiFailure(403,"CONNECTION_USE_DENIED");
        List<?> allowed=Json.MAPPER.readValue(row.get("read_tools").toString(),List.class);
        if(!allowed.contains(body.get("toolName"))) throw new ApiFailure(403,"CONNECTION_USE_DENIED");
        List<?> catalog=Json.MAPPER.readValue(row.get("catalog").toString(),List.class);
        var tool=catalog.stream().map(Json::object).filter(t->t.get("name").equals(body.get("toolName"))).findFirst().orElseThrow(()->new ApiFailure(403,"CONNECTION_USE_DENIED"));
        if(!Json.hash(tool).equals(body.get("descriptorHash"))) throw new ApiFailure(409,"TOOL_SCHEMA_CHANGED");
        return config(row,workspace);
    }
}
