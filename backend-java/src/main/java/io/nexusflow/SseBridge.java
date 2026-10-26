package io.nexusflow;

import java.io.ByteArrayOutputStream;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Component
class SseBridge {
    final RuntimeClient runtime;
    final Semaphore slots=new Semaphore(32);
    SseBridge(RuntimeClient runtime) { this.runtime=runtime; }

    ResponseEntity<SseEmitter> open(UUID run,long after,UUID workspace) {
        if(!slots.tryAcquire()) throw new ApiFailure(429,"STREAM_CAPACITY");
        var emitter=new SseEmitter(600000L);
        var closed=new AtomicBoolean();
        var subscription=new AtomicReference<Flow.Subscription>();
        var future=new AtomicReference<CompletableFuture<?>>();
        Runnable cleanup=()->{
            if(!closed.compareAndSet(false,true)) return;
            slots.release();
            if(subscription.get()!=null) subscription.get().cancel();
            if(future.get()!=null) future.get().cancel(true);
        };
        emitter.onCompletion(cleanup);emitter.onTimeout(cleanup);emitter.onError(error->cleanup.run());
        var request=HttpRequest.newBuilder(runtime.base.resolve("runs/"+run+"/events?after="+after)).timeout(Duration.ofSeconds(30))
            .header("Authorization","Bearer "+runtime.credential).header("X-NF-Workspace",workspace.toString()).GET().build();
        var response=runtime.client.sendAsync(request,HttpResponse.BodyHandlers.ofPublisher());future.set(response);
        response.whenComplete((upstream,failure)->{
            if(closed.get()) return;
            if(failure!=null || upstream.statusCode()!=200) { emitter.completeWithError(new ApiFailure(502,"RUNTIME_STREAM_UNAVAILABLE"));cleanup.run();return; }
            upstream.body().subscribe(new Flow.Subscriber<List<ByteBuffer>>() {
                final ByteArrayOutputStream pending=new ByteArrayOutputStream();
                public void onSubscribe(Flow.Subscription value) {
                    subscription.set(value);
                    if(closed.get()) value.cancel(); else value.request(1);
                }
                public void onNext(List<ByteBuffer> buffers) {
                    if(closed.get()) return;
                    try {
                        for(var buffer:buffers) { byte[] bytes=new byte[buffer.remaining()];buffer.get(bytes);pending.write(bytes); }
                        if(pending.size()>1048576) throw new IllegalStateException("FRAME_LIMIT");
                        byte[] bytes=pending.toByteArray();int start=0;
                        for(int index=0;index<bytes.length-1;index++) {
                            int length=bytes[index]=='\n' && bytes[index+1]=='\n'?2:index+3<bytes.length && bytes[index]=='\r' && bytes[index+1]=='\n' && bytes[index+2]=='\r' && bytes[index+3]=='\n'?4:0;
                            if(length==0) continue;
                            String frame=new String(bytes,start,index-start,StandardCharsets.UTF_8).replace("\r\n","\n");
                            var event=SseEmitter.event();String data=null;
                            for(String line:frame.split("\n")) {
                                if(line.startsWith("id:")) event.id(line.substring(3).trim());
                                if(line.startsWith("event:")) event.name(line.substring(6).trim());
                                if(line.startsWith("data:")) data=(data==null?"":data+"\n")+line.substring(5).stripLeading();
                            }
                            emitter.send(data==null?event.comment("keepalive"):event.data(Json.read(data)));
                            index+=length-1;start=index+1;
                        }
                        pending.reset();pending.write(bytes,start,bytes.length-start);
                        if(!closed.get()) subscription.get().request(1);
                    } catch(Exception error) { emitter.completeWithError(new ApiFailure(502,"RUNTIME_STREAM_UNAVAILABLE"));cleanup.run(); }
                }
                public void onError(Throwable error) { emitter.completeWithError(new ApiFailure(502,"RUNTIME_STREAM_UNAVAILABLE"));cleanup.run(); }
                public void onComplete() { emitter.complete();cleanup.run(); }
            });
        });
        return ResponseEntity.ok().header("Cache-Control","no-cache").header("X-Accel-Buffering","no").body(emitter);
    }
}
