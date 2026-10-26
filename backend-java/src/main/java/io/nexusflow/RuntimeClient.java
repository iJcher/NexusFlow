package io.nexusflow;

import java.io.*;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
class RuntimeClient {
    final HttpClient client=HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(3)).build();
    final String credential=System.getenv("NF_SERVICE_TOKEN");
    final URI base=URI.create("http://127.0.0.1:19082/");

    HttpResponse<InputStream> send(String method,String path,Object body,UUID workspace) {
        try {
            var builder=HttpRequest.newBuilder(base.resolve(path)).timeout(Duration.ofSeconds(30)).header("Authorization","Bearer "+credential);
            if (workspace!=null) builder.header("X-NF-Workspace",workspace.toString());
            if (body==null) builder.GET();
            else builder.header("Content-Type","application/json").method(method,HttpRequest.BodyPublishers.ofString(Json.write(body)));
            return client.send(builder.build(),HttpResponse.BodyHandlers.ofInputStream());
        } catch(InterruptedException error) { Thread.currentThread().interrupt(); throw new ApiFailure(502,"RUNTIME_UNAVAILABLE"); }
        catch(IOException error) { throw new ApiFailure(502,"RUNTIME_UNAVAILABLE"); }
    }
    Map<String,Object> json(String method,String path,Object body,UUID workspace) {
        var response=send(method,path,body,workspace);
        try(var input=response.body()) {
            byte[] bytes=input.readNBytes(1048577);
            if(bytes.length>1048576) throw new ApiFailure(502,"RUNTIME_RESPONSE_TOO_LARGE");
            var result=Json.read(new String(bytes,java.nio.charset.StandardCharsets.UTF_8));
            if(response.statusCode()>=400) throw new ApiFailure(response.statusCode(),String.valueOf(result.getOrDefault("code","RUNTIME_REJECTED")),String.valueOf(result.getOrDefault("path","")));
            return result;
        } catch(IOException error) { throw new ApiFailure(502,"RUNTIME_UNAVAILABLE"); }
    }
}
