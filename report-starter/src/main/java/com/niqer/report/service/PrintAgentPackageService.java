package com.niqer.report.service;

import com.niqer.report.config.ReportProperties;
import com.niqer.report.exception.ReportException;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

public class PrintAgentPackageService {

    private final ReportProperties properties;

    public PrintAgentPackageService(ReportProperties properties) {
        this.properties = properties;
    }

    public String resolvePlatform(String platform, String userAgent) {
        String p = platform == null ? "" : platform.trim().toLowerCase(Locale.ROOT);
        if (!p.isEmpty()) {
            return normalize(p);
        }
        String ua = userAgent == null ? "" : userAgent.toLowerCase(Locale.ROOT);
        if (ua.contains("windows")) return "windows-x64";
        if (ua.contains("mac os") || ua.contains("macintosh")) {
            if (ua.contains("arm") || ua.contains("aarch64")) return "macos-aarch64";
            return "macos-x64";
        }
        if (ua.contains("linux")) return "linux-x64";
        return "windows-x64";
    }

    private String normalize(String p) {
        return switch (p) {
            case "win", "windows", "windows-x64", "win32", "win64" -> "windows-x64";
            case "mac", "macos", "macos-x64", "darwin", "darwin-x64" -> "macos-x64";
            case "macos-arm64", "macos-aarch64", "darwin-arm64", "darwin-aarch64" -> "macos-aarch64";
            case "linux", "linux-x64" -> "linux-x64";
            default -> throw ReportException.badRequest("unsupported platform: " + p);
        };
    }

    private String configuredPath(String platformKey) {
        ReportProperties.PrintAgent cfg = properties.getPrintAgent();
        return switch (platformKey) {
            case "windows-x64" -> cfg.getWindowsX64Path();
            case "macos-x64" -> cfg.getMacosX64Path();
            case "macos-aarch64" -> cfg.getMacosAarch64Path();
            case "linux-x64" -> cfg.getLinuxX64Path();
            default -> throw ReportException.badRequest("unsupported platform: " + platformKey);
        };
    }

    public Resource resolveResource(String platformKey) {
        String configured = configuredPath(platformKey);
        if (configured == null || configured.isBlank()) {
            throw ReportException.notFound("print agent package not configured");
        }
        if (configured.startsWith("classpath:")) {
            String loc = configured.substring("classpath:".length());
            while (loc.startsWith("/")) loc = loc.substring(1);
            ClassPathResource cpr = new ClassPathResource(loc);
            if (!cpr.exists()) {
                throw ReportException.notFound("print agent package not found on classpath: " + loc);
            }
            return cpr;
        }
        Path path = Path.of(configured).toAbsolutePath().normalize();
        if (!Files.isRegularFile(path)) {
            // Fall back to classpath convention for Docker/jar deployments.
            String fallback = "print-agent/tk-print-agent-" + platformKey + ".zip";
            ClassPathResource cpr = new ClassPathResource(fallback);
            if (cpr.exists()) {
                return cpr;
            }
            throw ReportException.notFound("print agent package not found: " + path);
        }
        return new FileSystemResource(path);
    }

    public Map<String, Object> info(String platform, String userAgent) {
        String key = resolvePlatform(platform, userAgent);
        Resource res = resolveResource(key);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("platform", key);
        out.put("version", properties.getPrintAgent().getVersion());
        out.put("fileName", downloadFileName(key));
        try {
            out.put("size", res.contentLength());
        } catch (IOException e) {
            out.put("size", -1);
        }
        return out;
    }

    public Resource resource(String platform, String userAgent) {
        return resolveResource(resolvePlatform(platform, userAgent));
    }

    public String downloadFileName(String platform, String userAgent) {
        return downloadFileName(resolvePlatform(platform, userAgent));
    }

    private String downloadFileName(String platformKey) {
        String configured = configuredPath(platformKey);
        if (configured != null && !configured.isBlank()) {
            String name = configured.replace('\\', '/');
            int slash = name.lastIndexOf('/');
            if (slash >= 0) name = name.substring(slash + 1);
            if (name.startsWith("classpath:")) name = name.substring("classpath:".length());
            if (!name.isBlank()) return name;
        }
        return "tk-print-agent-" + platformKey + ".zip";
    }
}
