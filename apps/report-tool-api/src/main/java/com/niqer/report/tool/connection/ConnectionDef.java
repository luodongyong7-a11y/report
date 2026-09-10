package com.niqer.report.tool.connection;

public class ConnectionDef {

    private String id;
    private String name;
    private String dialect;
    private String jdbcUrl;
    private String username;
    private boolean defaultConnection;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDialect() { return dialect; }
    public void setDialect(String dialect) { this.dialect = dialect; }
    public String getJdbcUrl() { return jdbcUrl; }
    public void setJdbcUrl(String jdbcUrl) { this.jdbcUrl = jdbcUrl; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public boolean isDefaultConnection() { return defaultConnection; }
    public void setDefaultConnection(boolean defaultConnection) { this.defaultConnection = defaultConnection; }
}
