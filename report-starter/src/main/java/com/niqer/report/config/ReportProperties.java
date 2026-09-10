package com.niqer.report.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "report")
public class ReportProperties {

    private Storage storage = new Storage();
    private Pdf pdf = new Pdf();
    private Sql sql = new Sql();
    private Api api = new Api();
    private Auth auth = new Auth();
    private PrintAgent printAgent = new PrintAgent();
    private License license = new License();
    private Crypto crypto = new Crypto();

    @Data
    public static class Storage {
        private String type = "minio";
        private String endpoint;
        private String accessKey;
        private String secretKey;
        private String bucket = "report";
        private boolean secure = false;
        private String prefix = "reports/";
    }

    @Data
    public static class Pdf {
        private String sidecarUrl = "http://127.0.0.1:7321/render";
        private String sidecarXlsxUrl = "";
        private String sidecarHtmlUrl = "";
        private int timeoutMs = 60000;
        private int connectTimeoutMs = 3000;
        private int retries = 2;
        private boolean gzip = true;
        private int gzipMinBytes = 8192;
        private int maxRows = 100000;
        private int sqlTimeoutMs = 30000;
    }

    @Data
    public static class Sql {
        private int previewTimeoutMs = 5000;
    }

    @Data
    public static class Api {
        private boolean throughGateway = false;
        private String allowedUrlPrefixes = "";
        /** 独立工具等与业务 /api 不同源时，/api 内部转发用这个原点；空则用当前请求的 origin */
        private String internalBaseUrl = "";
    }

    @Data
    public static class Auth {
        private boolean enforceAdmin = true;
    }

    /**
     * Hosted print-agent binaries (direct exe/bin download). Paths may be absolute or classpath:.
     */
    @Data
    public static class PrintAgent {
        private String version = "0.1.0";
        /** Prefer classpath: for jar/Docker; filesystem paths also work (dev). */
        /** Zip (not bare .exe): browsers/SmartScreen often block unsigned exe downloads. */
        private String windowsX64Path = "classpath:print-agent/tk-print-agent-windows-x64.zip";
        private String macosX64Path = "classpath:print-agent/tk-print-agent-macos-x64.zip";
        private String macosAarch64Path = "classpath:print-agent/tk-print-agent-macos-aarch64.zip";
        private String linuxX64Path = "classpath:print-agent/tk-print-agent-linux-x64.zip";
    }

    @Data
    public static class License {
        /** 授权码正文（独立工具与嵌入宿主的 application.yml / 环境变量都写这里） */
        private String key = "";
        /** 授权码文件路径；文件存在且有效时优先于 key */
        private String file = "";
    }

    @Data
    public static class Crypto {
        private String secret = "";
    }
}
