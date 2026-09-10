package com.niqer.report.service;

import com.niqer.report.config.ReportProperties;
import com.niqer.report.exception.ReportException;
import com.niqer.report.protect.ReportTemplateCodec;
import com.niqer.report.spi.ReportObjectStorage;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.util.StringUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@RequiredArgsConstructor
public class ReportTemplateService {

    public static final String CACHE_TEMPLATE = "report_template";
    public static final String CACHE_CODES = "report_template_codes";
    private static final int CURRENT_SCHEMA_VERSION = 1;

    private final ReportObjectStorage storage;
    private final ReportProperties properties;
    private final ObjectMapper objectMapper;
    private final ReportTemplateCodec codec;
    private final Map<String, NameTuple> nameCache = new ConcurrentHashMap<>();

    public record NameTuple(String nameCn, String nameEn, String nameVn, String fallbackName) {
        public String displayBy(Locale locale, String code) {
            String preferred = pickByLocale(locale);
            if (StringUtils.hasText(preferred)) return preferred;
            if (StringUtils.hasText(nameCn)) return nameCn;
            if (StringUtils.hasText(fallbackName)) return fallbackName;
            return code;
        }

        private String pickByLocale(Locale locale) {
            if (locale == null) return nameCn;
            String lang = locale.getLanguage();
            if ("en".equalsIgnoreCase(lang)) return nameEn;
            if ("vi".equalsIgnoreCase(lang)) return nameVn;
            return nameCn;
        }
    }

    private String prefix() {
        String p = properties.getStorage().getPrefix();
        return p == null || p.isBlank() ? "reports/" : p;
    }

    public Map<String, Object> pageCodes(Integer pageNum, Integer pageSize) throws Exception {
        int currentPageNum = (pageNum != null && pageNum > 0) ? pageNum : 1;
        int currentPageSize = (pageSize != null && pageSize > 0) ? pageSize : 30;
        List<String> sorted = listSortedCodes();
        int total = sorted.size();
        int startIndex = (currentPageNum - 1) * currentPageSize;
        int endIndex = Math.min(startIndex + currentPageSize, total);
        List<String> pageData = startIndex < total ? sorted.subList(startIndex, endIndex) : List.of();
        Map<String, Object> result = new HashMap<>();
        result.put("records", pageData);
        result.put("totalRow", total);
        result.put("pageNum", currentPageNum);
        result.put("pageSize", currentPageSize);
        result.put("totalPage", currentPageSize > 0 ? (total + currentPageSize - 1) / currentPageSize : 0);
        return result;
    }

    @Cacheable(cacheNames = CACHE_CODES, key = "'all'")
    public List<String> listSortedCodes() throws Exception {
        List<String> codes = new ArrayList<>();
        String pref = prefix();
        for (String path : storage.list(pref)) {
            if (!path.startsWith(pref)) continue;
            String fileName = path.substring(pref.length());
            if (!fileName.isEmpty() && !fileName.endsWith("/")) {
                codes.add(fileName);
            }
        }
        Collections.sort(codes);
        return codes;
    }

    public byte[] loadRawBytes(String templateKey) throws Exception {
        if (!StringUtils.hasText(templateKey)) return null;
        String filePath = prefix() + templateKey;
        if (!storage.exists(filePath)) return null;
        try (InputStream in = storage.get(filePath)) {
            return in.readAllBytes();
        }
    }

    @Cacheable(cacheNames = CACHE_TEMPLATE, key = "#templateKey", unless = "#result == null")
    public String loadTemplateJson(String templateKey) throws Exception {
        byte[] raw = loadRawBytes(templateKey);
        if (raw == null) return null;
        return codec.open(raw);
    }

    @CacheEvict(cacheNames = {CACHE_TEMPLATE, CACHE_CODES}, allEntries = true)
    public void saveOrUpdateContent(String fileName, String content) throws Exception {
        if (!StringUtils.hasText(fileName) || content == null) {
            throw ReportException.badRequest("template content required");
        }
        if (!content.isEmpty() && content.charAt(0) == '\uFEFF') {
            content = content.substring(1);
        }
        String plain = content;
        if (ReportTemplateCodec.isEnvelope(content)) {
            plain = codec.open(content);
        } else {
            String trimmed = content.stripLeading();
            if (!trimmed.startsWith("{")) throw ReportException.badRequest("template envelope invalid");
        }
        try {
            validateTemplateInvariants(objectMapper.readTree(plain));
        } catch (ReportException e) {
            throw e;
        } catch (Exception e) {
            throw ReportException.badRequest("template envelope invalid");
        }
        byte[] sealed = codec.seal(plain);
        try (ByteArrayInputStream in = new ByteArrayInputStream(sealed)) {
            storage.put(prefix() + fileName, in, "application/octet-stream", sealed.length);
        }
        nameCache.clear();
    }

    private void validateTemplateInvariants(JsonNode root) {
        if (root == null || !root.isObject()) {
            throw ReportException.badRequest("root must be a JSON object");
        }
        JsonNode sv = root.get("schemaVersion");
        if (sv != null && !sv.isNull()) {
            int v = sv.isNumber() ? sv.asInt() : -1;
            if (v != CURRENT_SCHEMA_VERSION) {
                throw ReportException.badRequest("schemaVersion must be " + CURRENT_SCHEMA_VERSION);
            }
        }
        JsonNode headerYNode = root.get("headerY");
        JsonNode elements = root.get("elements");
        if (headerYNode != null && headerYNode.isNumber() && elements != null && elements.isArray()) {
            double headerY = headerYNode.asDouble();
            int idx = 0;
            for (JsonNode el : elements) {
                idx++;
                if (el == null || !el.isObject()) continue;
                JsonNode gid = el.get("groupId");
                if (gid == null || gid.isNull() || !StringUtils.hasText(gid.asString())) continue;
                JsonNode yNode = el.get("y");
                if (yNode == null || !yNode.isNumber()) continue;
                if (yNode.asDouble() < headerY) {
                    throw ReportException.badRequest("data element #" + idx + " y must be >= headerY");
                }
            }
        }
    }

    @CacheEvict(cacheNames = {CACHE_TEMPLATE, CACHE_CODES}, allEntries = true)
    public void deleteByCodes(List<String> codes) throws Exception {
        if (codes == null || codes.isEmpty()) return;
        for (String code : codes) {
            if (!StringUtils.hasText(code)) continue;
            String fp = prefix() + code;
            if (storage.exists(fp)) storage.delete(fp);
        }
        nameCache.clear();
    }

    @CacheEvict(cacheNames = {CACHE_TEMPLATE, CACHE_CODES}, allEntries = true)
    public void rename(String oldFileName, String newFileName) throws Exception {
        String pathOld = prefix() + oldFileName;
        if (!storage.exists(pathOld)) throw ReportException.notFound("template not found");
        if (storage.exists(prefix() + newFileName)) throw ReportException.conflict("template exists");
        byte[] raw = loadRawBytes(oldFileName);
        if (raw == null) throw ReportException.notFound("template not found");
        JsonNode root = objectMapper.readTree(codec.open(raw));
        if (!(root instanceof ObjectNode o)) throw ReportException.badRequest("invalid template");
        o.put("id", newFileName);
        validateTemplateInvariants(o);
        byte[] sealed = codec.seal(objectMapper.writeValueAsString(o));
        try (ByteArrayInputStream bin = new ByteArrayInputStream(sealed)) {
            storage.put(prefix() + newFileName, bin, "application/octet-stream", sealed.length);
        }
        storage.delete(pathOld);
        nameCache.clear();
    }

    public List<String> listAllTemplateCodes() throws Exception {
        return listSortedCodes();
    }

    public byte[] exportEnvelope(String templateKey) throws Exception {
        byte[] raw = loadRawBytes(templateKey);
        if (raw == null || !ReportTemplateCodec.isEnvelope(raw)) return null;
        return codec.seal(codec.open(raw));
    }

    public String resolveDisplayName(String templateCode, Locale locale) {
        return resolve(templateCode).displayBy(locale, templateCode);
    }

    public NameTuple resolve(String templateCode) {
        if (!StringUtils.hasText(templateCode)) {
            return new NameTuple(null, null, null, null);
        }
        return nameCache.computeIfAbsent(templateCode, this::loadName);
    }

    private NameTuple loadName(String code) {
        try {
            String raw = loadTemplateJson(code);
            if (raw == null) return new NameTuple(null, null, null, null);
            JsonNode root = objectMapper.readTree(raw);
            if (root == null || !root.isObject()) return new NameTuple(null, null, null, null);
            return new NameTuple(textOrNull(root, "nameCn"), textOrNull(root, "nameEn"),
                    textOrNull(root, "nameVn"), textOrNull(root, "name"));
        } catch (Exception e) {
            return new NameTuple(null, null, null, null);
        }
    }

    private static String textOrNull(JsonNode root, String field) {
        JsonNode n = root.get(field);
        if (n == null || n.isNull()) return null;
        String s = n.asString();
        return StringUtils.hasText(s) ? s : null;
    }
}
