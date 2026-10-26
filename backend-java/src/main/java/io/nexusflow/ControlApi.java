package io.nexusflow;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.Semaphore;
import jakarta.servlet.http.*;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/v2")
class ControlApi {
    final JdbcTemplate db;
    final TransactionTemplate tx;
    final RuntimeClient runtime;
    final Identity identity;
    final SseBridge sse;
    ControlApi(JdbcTemplate db,TransactionTemplate tx,RuntimeClient runtime,Identity identity,SseBridge sse) { this.db=db; this.tx=tx; this.runtime=runtime; this.identity=identity; this.sse=sse; }
    Actor actor(HttpServletRequest request) { return (Actor)request.getAttribute("actor"); }

    void audit(Actor actor,String action,UUID resource) {
        db.update("INSERT INTO control_audit(workspace_id,actor_id,action,resource_id) VALUES(?,?,?,?)",actor.workspace(),actor.id(),action,resource);
    }
    List<String> connections(Actor user) {
        var allowed=new ArrayList<String>(db.queryForList("SELECT connection_ref FROM connection_use_grant WHERE workspace_id=?",String.class,user.workspace()));
        if("TEST".equals(db.queryForObject("SELECT purpose FROM workspace WHERE id=?",String.class,user.workspace()))) allowed.add("fixture");
        return allowed;
    }
    void checkModelUse(Map<String,Object> spec,Actor user) {
        if("agent".equals(spec.get("kind")) && !connections(user).contains(Json.object(spec.get("agent")).get("modelConnectionRef"))) throw new ApiFailure(403,"CONNECTION_USE_DENIED");
    }
    Map<String,Object> row(String table,UUID id,Actor actor) {
        if(!Set.of("definition","definition_version","run_request","control_outbox").contains(table)) throw new IllegalArgumentException();
        var rows=db.queryForList("SELECT * FROM "+table+" WHERE id=? AND workspace_id=?",id,actor.workspace());
        if(rows.isEmpty()) throw new ApiFailure(404,"RESOURCE_NOT_FOUND");
        if(table.equals("run_request") && rows.getFirst().get("conversation_id")!=null && !actor.id().equals(rows.getFirst().get("account_id"))) throw new ApiFailure(403,"CONVERSATION_ACCESS_DENIED");
        if(table.equals("control_outbox")) {
            var payload=Json.read(rows.getFirst().get("payload").toString());
            var roots=db.queryForList("SELECT account_id,conversation_id FROM run_request WHERE id=? AND workspace_id=?",Json.uuid(payload.get("runId")),actor.workspace());
            if(!roots.isEmpty() && roots.getFirst().get("conversation_id")!=null && !actor.id().equals(roots.getFirst().get("account_id"))) throw new ApiFailure(403,"CONVERSATION_ACCESS_DENIED");
        }
        return rows.getFirst();
    }
    Map<String,Object> dto(Map<String,Object> row) {
        var output=new LinkedHashMap<String,Object>();
        row.forEach((key,value)->{
            String name=switch(key) { case "workspace_id"->"workspaceId"; case "definition_id"->"definitionId"; case "created_at"->"createdAt"; case "updated_at"->"updatedAt"; default->key; };
            output.put(name,Set.of("spec","editor","manifest","payload").contains(key)&&value!=null?Json.read(value.toString()):value instanceof UUID?value.toString():value instanceof java.sql.Timestamp?value.toString():value);
        }); return output;
    }

    @GetMapping("/health") Map<String,Object> health() { return Map.of("status","UP","application","nexusflow-control"); }
    @PostMapping("/auth/login") Map<String,Object> login(@RequestBody Map<String,Object> body,HttpServletResponse response) {
        String token=identity.login(Json.string(body,"username"),Json.string(body,"password"));
        response.addHeader("Set-Cookie",ResponseCookie.from("nf_session",token).httpOnly(true).sameSite("Strict").path("/api/v2").maxAge(28800).build().toString());
        return Map.of("authenticated",true);
    }
    @GetMapping("/auth/session") Map<String,Object> session(HttpServletRequest request) {
        Actor user=actor(request); return Map.of("accountId",user.id(),"workspaceId",user.workspace(),"role",user.role());
    }
    @PostMapping("/auth/logout") Map<String,Object> logout(HttpServletRequest request,HttpServletResponse response) {
        for(Cookie cookie:Optional.ofNullable(request.getCookies()).orElse(new Cookie[0]))
            if(cookie.getName().equals("nf_session")) db.update("DELETE FROM auth_session WHERE token_hash=?",Json.hash(cookie.getValue()));
        response.addHeader("Set-Cookie",ResponseCookie.from("nf_session","").httpOnly(true).sameSite("Strict").path("/api/v2").maxAge(0).build().toString());
        return Map.of("authenticated",false);
    }
    @GetMapping("/capabilities") Map<String,Object> capabilities(HttpServletRequest request) {
        Actor user=actor(request); var data=runtime.json("GET","capabilities",null,user.workspace());
        var tools=new ArrayList<Object>((List<?>)data.get("tools"));
        for(var item:McpConnections.snapshot(db,user.workspace())) {
            var tool=new LinkedHashMap<String,Object>();
            tool.put("name","mcp_"+item.get("connectionId").toString().replace("-","")+"_"+Json.hash(item.get("name")).substring(0,16));
            tool.put("displayName",item.get("name")); tool.put("description",item.get("description")); tool.put("inputSchema",item.get("inputSchema"));
            tool.put("category","mcp"); tool.put("readOnly",true); tools.add(tool);
        }
        data.put("tools",tools);
        if(data.get("models") instanceof List<?> models) data.put("models",models.stream().map(Json::object).filter(model->!"fixture".equals(model.get("id"))||connections(user).contains("fixture")).map(model->{if(!connections(user).contains(model.get("id"))) model.put("available",false); return model;}).toList());
        return data;
    }
    @GetMapping("/workspaces") List<Map<String,Object>> workspaces(HttpServletRequest request) {
        return db.queryForList("SELECT w.id,w.name,w.purpose,m.role FROM workspace w JOIN membership m ON m.workspace_id=w.id WHERE m.account_id=? ORDER BY CASE w.purpose WHEN 'PERSONAL' THEN 0 WHEN 'LEGACY' THEN 1 ELSE 2 END,w.name",actor(request).id()).stream().map(this::dto).toList();
    }
    @GetMapping("/definitions") List<Map<String,Object>> definitions(HttpServletRequest request) {
        return db.queryForList("SELECT * FROM definition WHERE workspace_id=? ORDER BY updated_at DESC",actor(request).workspace()).stream().map(this::dto).toList();
    }
    @GetMapping("/versions") List<Map<String,Object>> versions(HttpServletRequest request) {
        return db.queryForList("SELECT v.*,d.name,d.kind FROM definition_version v JOIN definition d ON d.id=v.definition_id WHERE v.workspace_id=? AND v.stage='PUBLISHED' ORDER BY v.created_at DESC",actor(request).workspace()).stream().map(this::dto).toList();
    }
    @PostMapping("/definitions") @ResponseStatus(HttpStatus.CREATED)
    Map<String,Object> create(@RequestBody Map<String,Object> body,HttpServletRequest request) {
        Actor user=actor(request); UUID id=UUID.randomUUID(); String name=Json.string(body,"name"),kind=Json.string(body,"kind");
        if(name.length()>128 || !Set.of("workflow","agent").contains(kind)) throw new ApiFailure(422,"INVALID_DEFINITION");
        var spec=Json.object(body.get("spec"));
        if(!kind.equals(spec.get("kind"))) throw new ApiFailure(422,"DEFINITION_KIND_MISMATCH");
        tx.executeWithoutResult(status->{
            db.update("INSERT INTO definition(id,workspace_id,name,kind,spec,editor) VALUES(?,?,?,?,?::jsonb,?::jsonb)",id,user.workspace(),name,kind,Json.write(spec),Json.write(body.getOrDefault("editor",Map.of())));
            audit(user,"definition.created",id);
        }); return dto(row("definition",id,user));
    }
    @PutMapping("/definitions/{id}/draft")
    Map<String,Object> save(@PathVariable UUID id,@RequestBody Map<String,Object> body,HttpServletRequest request) {
        Actor user=actor(request); var old=row("definition",id,user); var spec=Json.object(body.get("spec"));
        if(!old.get("kind").equals(spec.get("kind"))) throw new ApiFailure(422,"DEFINITION_KIND_MISMATCH");
        if(!(body.get("revision") instanceof Number revision)) throw new ApiFailure(422,"REVISION_REQUIRED");
        String name=Json.string(body,"name"); if(name.length()>128) throw new ApiFailure(422,"INVALID_NAME");
        tx.executeWithoutResult(status->{
            int changed=db.update("UPDATE definition SET name=?,spec=?::jsonb,editor=?::jsonb,revision=revision+1,updated_at=now() WHERE id=? AND workspace_id=? AND revision=?",name,Json.write(spec),Json.write(body.getOrDefault("editor",Map.of())),id,user.workspace(),revision.longValue());
            if(changed!=1) throw new ApiFailure(409,"DRAFT_REVISION_CONFLICT"); audit(user,"definition.saved",id);
        }); return dto(row("definition",id,user));
    }
    @PostMapping("/definitions/{id}/validate")
    Map<String,Object> validate(@PathVariable UUID id,HttpServletRequest request) {
        Actor user=actor(request); return runtime.json("POST","validate",Json.read(row("definition",id,user).get("spec").toString()),user.workspace());
    }
    Map<String,Object> dependencies(Map<String,Object> spec,Actor user,String rootDefinition) {
        var result=new LinkedHashMap<String,Object>();
        collectDependencies(spec,user,result,new LinkedHashSet<>(List.of(rootDefinition)),1);
        return result;
    }
    void collectDependencies(Map<String,Object> spec,Actor user,Map<String,Object> result,Set<String> lineage,int depth) {
        var refs=new ArrayList<Map<String,Object>>();
        if("workflow".equals(spec.get("kind"))) {
            var nodes=new ArrayList<Map<String,Object>>(); collectNodes(Json.object(spec.get("body")),nodes);
            for(var node:nodes) if("agent_call".equals(node.get("type")) || "workflow_call".equals(node.get("type"))) {
                if(!node.containsKey("versionRef")) throw new ApiFailure(422,"NODE_CONFIGURATION_REQUIRED");
                refs.add(Map.of("versionRef",node.get("versionRef"),"kind","agent_call".equals(node.get("type"))?"agent":"workflow"));
            }
        } else {
            var agent=Json.object(spec.get("agent"));
            if(agent.get("executionTools") instanceof List<?> tools) for(Object tool:tools) refs.add(Json.object(tool));
        }
        for(var reference:refs) {
            UUID versionId=Json.uuid(reference.get("versionRef")); var version=row("definition_version",versionId,user);
            var child=Json.read(version.get("spec").toString()); String definition=version.get("definition_id").toString();
            if(!"PUBLISHED".equals(version.get("stage")) || (reference.containsKey("kind") && !reference.get("kind").equals(child.get("kind"))))
                throw new ApiFailure(422,"PUBLISHED_EXECUTION_REQUIRED");
            if(lineage.contains(definition)) throw new ApiFailure(422,"RECURSIVE_CALL_BLOCKED");
            if(depth>=4) throw new ApiFailure(422,"CALL_DEPTH_EXCEEDED");
            checkModelUse(child,user);
            result.put(versionId.toString(),Map.of("definitionId",definition,"spec",child,"manifest",Json.read(version.get("manifest").toString())));
            if(result.size()>64) throw new ApiFailure(422,"DEPENDENCY_LIMIT");
            var next=new LinkedHashSet<>(lineage); next.add(definition);
            collectDependencies(child,user,result,next,depth+1);
        }
    }
    @PostMapping("/definitions/{id}/publish")
    Map<String,Object> publish(@PathVariable UUID id,HttpServletRequest request) {
        return createVersion(id,request,false);
    }
    @PostMapping("/definitions/{id}/preview")
    Map<String,Object> preview(@PathVariable UUID id,HttpServletRequest request) {
        return createVersion(id,request,true);
    }
    Map<String,Object> createVersion(UUID id,HttpServletRequest request,boolean preview) {
        Actor user=actor(request); var draft=row("definition",id,user); var spec=Json.read(draft.get("spec").toString());
        checkModelUse(spec,user);
        var deps=dependencies(spec,user,id.toString());
        String targetBundle=null;
        for(Object value:deps.values()) {
            var child=Json.object(value);
            runtime.json("POST","versions/verify",Map.of("spec",child.get("spec"),"manifest",child.get("manifest")),user.workspace());
            String bundle=Json.object(child.get("manifest")).get("bundleDigest").toString();
            if(targetBundle!=null && !targetBundle.equals(bundle)) throw new ApiFailure(409,"DEPENDENCY_BUNDLE_MISMATCH");
            targetBundle=bundle;
        }
        // A draft using archived M2 dependencies compiles with that verified bundle.
        // Existing published definitions/checkpoints never acquire newer semantics silently.
        Object compileRequest=targetBundle==null?spec:Map.of("spec",spec,"bundleDigest",targetBundle);
        var manifest=runtime.json("POST","validate",compileRequest,user.workspace());
        return tx.execute(status->{
            var locked=db.queryForMap("SELECT revision FROM definition WHERE id=? AND workspace_id=? FOR UPDATE",id,user.workspace());
            if(!locked.get("revision").equals(draft.get("revision"))) throw new ApiFailure(409,"DRAFT_REVISION_CONFLICT");
            String stage=preview?"PREVIEW":"PUBLISHED";
            var old=db.queryForList("SELECT * FROM definition_version WHERE definition_id=? AND hash=? AND stage=?",id,manifest.get("hash"),stage);
            if(!old.isEmpty()) return dto(old.getFirst());
            UUID version=UUID.randomUUID(); int ordinal=db.queryForObject(preview?"SELECT least(coalesce(min(ordinal),0),0)-1 FROM definition_version WHERE definition_id=?":"SELECT greatest(coalesce(max(ordinal),0),0)+1 FROM definition_version WHERE definition_id=?",Integer.class,id);
            db.update("INSERT INTO definition_version(id,definition_id,workspace_id,ordinal,hash,spec,manifest,stage) VALUES(?,?,?,?,?,?::jsonb,?::jsonb,?)",version,id,user.workspace(),ordinal,manifest.get("hash"),Json.write(spec),Json.write(manifest),stage);
            audit(user,preview?"definition.previewed":"definition.published",version); return dto(row("definition_version",version,user));
        });
    }
    void collectNodes(Map<String,Object> body,List<Map<String,Object>> target) {
        if(!(body.get("steps") instanceof List<?> steps)) throw new ApiFailure(422,"INVALID_STEPS");
        for(Object raw:steps) {
            var node=Json.object(raw); target.add(node);
            if(node.get("branches") instanceof List<?> branches) for(Object branch:branches) collectNodes(Json.object(branch),target);
            if(node.get("cases") instanceof List<?> cases) for(Object entry:cases) collectNodes(Json.object(Json.object(entry).get("body")),target);
            if(node.containsKey("default")) collectNodes(Json.object(node.get("default")),target);
        }
    }
    @PostMapping("/runs") @ResponseStatus(HttpStatus.ACCEPTED)
    Map<String,Object> start(@RequestBody Map<String,Object> body,@RequestHeader("Idempotency-Key") String requestKey,HttpServletRequest request) {
        Actor user=actor(request); if(!requestKey.matches("[a-zA-Z0-9_-]{1,128}")) throw new ApiFailure(422,"INVALID_IDEMPOTENCY_KEY");
        UUID versionId=Json.uuid(body.get("versionId")); var version=row("definition_version",versionId,user);
        var input=Json.object(body.get("input")); var spec=Json.read(version.get("spec").toString());
        boolean conversational=Boolean.TRUE.equals(body.get("conversation"));
        if(conversational && !"1".equals(Json.read(version.get("manifest").toString()).get("conversationRuntimeVersion"))) throw new ApiFailure(422,"CONVERSATION_VERSION_UNSUPPORTED");
        if((conversational || body.containsKey("conversationId")) && !"agent".equals(spec.get("kind"))) throw new ApiFailure(422,"CONVERSATION_AGENT_REQUIRED");
        if(body.containsKey("conversationId") && !conversational) throw new ApiFailure(422,"INVALID_CONVERSATION");
        checkModelUse(spec,user);
        var deps=dependencies(spec,user,version.get("definition_id").toString());
        deps.put(versionId.toString(),Map.of("definitionId",version.get("definition_id").toString(),"spec",spec,"manifest",Json.read(version.get("manifest").toString())));
        String requestHash=conversational?Json.hash(Map.of("versionId",versionId.toString(),"input",input,"conversation",true,"conversationId",Objects.toString(body.get("conversationId"),""),"actorId",user.id().toString())):Json.hash(Map.of("versionId",versionId.toString(),"input",input));
        return tx.execute(status->{
            db.execute("SELECT pg_advisory_xact_lock(172622)");
            var old=db.queryForList("SELECT * FROM control_outbox WHERE workspace_id=? AND request_key=?",user.workspace(),requestKey);
            if(!old.isEmpty()) {
                if(!old.getFirst().get("request_hash").equals(requestHash)) throw new ApiFailure(409,"IDEMPOTENCY_CONFLICT");
                var payload=Json.read(old.getFirst().get("payload").toString());
                return Map.of("runId",payload.get("runId"),"commandId",payload.get("commandId"),"status",old.getFirst().get("state"));
            }
            UUID run=UUID.randomUUID(),command=UUID.randomUUID();
            UUID conversation=conversational?run:null,previous=null;
            if(body.containsKey("conversationId")) {
                conversation=Json.uuid(body.get("conversationId"));
                var turns=db.queryForList("SELECT id,version_id FROM run_request WHERE workspace_id=? AND account_id=? AND conversation_id=? ORDER BY created_at DESC,id DESC LIMIT 1",user.workspace(),user.id(),conversation);
                if(turns.isEmpty()) throw new ApiFailure(404,"CONVERSATION_NOT_FOUND");
                if(db.queryForObject("SELECT count(*) FROM run_request WHERE conversation_id=?",Integer.class,conversation)>=200) throw new ApiFailure(409,"CONVERSATION_TURN_LIMIT");
                if(!versionId.equals(turns.getFirst().get("version_id"))) throw new ApiFailure(409,"CONVERSATION_VERSION_CHANGED");
                previous=(UUID)turns.getFirst().get("id");
                Map<String,Object> last;
                try { last=runtime.json("GET","runs/"+previous,null,user.workspace()); }
                catch(ApiFailure error) { if(error.status==404) throw new ApiFailure(409,"CONVERSATION_NOT_READY"); throw error; }
                if(!"SUCCEEDED".equals(last.get("status"))) throw new ApiFailure(409,"CONVERSATION_NOT_READY");
            }
            var payload=new LinkedHashMap<String,Object>(Map.of("kind","START","runId",run.toString(),"commandId",command.toString(),"workspaceId",user.workspace().toString(),"versionId",versionId.toString(),"spec",spec,"manifest",Json.read(version.get("manifest").toString()),"dependencies",deps,"input",input,"authorizedConnections",connections(user)));
            payload.put("mcpTools",McpConnections.snapshot(db,user.workspace()));
            if(conversation!=null) {
                payload.put("conversationId",conversation.toString());
                if(previous!=null) payload.put("previousRunId",previous.toString());
                if("1".equals(Json.read(version.get("manifest").toString()).get("memoryRuntimeVersion"))) {
                    var memory=runtime.json("POST","memory",Map.of("userId",user.id().toString(),"definitionId",version.get("definition_id").toString()),user.workspace());
                    payload.put("memoryContext",memory.get("items"));
                    if("1".equals(Json.read(version.get("manifest").toString()).get("automaticMemoryVersion")))
                        payload.put("memoryScope",List.of(user.workspace().toString(),user.id().toString(),version.get("definition_id").toString()));
                }
            }
            db.update("INSERT INTO control_outbox(id,workspace_id,request_key,request_hash,payload) VALUES(?,?,?,?,?::jsonb)",command,user.workspace(),requestKey,requestHash,Json.write(payload));
            db.update("INSERT INTO run_request(id,workspace_id,account_id,version_id,command_id,conversation_id,previous_run_id) VALUES(?,?,?,?,?,?,?)",run,user.workspace(),user.id(),versionId,command,conversation,previous);
            audit(user,"run.accepted",run); return Map.of("runId",run,"commandId",command,"status","ACCEPTED");
        });
    }
    @GetMapping("/commands/{id}") Map<String,Object> command(@PathVariable UUID id,HttpServletRequest request) {
        var value=row("control_outbox",id,actor(request)); return Map.of("commandId",id,"status",value.get("state"),"attempts",value.get("attempts"),"errorCode",Objects.toString(value.get("failure_code"),""),"path",Objects.toString(value.get("failure_path"),""));
    }
    @GetMapping("/runs/{id}") Map<String,Object> run(@PathVariable UUID id,HttpServletRequest request) {
        Actor user=actor(request); var local=row("run_request",id,user); var command=row("control_outbox",(UUID)local.get("command_id"),user);
        if(!command.get("state").equals("DELIVERED")) return Map.of("runId",id,"status",command.get("state").equals("REJECTED")?"REJECTED":"QUEUED","commandStatus",command.get("state"),"errorCode",Objects.toString(command.get("failure_code"),""),"path",Objects.toString(command.get("failure_path"),""),"highWaterSeq",0,"invocations",List.of());
        var result=runtime.json("GET","runs/"+id,null,user.workspace());
        var meta=db.queryForMap("SELECT conversation_id,account_id FROM run_request WHERE id=?",id);
        if(meta.get("conversation_id")!=null) {
            if(!user.id().equals(meta.get("account_id"))) throw new ApiFailure(403,"CONVERSATION_ACCESS_DENIED");
            result.put("conversationId",meta.get("conversation_id").toString());
        }
        return result;
    }
    @GetMapping("/definitions/{id}/memories") Map<String,Object> memories(@PathVariable UUID id,HttpServletRequest request) {
        Actor user=actor(request); var definition=row("definition",id,user);
        if(!"agent".equals(definition.get("kind"))) throw new ApiFailure(422,"MEMORY_AGENT_REQUIRED");
        return runtime.json("POST","memory",Map.of("userId",user.id().toString(),"definitionId",id.toString()),user.workspace());
    }
    @PostMapping("/definitions/{id}/memories") Map<String,Object> saveMemory(@PathVariable UUID id,@RequestBody Map<String,Object> body,HttpServletRequest request) {
        Actor user=actor(request); var definition=row("definition",id,user);
        if(!"agent".equals(definition.get("kind"))) throw new ApiFailure(422,"MEMORY_AGENT_REQUIRED");
        if(!Set.of("content","confirmed","source","sourceRunId","invocationId").containsAll(body.keySet())) throw new ApiFailure(422,"MEMORY_SOURCE_INVALID");
        if("tool_observation".equals(body.get("source"))) {
            var source=row("run_request",Json.uuid(body.get("sourceRunId")),user);
            var version=row("definition_version",(UUID)source.get("version_id"),user);
            if(!user.id().equals(source.get("account_id")) || !id.equals(version.get("definition_id"))) throw new ApiFailure(403,"MEMORY_SOURCE_INVALID");
        }
        var payload=new LinkedHashMap<String,Object>(body);
        payload.putAll(Map.of("userId",user.id().toString(),"definitionId",id.toString(),"action","save"));
        var result=runtime.json("POST","memory",payload,user.workspace());
        audit(user,"memory.confirmed",id); return result;
    }
    @DeleteMapping("/definitions/{id}/memories/{key}") Map<String,Object> deleteMemory(@PathVariable UUID id,@PathVariable String key,HttpServletRequest request) {
        Actor user=actor(request); row("definition",id,user);
        var result=runtime.json("POST","memory",Map.of("userId",user.id().toString(),"definitionId",id.toString(),"action","delete","id",key),user.workspace());
        audit(user,"memory.deleted",id); return result;
    }
    @GetMapping("/definitions/{id}/conversations") List<Map<String,Object>> conversations(@PathVariable UUID id,HttpServletRequest request) {
        Actor user=actor(request); row("definition",id,user);
        // Discover saved previews from existing Run metadata; no second message store.
        var entries=db.queryForList("""
            SELECT DISTINCT ON (coalesce(r.conversation_id,r.id))
                r.id,r.conversation_id,r.version_id,r.created_at,o.payload->'input' AS input
            FROM run_request r JOIN definition_version v ON v.id=r.version_id
            JOIN control_outbox o ON o.id=r.command_id
            WHERE v.definition_id=? AND r.workspace_id=? AND r.account_id=?
            ORDER BY coalesce(r.conversation_id,r.id),r.created_at DESC,r.id DESC
            """,id,user.workspace(),user.id());
        entries.sort((a,b)->((java.sql.Timestamp)b.get("created_at")).compareTo((java.sql.Timestamp)a.get("created_at")));
        return entries.stream().limit(50).map(entry->{
            var item=new LinkedHashMap<String,Object>();
            item.put("runId",entry.get("id")); item.put("conversationId",entry.get("conversation_id"));
            item.put("versionId",entry.get("version_id")); item.put("updatedAt",entry.get("created_at").toString());
            var input=Json.read(Objects.toString(entry.get("input"),"{}"));
            String title=input.values().stream().filter(String.class::isInstance).map(Object::toString).findFirst().orElse("").replaceAll("\\s+"," ").strip();
            item.put("title",title.substring(0,Math.min(60,title.length())));
            return (Map<String,Object>)item;
        }).toList();
    }
    @GetMapping("/runs/{id}/conversation") List<Map<String,Object>> conversation(@PathVariable UUID id,HttpServletRequest request) {
        Actor user=actor(request); var root=row("run_request",id,user);
        if(!user.id().equals(root.get("account_id"))) throw new ApiFailure(403,"CONVERSATION_ACCESS_DENIED");
        if(root.get("conversation_id")==null) return List.of();
        var turns=db.queryForList("SELECT id FROM run_request WHERE workspace_id=? AND account_id=? AND conversation_id=? AND created_at<=(SELECT created_at FROM run_request WHERE id=?) ORDER BY created_at,id LIMIT 200",user.workspace(),user.id(),root.get("conversation_id"),id);
        var result=new ArrayList<Map<String,Object>>();
        for(var turn:turns) {
            UUID turnId=(UUID)turn.get("id"); if(turnId.equals(id)) continue;
            var view=runtime.json("GET","runs/"+turnId,null,user.workspace());
            result.add(Map.of("runId",turnId,"input",view.get("input"),"output",view.getOrDefault("output",Map.of()),"status",view.get("status")));
        }
        return result;
    }
    @GetMapping(value="/runs/{id}/events",produces=MediaType.TEXT_EVENT_STREAM_VALUE)
    ResponseEntity<SseEmitter> events(@PathVariable UUID id,@RequestParam(defaultValue="0") long after,HttpServletRequest request) {
        Actor user=actor(request); var local=row("run_request",id,user);
        if(after<0) throw new ApiFailure(422,"INVALID_CURSOR");
        if(!row("control_outbox",(UUID)local.get("command_id"),user).get("state").equals("DELIVERED")) throw new ApiFailure(409,"COMMAND_NOT_DELIVERED");
        return sse.open(id,after,user.workspace());
    }
}

@Component
class OutboxDispatcher {
    final JdbcTemplate db;
    final RuntimeClient runtime;
    OutboxDispatcher(JdbcTemplate db,RuntimeClient runtime) { this.db=db; this.runtime=runtime; }
    @Scheduled(fixedDelay=250)
    void dispatch() {
        if("true".equals(System.getenv("NF_TEST_MODE")) && java.nio.file.Files.exists(java.nio.file.Path.of(System.getenv("NF_PAUSE_OUTBOX_FILE")))) return;
        // Root control commands depend on START delivery, including while START is in backoff.
        // This orders transport only; LangGraph remains the sole execution scheduler.
        for(var row:db.queryForList("""
                SELECT o.* FROM control_outbox o
                WHERE o.state='ACCEPTED' AND o.next_attempt<=now()
                AND (o.payload->>'kind'='START' OR EXISTS (
                    SELECT 1 FROM run_request r JOIN control_outbox initial ON initial.id=r.command_id
                    WHERE r.id=(o.payload->>'runId')::uuid AND r.workspace_id=o.workspace_id
                    AND initial.state IN ('DELIVERED','REJECTED')))
                ORDER BY o.created_at LIMIT 4
                """)) {
            try {
                var payload=Json.read(row.get("payload").toString());
                if(!"START".equals(payload.get("kind")) && Boolean.TRUE.equals(db.queryForObject("""
                        SELECT initial.state='REJECTED' FROM run_request r
                        JOIN control_outbox initial ON initial.id=r.command_id
                        WHERE r.id=?::uuid AND r.workspace_id=?
                        """,Boolean.class,payload.get("runId"),row.get("workspace_id")))) {
                    db.update("UPDATE control_outbox SET state='RESOLVED',failure_code='NO_EXECUTION_TO_CANCEL' WHERE id=?",row.get("id"));
                    continue;
                }
                runtime.json("POST","commands",payload,(UUID)row.get("workspace_id"));
                db.update("UPDATE control_outbox SET state='DELIVERED',attempts=attempts+1 WHERE id=?",row.get("id"));
            } catch(ApiFailure error) {
                if(error.status>=400 && error.status<500 && error.status!=429 && error.status!=408) db.update("UPDATE control_outbox SET state='REJECTED',attempts=attempts+1,failure_code=?,failure_path=? WHERE id=?",error.code,error.path,row.get("id"));
                else db.update("UPDATE control_outbox SET attempts=attempts+1,next_attempt=now()+interval '2 seconds' WHERE id=?",row.get("id"));
            }
        }
    }
}

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(ApiFailure.class) ResponseEntity<Map<String,Object>> failure(ApiFailure error) {
        return ResponseEntity.status(error.status).body(Map.of("code",error.code,"path",error.path));
    }
    @ExceptionHandler({org.springframework.web.bind.MissingRequestHeaderException.class,org.springframework.http.converter.HttpMessageNotReadableException.class,org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
    ResponseEntity<Map<String,Object>> invalid(Exception error) { return ResponseEntity.status(422).body(Map.of("code","INVALID_REQUEST")); }
}
