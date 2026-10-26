package io.nexusflow;

import java.util.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v2/runs")
class RuntimeActions {
    final ControlApi control;
    RuntimeActions(ControlApi control) { this.control=control; }

    void lock(UUID run) { control.db.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",run.toString()); }
    Map<String,Object> receipt(UUID run,UUID command,String state) { return Map.of("runId",run,"commandId",command,"status",state); }
    Map<String,Object> existing(Actor actor,String key,Object request) {
        if(!key.matches("[a-zA-Z0-9_-]{1,128}")) throw new ApiFailure(422,"INVALID_IDEMPOTENCY_KEY");
        var rows=control.db.queryForList("SELECT * FROM control_outbox WHERE workspace_id=? AND request_key=?",actor.workspace(),key);
        if(rows.isEmpty()) return null;
        var row=rows.getFirst();
        if(!row.get("request_hash").equals(Json.hash(request))) throw new ApiFailure(409,"IDEMPOTENCY_CONFLICT");
        var payload=Json.read(row.get("payload").toString());
        return receipt(Json.uuid(payload.get("runId")),(UUID)row.get("id"),row.get("state").toString());
    }
    void enqueue(Actor actor,UUID id,String key,Object request,Map<String,Object> payload) {
        control.db.update("INSERT INTO control_outbox(id,workspace_id,request_key,request_hash,payload) VALUES(?,?,?,?,?::jsonb)",id,actor.workspace(),key,Json.hash(request),Json.write(payload));
        control.audit(actor,"run."+payload.get("kind").toString().toLowerCase(),Json.uuid(payload.get("runId")));
    }

    @PostMapping("/{run}/approvals") @ResponseStatus(HttpStatus.ACCEPTED)
    Map<String,Object> approve(@PathVariable UUID run,@RequestBody Map<String,Object> body,@RequestHeader("Idempotency-Key") String key,HttpServletRequest request) {
        Actor actor=control.actor(request); control.row("run_request",run,actor);
        String checkpoint=Json.string(body,"checkpointRef");
        String interaction=Json.string(body,"interactionRef");
        if(!(body.get("decisions") instanceof List<?> entries) || entries.isEmpty() || entries.size()>16) throw new ApiFailure(422,"APPROVAL_DECISIONS_REQUIRED");
        var decisions=new LinkedHashMap<String,Map<String,Object>>();
        for(Object raw:entries) {
            var item=Json.object(raw); String interrupt=Json.string(item,"interruptId");
            if(interrupt.length()>128 || !(item.get("approved") instanceof Boolean) || !(item.getOrDefault("comment","") instanceof String comment) || comment.length()>2000 || decisions.containsKey(interrupt)) throw new ApiFailure(422,"INVALID_APPROVAL_DECISION");
            decisions.put(interrupt,Map.of("approved",item.get("approved"),"comment",comment));
        }
        var logical=Map.of("kind","RESUME","runId",run.toString(),"checkpointRef",checkpoint,"interactionRef",interaction,"decisions",decisions);
        return control.tx.execute(status->{
            lock(run);
            var duplicate=existing(actor,key,logical); if(duplicate!=null) return duplicate;
            UUID previous=null; int old=0;
            for(var entry:decisions.entrySet()) {
                var saved=control.db.queryForList("SELECT * FROM approval_decision WHERE run_id=? AND interrupt_id=?",run,entry.getKey());
                if(!saved.isEmpty()) {
                    var item=saved.getFirst(); old++;
                    if(!item.get("approved").equals(entry.getValue().get("approved")) || !item.get("comment").equals(entry.getValue().get("comment"))) throw new ApiFailure(409,"APPROVAL_DECISION_CONFLICT");
                    if(previous!=null && !previous.equals(item.get("command_id"))) throw new ApiFailure(409,"APPROVAL_BATCH_CONFLICT");
                    previous=(UUID)item.get("command_id");
                }
            }
            if(old==decisions.size()) return receipt(run,previous,"ACCEPTED");
            if(old>0) throw new ApiFailure(409,"APPROVAL_BATCH_CONFLICT");
            for(var command:control.db.queryForList("SELECT DISTINCT command_id FROM approval_decision WHERE run_id=?",run)) {
                try {
                    var applied=control.runtime.json("GET","commands/"+command.get("command_id"),null,actor.workspace());
                    if(!"APPLIED".equals(applied.get("status"))) throw new ApiFailure(409,"APPROVAL_PROCESSING");
                } catch(ApiFailure error) { if(error.status==404) throw new ApiFailure(409,"APPROVAL_PROCESSING"); throw error; }
            }
            var view=control.runtime.json("GET","runs/"+run,null,actor.workspace());
            if(!"WAITING".equals(view.get("status")) || Boolean.TRUE.equals(view.get("cancelRequested"))) throw new ApiFailure(409,"RUN_NOT_WAITING");
            if(!checkpoint.equals(view.get("checkpointRef")) || !interaction.equals(view.get("interactionRef"))) throw new ApiFailure(409,"STALE_APPROVAL_CHECKPOINT");
            var pending=new HashSet<String>();
            if(view.get("interrupts") instanceof List<?> interrupts) for(Object item:interrupts) pending.add(Json.string(Json.object(item),"id"));
            if(!pending.containsAll(decisions.keySet())) throw new ApiFailure(409,"INTERRUPT_NOT_PENDING");
            UUID command=UUID.randomUUID(); var resumes=new LinkedHashMap<String,Object>();
            for(var entry:decisions.entrySet()) {
                UUID decision=UUID.randomUUID(); var value=new LinkedHashMap<String,Object>(entry.getValue());value.put("decisionId",decision.toString());
                resumes.put(entry.getKey(),value);
            }
            var payload=Map.<String,Object>of("kind","RESUME","runId",run.toString(),"commandId",command.toString(),"workspaceId",actor.workspace().toString(),"checkpointRef",checkpoint,"interactionRef",interaction,"resumes",resumes);
            enqueue(actor,command,key,logical,payload);
            for(var entry:resumes.entrySet()) {
                var value=Json.object(entry.getValue());
                control.db.update("INSERT INTO approval_decision(id,workspace_id,run_id,interrupt_id,actor_id,approved,comment,command_id) VALUES(?,?,?,?,?,?,?,?)",Json.uuid(value.get("decisionId")),actor.workspace(),run,entry.getKey(),actor.id(),value.get("approved"),value.get("comment"),command);
            }
            return receipt(run,command,"ACCEPTED");
        });
    }

    @PostMapping("/{run}/cancel") @ResponseStatus(HttpStatus.ACCEPTED)
    Map<String,Object> cancel(@PathVariable UUID run,@RequestHeader("Idempotency-Key") String key,HttpServletRequest request) {
        Actor actor=control.actor(request);control.row("run_request",run,actor);
        var logical=Map.of("kind","CANCEL","runId",run.toString());
        return control.tx.execute(status->{
            lock(run);var old=existing(actor,key,logical);if(old!=null) return old;
            UUID command=UUID.randomUUID();
            enqueue(actor,command,key,logical,Map.of("kind","CANCEL","runId",run.toString(),"commandId",command.toString(),"workspaceId",actor.workspace().toString()));
            return receipt(run,command,"ACCEPTED");
        });
    }
}
