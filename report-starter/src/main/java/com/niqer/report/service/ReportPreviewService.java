package com.niqer.report.service;

import com.niqer.report.config.ReportProperties;
import com.niqer.report.exception.ReportException;
import com.niqer.report.spi.ReportAuthGuard;
import com.niqer.report.spi.ReportConnectionRegistry;
import com.niqer.report.spi.ReportPrintCallback;
import com.niqer.report.spi.ReportSqlExecutor;
import com.niqer.report.sql.ReportSqlDialects;
import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Transactional(rollbackFor = Exception.class, readOnly = true)
public class ReportPreviewService {

    private static final Pattern API_PARAM = Pattern.compile("#\\{([^}]+)}");
    private static final Pattern SQL_READ_ONLY_START = Pattern.compile("(?is)^\\s*(select|with)\\b");
    private static final Set<String> PREVIEW_INTERNAL_PARAM_KEYS = Set.of(
            "templateId", "printMode", "showPrintButton", "token", "sql", "apiParams", "dbName");
    private static final int PREVIEW_ERROR_DETAIL_MAX_LEN = 300;
    private static final Pattern SQL_DANGEROUS_KEYWORD = Pattern.compile(
            "(?is)\\b(insert|update|delete|merge|drop|alter|truncate|create|grant|revoke|copy|call|execute|do"
                    + "|vacuum|analyze|set|lock|into|begin|commit|rollback|savepoint|prepare|deallocate"
                    + "|listen|notify|unlisten|load|discard|checkpoint|reindex|cluster|refresh|rename)\\b");
    private static final Pattern SQL_STRING_LITERAL = Pattern.compile("'(?:''|[^'])*'");
    private static final int REPORT_API_HTTP_TIMEOUT_MS = 60_000;
    private static final int REPORT_SQL_PREVIEW_MAX_ROWS = 500;

    private final ReportPrintCallback printCallback;
    private final ReportSqlExecutor sqlExecutor;
    private final ReportAuthGuard authGuard;
    private final ObjectMapper objectMapper;
    private final ReportProperties properties;
    private final ReportConnectionRegistry connectionRegistry;

    public ReportPreviewService(ReportPrintCallback printCallback,
                                ReportSqlExecutor sqlExecutor,
                                ReportAuthGuard authGuard,
                                ObjectMapper objectMapper,
                                ReportProperties properties) {
        this(printCallback, sqlExecutor, authGuard, objectMapper, properties, null);
    }

    public ReportPreviewService(ReportPrintCallback printCallback,
                                ReportSqlExecutor sqlExecutor,
                                ReportAuthGuard authGuard,
                                ObjectMapper objectMapper,
                                ReportProperties properties,
                                ReportConnectionRegistry connectionRegistry) {
        this.printCallback = printCallback;
        this.sqlExecutor = sqlExecutor;
        this.authGuard = authGuard;
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.connectionRegistry = connectionRegistry;
    }

    public record ResultHolder(boolean ok, Object data, String errorMessage) {}

    public JsonNode fetchDesignerApi(Map<String, Object> params, HttpServletRequest request) {
        if (params == null) throw ReportException.badRequest("api url required");
        String url = textOf(params.get("url"));
        if (url == null || url.isBlank()) throw ReportException.badRequest("api url required");
        String method = textOf(params.get("method"));
        String headersJson = jsonText(params.get("headers"), "{}");
        String reqBody = jsonText(params.get("body"), null);

        url = resolveReportApiUrl(url.trim(), request);
        HttpRequest apiRequest = buildApiRequest(method, url);
        if (isBodyMethod(method)) {
            apiRequest.header("Content-Type", "application/json");
        }
        applyApiHeaders(apiRequest, headersJson);
        if (reqBody != null && !reqBody.isBlank() && isBodyMethod(method)) {
            apiRequest.body(reqBody);
        }
        authGuard.forwardAuthHeaders(apiRequest, request);
        HttpResponse res = apiRequest.execute();
        String respBody = res.body();
        int status = res.getStatus();
        if (status < 200 || status >= 300) {
            throw ReportException.error(clipDetail("HTTP " + status + " " + (respBody == null ? "" : respBody)));
        }
        if (respBody == null || respBody.isBlank()) {
            return objectMapper.createObjectNode();
        }
        String json = stripBom(respBody).trim();
        try {
            return objectMapper.readTree(json);
        } catch (Exception e) {
            String ct = res.header("Content-Type");
            throw ReportException.badRequest(clipDetail(
                    "api response is not json; url=" + url
                            + (ct == null || ct.isBlank() ? "" : "; content-type=" + ct)
                            + "; body=" + json));
        }
    }

    public ResultHolder parseSql(Map<String, Object> params) {
        try {
            Object sqlObj = params.get("sql");
            if (sqlObj == null) {
                return new ResultHolder(false, null, "sql required");
            }
            String dbName = params.get("dbName") == null ? null : String.valueOf(params.get("dbName"));
            String sql = wrapPreviewSql(sqlObj.toString(), 1, properties.getSql().getPreviewTimeoutMs(), dbName);
            Map<String, Object> row = executorFor(dbName).queryOne(sql, params);
            if (row == null) {
                return new ResultHolder(false, null, "DATA_NOT_FOUND");
            }
            return new ResultHolder(true, row.keySet(), null);
        } catch (Exception e) {
            String msg = e.getCause() != null ? e.getCause().toString() : e.getMessage();
            return new ResultHolder(false, null, msg);
        }
    }

    public JsonNode buildPreviewTemplate(String templateJson, Map<String, Object> params, HttpServletRequest request) {
        return buildTemplate(templateJson, params, request, REPORT_SQL_PREVIEW_MAX_ROWS, properties.getSql().getPreviewTimeoutMs());
    }

    public JsonNode buildRenderTemplate(String templateJson, Map<String, Object> params, HttpServletRequest request) {
        return buildTemplate(templateJson, params, request, properties.getPdf().getMaxRows(), properties.getPdf().getSqlTimeoutMs());
    }

    private JsonNode buildTemplate(String templateJson, Map<String, Object> params, HttpServletRequest request, int maxRows, int timeoutMs) {
        if (templateJson != null && !templateJson.isEmpty() && templateJson.charAt(0) == '\uFEFF') {
            templateJson = templateJson.substring(1);
        }
        JsonNode root = objectMapper.readTree(templateJson);
        if (!root.isObject()) {
            throw ReportException.badRequest("invalid template");
        }
        ObjectNode template = (ObjectNode) root;
        printCallback.afterTemplateFilled(params, template);

        JsonNode dataset = template.get("dataset");
        ObjectNode datasetResult = objectMapper.createObjectNode();

        if (dataset != null && dataset.isObject()) {
            for (String varName : dataset.propertyNames()) {
                JsonNode dsNode = dataset.get(varName);
                if (dsNode == null || !dsNode.isObject()) continue;
                ObjectNode ds = (ObjectNode) dsNode;
                String type = text(ds, "type");
                if ("SQL".equals(type)) {
                    datasetResult.set(varName, runSqlDataset(varName, text(ds, "content"), text(ds, "dbName"), params, maxRows, timeoutMs));
                }
                if ("API".equals(type)) {
                    String api = text(ds, "url");
                    if (api == null) continue;
                    api = replaceApiParams(api, params, true);
                    api = resolveReportApiUrl(api, request);
                    HttpRequest apiRequest = buildApiRequest(text(ds, "method"), api);
                    applyApiHeaders(apiRequest, replaceApiParams(text(ds, "headers"), params, false));
                    String reqBody = replaceApiParams(text(ds, "body"), params, false);
                    if (reqBody != null && !reqBody.isBlank() && isBodyMethod(text(ds, "method"))) {
                        apiRequest.body(reqBody);
                    }
                    authGuard.forwardAuthHeaders(apiRequest, request);
                    String body = apiRequest.execute().body();
                    datasetResult.set(varName, objectMapper.readTree(body));
                }
            }
        }

        template.remove("id");
        template.remove("param");
        template.remove("dataset");
        template.remove("createdAt");
        datasetResult.set("param", objectMapper.valueToTree(params));
        template.set("dataset", datasetResult);
        return template;
    }

    private JsonNode runSqlDataset(String varName, String sql, String dbName, Map<String, Object> params, int maxRows, int timeoutMs) {
        assertSqlParamsPresent(varName, sql, params);
        try {
            String previewSql = wrapPreviewSql(sql, maxRows, timeoutMs, dbName);
            List<Map<String, Object>> rowList = executorFor(dbName).query(previewSql, params);
            return objectMapper.valueToTree(rowList);
        } catch (ReportException e) {
            throw e;
        } catch (Exception e) {
            throw ReportException.error("dataset " + varName + " failed: " + rootCauseMessage(e));
        }
    }

    private static void assertSqlParamsPresent(String varName, String sql, Map<String, Object> params) {
        if (sql == null || sql.isBlank()) return;
        List<String> missing = new ArrayList<>();
        Matcher m = API_PARAM.matcher(sql);
        while (m.find()) {
            String key = m.group(1).trim();
            if (!key.isEmpty() && (params == null || !params.containsKey(key)) && !missing.contains(key)) {
                missing.add(key);
            }
        }
        if (missing.isEmpty()) return;
        String provided = providedParamKeys(params);
        throw ReportException.error("dataset " + varName + " missing params: " + String.join(", ", missing)
                + "; provided: " + (provided.isEmpty() ? "-" : provided));
    }

    private static String providedParamKeys(Map<String, Object> params) {
        if (params == null || params.isEmpty()) return "";
        return params.keySet().stream()
                .filter(k -> k != null && !PREVIEW_INTERNAL_PARAM_KEYS.contains(k))
                .sorted()
                .collect(Collectors.joining(", "));
    }

    private static String rootCauseMessage(Throwable e) {
        Throwable cur = e;
        while (cur.getCause() != null && cur.getCause() != cur) cur = cur.getCause();
        String msg = cur.getMessage();
        if (msg == null || msg.isBlank()) msg = cur.getClass().getSimpleName();
        msg = msg.trim();
        if (msg.length() > PREVIEW_ERROR_DETAIL_MAX_LEN) {
            msg = msg.substring(0, PREVIEW_ERROR_DETAIL_MAX_LEN) + "...";
        }
        return msg;
    }

    public Map<String, List<String>> listSqlSchema() {
        List<Map<String, Object>> rows = sqlExecutor.queryRaw(
                "select table_name, column_name from information_schema.columns "
                        + "where table_schema = current_schema() order by table_name, ordinal_position");
        Map<String, List<String>> schema = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            String table = r.get("table_name") == null ? null : String.valueOf(r.get("table_name"));
            String column = r.get("column_name") == null ? null : String.valueOf(r.get("column_name"));
            if (table == null || column == null) continue;
            schema.computeIfAbsent(table, k -> new ArrayList<>()).add(column);
        }
        return schema;
    }

    static String toPreviewSql(String sql, int maxRows, int timeoutMs) {
        return ReportSqlDialects.wrapReadOnly(sql, maxRows, timeoutMs, "postgres");
    }

    private String wrapPreviewSql(String sql, int maxRows, int timeoutMs, String dbName) {
        String dialect = connectionRegistry == null ? "postgres" : connectionRegistry.dialect(dbName);
        return ReportSqlDialects.wrapReadOnly(sql, maxRows, timeoutMs, dialect);
    }

    private ReportSqlExecutor executorFor(String dbName) {
        if (connectionRegistry != null) {
            return connectionRegistry.require(dbName);
        }
        return sqlExecutor;
    }

    private static String replaceApiParams(String raw, Map<String, Object> params, boolean encode) {
        if (raw == null) return null;
        return API_PARAM.matcher(raw).replaceAll(matchResult -> {
            String key = matchResult.group(1);
            Object value = params == null ? null : params.get(key);
            String text = value == null ? "" : String.valueOf(value);
            return Matcher.quoteReplacement(encode ? encodeUrlComponent(text) : text);
        });
    }

    private static HttpRequest buildApiRequest(String method, String api) {
        String m = method == null || method.isBlank() ? "GET" : method.trim().toUpperCase(Locale.ROOT);
        HttpRequest req = switch (m) {
            case "POST" -> HttpRequest.post(api);
            case "PUT" -> HttpRequest.put(api);
            case "DELETE" -> HttpRequest.delete(api);
            default -> HttpRequest.get(api);
        };
        return req.timeout(REPORT_API_HTTP_TIMEOUT_MS);
    }

    private static boolean isBodyMethod(String method) {
        if (method == null) return false;
        String m = method.trim().toUpperCase(Locale.ROOT);
        return "POST".equals(m) || "PUT".equals(m);
    }

    private void applyApiHeaders(HttpRequest apiRequest, String headersJson) {
        if (headersJson == null || headersJson.isBlank()) return;
        JsonNode node;
        try {
            node = objectMapper.readTree(headersJson);
        } catch (Exception e) {
            throw ReportException.badRequest("api headers must be json object");
        }
        if (node == null || node.isNull()) return;
        if (!node.isObject()) {
            throw ReportException.badRequest("api headers must be json object");
        }
        ObjectNode obj = (ObjectNode) node;
        for (String name : obj.propertyNames()) {
            JsonNode v = obj.get(name);
            if (v == null || v.isNull()) continue;
            apiRequest.header(name, v.asString());
        }
    }

    public static void validateReadOnlySql(String sql) {
        if (!SQL_READ_ONLY_START.matcher(sql).find()) {
            throw ReportException.badRequest("report sql must start with select or with");
        }
        String stripped = SQL_STRING_LITERAL.matcher(sql).replaceAll("''");
        if (stripped.contains(";") || stripped.contains("--") || stripped.contains("/*") || stripped.contains("*/")) {
            throw ReportException.badRequest("report sql must be a single read-only statement");
        }
        if (SQL_DANGEROUS_KEYWORD.matcher(stripped).find()) {
            throw ReportException.badRequest("report sql contains forbidden keyword");
        }
    }

    static String encodeUrlComponent(Object value) {
        return URLEncoder.encode(String.valueOf(value), StandardCharsets.UTF_8).replace("+", "%20");
    }

    private String internalApiOrigin(HttpServletRequest request) {
        String base = properties.getApi().getInternalBaseUrl();
        if (base != null && !base.isBlank()) {
            String origin = base.trim();
            while (origin.endsWith("/")) origin = origin.substring(0, origin.length() - 1);
            return origin;
        }
        return request.getScheme() + "://" + request.getServerName() + ":" + request.getServerPort();
    }

    String resolveReportApiUrl(String api, HttpServletRequest request) {
        if (api == null || api.isBlank()) throw ReportException.badRequest("api url required");
        boolean internalApiPath = false;
        if (api.startsWith("/api")) {
            internalApiPath = true;
            String origin = internalApiOrigin(request);
            String contextPath = request.getContextPath();
            if (properties.getApi().isThroughGateway()) {
                api = origin + contextPath + api;
            } else {
                api = origin + contextPath + api.substring(4);
            }
        }
        URI uri;
        try {
            uri = URI.create(api);
        } catch (IllegalArgumentException e) {
            throw ReportException.badRequest("api url invalid");
        }
        if (!uri.isAbsolute() || !isHttpScheme(uri)) {
            throw ReportException.badRequest("report api must be http(s) url");
        }
        if (uri.getUserInfo() != null || uri.getHost() == null || uri.getHost().isBlank()) {
            throw ReportException.badRequest("report api url invalid");
        }
        if (!internalApiPath) assertAllowedReportApiUrl(uri);
        return uri.toString();
    }

    private void assertAllowedReportApiUrl(URI uri) {
        if (allowAnyApiHost()) return;
        List<URI> allowedPrefixes = allowedApiPrefixes();
        if (allowedPrefixes.isEmpty()) {
            throw ReportException.badRequest("report api host not allowed");
        }
        for (URI allowed : allowedPrefixes) {
            if (matchesAllowedPrefix(uri, allowed)) return;
        }
        throw ReportException.badRequest("report api host not allowed");
    }

    private boolean allowAnyApiHost() {
        String raw = properties.getApi().getAllowedUrlPrefixes();
        if (raw == null || raw.isBlank()) return false;
        return Pattern.compile("[,\\n]").splitAsStream(raw)
                .map(String::trim)
                .anyMatch("*"::equals);
    }

    private List<URI> allowedApiPrefixes() {
        String raw = properties.getApi().getAllowedUrlPrefixes();
        if (raw == null || raw.isBlank()) return List.of();
        return Pattern.compile("[,\\n]").splitAsStream(raw)
                .map(String::trim).filter(s -> !s.isEmpty() && !"*".equals(s))
                .map(ReportPreviewService::parseAllowedApiPrefix).toList();
    }

    private static URI parseAllowedApiPrefix(String prefix) {
        URI uri;
        try {
            uri = URI.create(prefix);
        } catch (IllegalArgumentException e) {
            throw ReportException.badRequest("report api allowlist invalid");
        }
        if (!uri.isAbsolute() || !isHttpScheme(uri) || uri.getHost() == null || uri.getUserInfo() != null) {
            throw ReportException.badRequest("report api allowlist invalid");
        }
        return uri;
    }

    private static boolean matchesAllowedPrefix(URI target, URI allowedPrefix) {
        if (!target.getScheme().equalsIgnoreCase(allowedPrefix.getScheme())) return false;
        if (!target.getHost().equalsIgnoreCase(allowedPrefix.getHost())) return false;
        if (effectivePort(target) != effectivePort(allowedPrefix)) return false;
        String targetPath = normalizedPath(target);
        String allowedPath = normalizedPath(allowedPrefix);
        if ("/".equals(allowedPath)) return targetPath.startsWith("/");
        return targetPath.equals(allowedPath)
                || targetPath.startsWith(allowedPath.endsWith("/") ? allowedPath : allowedPath + "/");
    }

    private static int effectivePort(URI uri) {
        int port = uri.getPort();
        if (port >= 0) return port;
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private static String normalizedPath(URI uri) {
        String path = uri.normalize().getPath();
        return path == null || path.isBlank() ? "/" : path;
    }

    private static boolean isHttpScheme(URI uri) {
        String scheme = uri.getScheme();
        return "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
    }

    private static String text(ObjectNode n, String field) {
        JsonNode v = n.get(field);
        if (v == null || v.isNull()) return null;
        return v.asString();
    }

    private static String textOf(Object v) {
        if (v == null) return null;
        return String.valueOf(v);
    }

    private String jsonText(Object v, String whenNull) {
        if (v == null) return whenNull;
        if (v instanceof String s) return s;
        try {
            return objectMapper.writeValueAsString(v);
        } catch (Exception e) {
            throw ReportException.badRequest("api headers must be json object");
        }
    }

    private static String stripBom(String text) {
        if (text != null && !text.isEmpty() && text.charAt(0) == '\uFEFF') {
            return text.substring(1);
        }
        return text;
    }

    private static String clipDetail(String msg) {
        if (msg == null) return "";
        String text = msg.trim();
        if (text.length() > PREVIEW_ERROR_DETAIL_MAX_LEN) {
            return text.substring(0, PREVIEW_ERROR_DETAIL_MAX_LEN) + "...";
        }
        return text;
    }
}
