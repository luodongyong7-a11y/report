package com.niqer.report.tool.connection;

import com.niqer.report.exception.ReportException;
import com.niqer.report.spi.ReportConnectionRegistry;
import com.niqer.report.spi.ReportSqlExecutor;
import com.niqer.report.sql.JdbcReportSqlExecutor;
import com.niqer.report.sql.ReportSqlDialects;
import com.niqer.report.tool.ReportToolProperties;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class FileReportConnectionRegistry implements ReportConnectionRegistry {

    private final Path connectionsFile;
    private final Path secretsFile;
    private final ObjectMapper objectMapper;
    private final ReportSqlExecutor fallback;
    private final Map<String, HikariDataSource> pools = new ConcurrentHashMap<>();
    private final Map<String, ReportSqlExecutor> executors = new ConcurrentHashMap<>();

    public FileReportConnectionRegistry(ReportToolProperties properties,
                                        ObjectMapper objectMapper,
                                        ReportSqlExecutor fallback) {
        Path dir = Path.of(properties.getDataDir()).toAbsolutePath().normalize();
        try {
            Files.createDirectories(dir);
        } catch (Exception e) {
            throw new IllegalStateException("cannot create data dir", e);
        }
        this.connectionsFile = dir.resolve("connections.json");
        this.secretsFile = dir.resolve("connections.secrets.json");
        this.objectMapper = objectMapper;
        this.fallback = fallback;
    }

    @Override
    public synchronized ReportSqlExecutor require(String dbName) {
        ConnectionDef def = resolve(dbName, false);
        if (def == null) {
            return fallback;
        }
        return executorOf(def);
    }

    @Override
    public synchronized String dialect(String dbName) {
        ConnectionDef def = resolve(dbName, false);
        if (def == null) {
            return "h2";
        }
        return ReportSqlDialects.normalize(def.getDialect());
    }

    public synchronized List<Map<String, Object>> listPublic() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (ConnectionDef def : loadDefs()) {
            out.add(toPublic(def));
        }
        return out;
    }

    public synchronized Map<String, Object> upsert(Map<String, Object> body) {
        String id = text(body, "id");
        String name = text(body, "name");
        String dialect = text(body, "dialect");
        String jdbcUrl = text(body, "jdbcUrl");
        String username = text(body, "username");
        String password = text(body, "password");
        if (id == null || !id.matches("[a-zA-Z][a-zA-Z0-9_\\-]{0,63}")) {
            throw ReportException.badRequest("id required");
        }
        if (name == null) {
            throw ReportException.badRequest("name required");
        }
        if (dialect == null) {
            throw ReportException.badRequest("dialect required");
        }
        if (jdbcUrl == null) {
            throw ReportException.badRequest("jdbcUrl required");
        }
        List<ConnectionDef> defs = loadDefs();
        Map<String, String> secrets = loadSecrets();
        ConnectionDef existing = defs.stream().filter(d -> id.equals(d.getId())).findFirst().orElse(null);
        ConnectionDef def = existing == null ? new ConnectionDef() : existing;
        def.setId(id);
        def.setName(name);
        def.setDialect(ReportSqlDialects.normalize(dialect));
        def.setJdbcUrl(jdbcUrl);
        def.setUsername(username == null ? "" : username);
        boolean makeDefault = bool(body, "default") || defs.isEmpty();
        if (makeDefault) {
            for (ConnectionDef item : defs) {
                item.setDefaultConnection(false);
            }
            def.setDefaultConnection(true);
        }
        if (existing == null) {
            defs.add(def);
        }
        if (password != null && !password.isBlank()) {
            secrets.put(id, password);
        } else if (!secrets.containsKey(id)) {
            secrets.put(id, "");
        }
        saveDefs(defs);
        saveSecrets(secrets);
        evict(id);
        return toPublic(def);
    }

    public synchronized void delete(String id) {
        if (id == null || id.isBlank()) {
            throw ReportException.badRequest("id required");
        }
        List<ConnectionDef> defs = loadDefs();
        boolean removed = defs.removeIf(d -> id.equals(d.getId()));
        if (!removed) {
            throw ReportException.notFound("connection not found");
        }
        if (defs.stream().noneMatch(ConnectionDef::isDefaultConnection) && !defs.isEmpty()) {
            defs.getFirst().setDefaultConnection(true);
        }
        Map<String, String> secrets = loadSecrets();
        secrets.remove(id);
        saveDefs(defs);
        saveSecrets(secrets);
        evict(id);
    }

    public synchronized Map<String, Object> setDefault(String id) {
        List<ConnectionDef> defs = loadDefs();
        ConnectionDef found = null;
        for (ConnectionDef def : defs) {
            boolean match = id.equals(def.getId());
            def.setDefaultConnection(match);
            if (match) {
                found = def;
            }
        }
        if (found == null) {
            throw ReportException.notFound("connection not found");
        }
        saveDefs(defs);
        return toPublic(found);
    }

    public void test(Map<String, Object> body) {
        String jdbcUrl = text(body, "jdbcUrl");
        if (jdbcUrl == null) {
            throw ReportException.badRequest("jdbcUrl required");
        }
        String username = text(body, "username");
        String password = text(body, "password");
        if ((password == null || password.isBlank()) && body.get("id") != null) {
            password = loadSecrets().get(String.valueOf(body.get("id")));
        }
        try (Connection ignored = DriverManager.getConnection(jdbcUrl, username == null ? "" : username,
                password == null ? "" : password)) {
            // opened
        } catch (Exception e) {
            throw ReportException.badRequest(root(e));
        }
    }

    public List<Map<String, String>> drivers() {
        return List.of(
                Map.of("id", "postgresql", "dialect", "postgres", "driver", "org.postgresql.Driver",
                        "urlExample", "jdbc:postgresql://host:5432/db"),
                Map.of("id", "mysql", "dialect", "mysql", "driver", "com.mysql.cj.jdbc.Driver",
                        "urlExample", "jdbc:mysql://host:3306/db"),
                Map.of("id", "sqlserver", "dialect", "sqlserver", "driver", "com.microsoft.sqlserver.jdbc.SQLServerDriver",
                        "urlExample", "jdbc:sqlserver://host:1433;databaseName=db"),
                Map.of("id", "h2", "dialect", "h2", "driver", "org.h2.Driver",
                        "urlExample", "jdbc:h2:file:./data/demo")
        );
    }

    private ConnectionDef resolve(String dbName, boolean required) {
        List<ConnectionDef> defs = loadDefs();
        if (dbName == null || dbName.isBlank() || "null".equals(dbName)) {
            ConnectionDef def = defs.stream().filter(ConnectionDef::isDefaultConnection).findFirst()
                    .orElse(defs.isEmpty() ? null : defs.getFirst());
            if (def == null && required) {
                throw ReportException.badRequest("no datasource");
            }
            return def;
        }
        ConnectionDef def = defs.stream().filter(d -> dbName.equals(d.getId())).findFirst().orElse(null);
        if (def == null && required) {
            throw ReportException.badRequest("unknown datasource: " + dbName);
        }
        if (def == null) {
            throw ReportException.badRequest("unknown datasource: " + dbName);
        }
        return def;
    }

    private ReportSqlExecutor executorOf(ConnectionDef def) {
        return executors.computeIfAbsent(def.getId(), id -> {
            HikariConfig cfg = new HikariConfig();
            cfg.setJdbcUrl(def.getJdbcUrl());
            cfg.setUsername(def.getUsername() == null ? "" : def.getUsername());
            cfg.setPassword(loadSecrets().getOrDefault(id, ""));
            cfg.setMaximumPoolSize(3);
            cfg.setMinimumIdle(0);
            cfg.setConnectionTimeout(8_000);
            cfg.setPoolName("report-ds-" + id);
            HikariDataSource ds = new HikariDataSource(cfg);
            pools.put(id, ds);
            return new JdbcReportSqlExecutor(new JdbcTemplate(ds));
        });
    }

    private void evict(String id) {
        executors.remove(id);
        HikariDataSource ds = pools.remove(id);
        if (ds != null) {
            ds.close();
        }
    }

    private List<ConnectionDef> loadDefs() {
        if (!Files.isRegularFile(connectionsFile)) {
            return new ArrayList<>();
        }
        try {
            JsonNode root = objectMapper.readTree(Files.readAllBytes(connectionsFile));
            List<ConnectionDef> out = new ArrayList<>();
            if (root != null && root.isArray()) {
                for (JsonNode n : root) {
                    if (n == null || !n.isObject()) continue;
                    ConnectionDef def = new ConnectionDef();
                    def.setId(textNode(n, "id"));
                    def.setName(textNode(n, "name"));
                    def.setDialect(textNode(n, "dialect"));
                    def.setJdbcUrl(textNode(n, "jdbcUrl"));
                    def.setUsername(textNode(n, "username"));
                    JsonNode d = n.get("default");
                    def.setDefaultConnection(d != null && d.isBoolean() && d.asBoolean());
                    if (def.getId() != null) {
                        out.add(def);
                    }
                }
            }
            return out;
        } catch (Exception e) {
            throw ReportException.error("load connections failed");
        }
    }

    private void saveDefs(List<ConnectionDef> defs) {
        try {
            ArrayNode arr = objectMapper.createArrayNode();
            for (ConnectionDef def : defs) {
                ObjectNode n = objectMapper.createObjectNode();
                n.put("id", def.getId());
                n.put("name", def.getName());
                n.put("dialect", def.getDialect());
                n.put("jdbcUrl", def.getJdbcUrl());
                n.put("username", def.getUsername() == null ? "" : def.getUsername());
                n.put("default", def.isDefaultConnection());
                arr.add(n);
            }
            Files.writeString(connectionsFile, objectMapper.writeValueAsString(arr));
        } catch (Exception e) {
            throw ReportException.error("save connections failed");
        }
    }

    private Map<String, String> loadSecrets() {
        Map<String, String> out = new LinkedHashMap<>();
        if (!Files.isRegularFile(secretsFile)) {
            return out;
        }
        try {
            JsonNode root = objectMapper.readTree(Files.readAllBytes(secretsFile));
            if (root != null && root.isObject()) {
                ObjectNode obj = (ObjectNode) root;
                for (String key : obj.propertyNames()) {
                    JsonNode v = obj.get(key);
                    out.put(key, v == null || v.isNull() ? "" : v.asString());
                }
            }
        } catch (Exception e) {
            throw ReportException.error("load connection secrets failed");
        }
        return out;
    }

    private void saveSecrets(Map<String, String> secrets) {
        try {
            Files.writeString(secretsFile, objectMapper.writeValueAsString(secrets));
        } catch (Exception e) {
            throw ReportException.error("save connection secrets failed");
        }
    }

    private static Map<String, Object> toPublic(ConnectionDef def) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", def.getId());
        m.put("name", def.getName());
        m.put("dialect", def.getDialect());
        m.put("jdbcUrl", def.getJdbcUrl());
        m.put("username", def.getUsername());
        m.put("default", def.isDefaultConnection());
        return m;
    }

    private static String text(Map<String, Object> body, String key) {
        Object v = body == null ? null : body.get(key);
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() || "null".equals(s) ? null : s;
    }

    private static boolean bool(Map<String, Object> body, String key) {
        Object v = body == null ? null : body.get(key);
        if (v instanceof Boolean b) return b;
        return v != null && Boolean.parseBoolean(String.valueOf(v));
    }

    private static String textNode(JsonNode n, String key) {
        JsonNode v = n.get(key);
        if (v == null || v.isNull()) return null;
        String s = v.asString();
        return s == null || s.isBlank() ? null : s;
    }

    private static String root(Throwable e) {
        Throwable cur = e;
        while (cur.getCause() != null && cur.getCause() != cur) {
            cur = cur.getCause();
        }
        String msg = cur.getMessage();
        return msg == null || msg.isBlank() ? cur.getClass().getSimpleName() : msg;
    }
}
