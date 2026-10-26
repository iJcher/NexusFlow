package io.nexusflow;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

final class Json {
    static final JsonMapper MAPPER = JsonMapper.builder().build();
    static String write(Object value) { return MAPPER.writeValueAsString(value); }
    static Map<String,Object> read(String value) { return MAPPER.readValue(value, new TypeReference<Map<String,Object>>() {}); }
    static Map<String,Object> object(Object value) {
        if (!(value instanceof Map<?,?>)) throw new ApiFailure(422,"OBJECT_REQUIRED");
        return MAPPER.convertValue(value, new TypeReference<Map<String,Object>>() {});
    }
    static String string(Map<String,Object> object, String key) {
        var value = object.get(key);
        if (!(value instanceof String text) || text.isBlank() || text.length()>16000) throw new ApiFailure(422,"INVALID_"+key.toUpperCase());
        return text;
    }
    static UUID uuid(Object value) {
        try { return UUID.fromString(String.valueOf(value)); }
        catch (IllegalArgumentException error) { throw new ApiFailure(422,"INVALID_ID"); }
    }
    static Object normalized(Object value) {
        if (value instanceof Map<?,?> map) {
            var result = new TreeMap<String,Object>();
            map.forEach((key,item)->result.put(String.valueOf(key),normalized(item))); return result;
        }
        if (value instanceof List<?> list) return list.stream().map(Json::normalized).toList();
        return value;
    }
    static String hash(Object value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(write(normalized(value)).getBytes(StandardCharsets.UTF_8))); }
        catch (Exception error) { throw new IllegalStateException(error); }
    }
}

final class ApiFailure extends RuntimeException {
    final int status;
    final String code;
    final String path;
    ApiFailure(int status, String code) { this(status,code,""); }
    ApiFailure(int status, String code, String path) { super(code); this.status=status; this.code=code; this.path=path; }
}
