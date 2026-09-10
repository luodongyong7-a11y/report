package com.niqer.report.tool;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "report.tool")
public class ReportToolProperties {

    private String dataDir = "./data";
    private String adminUsername = "admin";
    private String adminPassword = "admin123";
    private String jwtSecret = "report-tool-dev-jwt-secret-change-me";
    private long jwtTtlMs = 86_400_000L;

    public String getDataDir() { return dataDir; }
    public void setDataDir(String dataDir) { this.dataDir = dataDir; }
    public String getAdminUsername() { return adminUsername; }
    public void setAdminUsername(String adminUsername) { this.adminUsername = adminUsername; }
    public String getAdminPassword() { return adminPassword; }
    public void setAdminPassword(String adminPassword) { this.adminPassword = adminPassword; }
    public String getJwtSecret() { return jwtSecret; }
    public void setJwtSecret(String jwtSecret) { this.jwtSecret = jwtSecret; }
    public long getJwtTtlMs() { return jwtTtlMs; }
    public void setJwtTtlMs(long jwtTtlMs) { this.jwtTtlMs = jwtTtlMs; }
}
