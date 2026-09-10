package com.niqer.report.tool.storage;

import com.niqer.report.config.ReportProperties;
import com.niqer.report.exception.ReportException;
import com.niqer.report.service.ReportTemplateService;
import com.niqer.report.spi.ReportObjectStorage;
import com.niqer.report.storage.DelegatingReportObjectStorage;
import com.niqer.report.storage.LocalFsReportObjectStorage;
import com.niqer.report.storage.MinioReportObjectStorage;
import com.niqer.report.tool.ReportToolProperties;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

public class ToolStorageService {

    private final Path settingsFile;
    private final Path dataDir;
    private final ObjectMapper objectMapper;
    private final ReportProperties reportProperties;
    private final CacheManager cacheManager;
    private final DelegatingReportObjectStorage storage;
    private Map<String, Object> current;

    public ToolStorageService(ReportToolProperties toolProperties,
                              ReportProperties reportProperties,
                              ObjectMapper objectMapper,
                              CacheManager cacheManager) {
        this.dataDir = Path.of(toolProperties.getDataDir()).toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.dataDir);
        } catch (Exception e) {
            throw new IllegalStateException("cannot create data dir", e);
        }
        this.settingsFile = this.dataDir.resolve("storage.json");
        this.objectMapper = objectMapper;
        this.reportProperties = reportProperties;
        this.cacheManager = cacheManager;
        this.current = loadOrDefault();
        this.storage = new DelegatingReportObjectStorage(build(this.current, false));
        applyToReportProperties(this.current);
    }

    public DelegatingReportObjectStorage storage() {
        return storage;
    }

    public synchronized Map<String, Object> getPublic() {
        return publicView(current);
    }

    public synchronized Map<String, Object> save(Map<String, Object> body) {
        Map<String, Object> next = merge(current, body);
        storage.setDelegate(build(next, true));
        persist(next);
        current = next;
        applyToReportProperties(next);
        evictCaches();
        return publicView(current);
    }

    public synchronized void test(Map<String, Object> body) {
        Map<String, Object> probe = merge(current, body);
        ReportObjectStorage impl = build(probe, true);
        try {
            impl.list(prefixOf(probe));
        } catch (ReportException e) {
            throw e;
        } catch (Exception e) {
            throw ReportException.badRequest(e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
        }
    }

    public Path dataDir() {
        return dataDir;
    }

    private Map<String, Object> loadOrDefault() {
        if (Files.isRegularFile(settingsFile)) {
            try {
                JsonNode root = objectMapper.readTree(Files.readAllBytes(settingsFile));
                if (root != null && root.isObject()) {
                    return fromNode((ObjectNode) root);
                }
            } catch (Exception e) {
                throw new IllegalStateException("load storage.json failed", e);
            }
        }
        ReportProperties.Storage s = reportProperties.getStorage();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", blank(s.getType()) ? "local" : s.getType());
        m.put("endpoint", s.getEndpoint() == null ? "" : s.getEndpoint());
        m.put("accessKey", s.getAccessKey() == null ? "" : s.getAccessKey());
        m.put("secretKey", s.getSecretKey() == null ? "" : s.getSecretKey());
        m.put("bucket", s.getBucket() == null ? "report" : s.getBucket());
        m.put("prefix", s.getPrefix() == null ? "reports/" : s.getPrefix());
        m.put("secure", s.isSecure());
        return m;
    }

    private Map<String, Object> merge(Map<String, Object> base, Map<String, Object> body) {
        Map<String, Object> next = new LinkedHashMap<>(base);
        if (body == null) {
            return next;
        }
        copy(next, body, "type");
        copy(next, body, "endpoint");
        copy(next, body, "accessKey");
        copy(next, body, "bucket");
        copy(next, body, "prefix");
        if (body.containsKey("secure")) {
            Object v = body.get("secure");
            next.put("secure", v instanceof Boolean b ? b : Boolean.parseBoolean(String.valueOf(v)));
        }
        if (body.containsKey("secretKey")) {
            String secret = String.valueOf(body.get("secretKey") == null ? "" : body.get("secretKey"));
            if (!secret.isBlank()) {
                next.put("secretKey", secret);
            }
        }
        String type = String.valueOf(next.getOrDefault("type", "local"));
        if (!"minio".equalsIgnoreCase(type)) {
            next.put("type", "local");
        } else {
            next.put("type", "minio");
        }
        return next;
    }

    private ReportObjectStorage build(Map<String, Object> settings, boolean validateMinio) {
        String type = String.valueOf(settings.getOrDefault("type", "local"));
        if ("minio".equalsIgnoreCase(type)) {
            ReportProperties.Storage props = toProps(settings);
            if (validateMinio && (blank(props.getEndpoint()) || blank(props.getAccessKey()) || blank(props.getSecretKey())
                    || blank(props.getBucket()))) {
                throw ReportException.badRequest("minio endpoint/accessKey/secretKey/bucket required");
            }
            return new MinioReportObjectStorage(props);
        }
        return new LocalFsReportObjectStorage(dataDir);
    }

    private void persist(Map<String, Object> settings) {
        try {
            Files.writeString(settingsFile, objectMapper.writeValueAsString(settings));
        } catch (Exception e) {
            throw ReportException.error("save storage failed");
        }
    }

    private void applyToReportProperties(Map<String, Object> settings) {
        ReportProperties.Storage s = reportProperties.getStorage();
        s.setType(String.valueOf(settings.getOrDefault("type", "local")));
        s.setEndpoint(str(settings, "endpoint"));
        s.setAccessKey(str(settings, "accessKey"));
        s.setSecretKey(str(settings, "secretKey"));
        s.setBucket(str(settings, "bucket"));
        s.setPrefix(prefixOf(settings));
        Object secure = settings.get("secure");
        s.setSecure(secure instanceof Boolean b ? b : Boolean.parseBoolean(String.valueOf(secure)));
    }

    private void evictCaches() {
        if (cacheManager == null) return;
        Cache templates = cacheManager.getCache(ReportTemplateService.CACHE_TEMPLATE);
        if (templates != null) templates.clear();
        Cache codes = cacheManager.getCache(ReportTemplateService.CACHE_CODES);
        if (codes != null) codes.clear();
    }

    private Map<String, Object> publicView(Map<String, Object> settings) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", settings.getOrDefault("type", "local"));
        m.put("endpoint", settings.getOrDefault("endpoint", ""));
        m.put("accessKey", settings.getOrDefault("accessKey", ""));
        m.put("secretKey", "");
        m.put("bucket", settings.getOrDefault("bucket", "report"));
        m.put("prefix", prefixOf(settings));
        m.put("secure", settings.get("secure") instanceof Boolean b ? b : false);
        return m;
    }

    private static ReportProperties.Storage toProps(Map<String, Object> settings) {
        ReportProperties.Storage props = new ReportProperties.Storage();
        props.setType("minio");
        props.setEndpoint(str(settings, "endpoint"));
        props.setAccessKey(str(settings, "accessKey"));
        props.setSecretKey(str(settings, "secretKey"));
        props.setBucket(str(settings, "bucket"));
        props.setPrefix(prefixOf(settings));
        Object secure = settings.get("secure");
        props.setSecure(secure instanceof Boolean b ? b : Boolean.parseBoolean(String.valueOf(secure)));
        return props;
    }

    private static String prefixOf(Map<String, Object> settings) {
        String p = str(settings, "prefix");
        return blank(p) ? "reports/" : p;
    }

    private static Map<String, Object> fromNode(ObjectNode n) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", text(n, "type", "local"));
        m.put("endpoint", text(n, "endpoint", ""));
        m.put("accessKey", text(n, "accessKey", ""));
        m.put("secretKey", text(n, "secretKey", ""));
        m.put("bucket", text(n, "bucket", "report"));
        m.put("prefix", text(n, "prefix", "reports/"));
        JsonNode secure = n.get("secure");
        m.put("secure", secure != null && secure.isBoolean() && secure.asBoolean());
        return m;
    }

    private static void copy(Map<String, Object> next, Map<String, Object> body, String key) {
        if (!body.containsKey(key) || body.get(key) == null) return;
        next.put(key, String.valueOf(body.get(key)));
    }

    private static String text(ObjectNode n, String key, String fallback) {
        JsonNode v = n.get(key);
        if (v == null || v.isNull()) return fallback;
        String s = v.asString();
        return s == null ? fallback : s;
    }

    private static String str(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v == null ? "" : String.valueOf(v);
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
