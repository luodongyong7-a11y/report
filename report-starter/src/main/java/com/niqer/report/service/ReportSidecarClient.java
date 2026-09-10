package com.niqer.report.service;

import com.niqer.report.exception.ReportException;
import com.niqer.report.config.ReportProperties;
import lombok.extern.slf4j.Slf4j;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.zip.GZIPOutputStream;

@Slf4j
public class ReportSidecarClient {

    private final ReportProperties.Pdf pdf;
    private HttpClient httpClient;

    public ReportSidecarClient(ReportProperties properties) {
        this.pdf = properties.getPdf();
    }

    private HttpClient client() {
        if (httpClient == null) {
            httpClient = HttpClient.newBuilder()
                    .version(HttpClient.Version.HTTP_1_1)
                    .connectTimeout(Duration.ofMillis(pdf.getConnectTimeoutMs()))
                    .build();
        }
        return httpClient;
    }

    public byte[] render(String url, String json) {
        return render(url, json, false);
    }

    public byte[] render(String url, String json, boolean watermark) {
        byte[] raw = json.getBytes(StandardCharsets.UTF_8);
        byte[] body = raw;
        boolean gzip = false;
        if (pdf.isGzip() && raw.length >= pdf.getGzipMinBytes()) {
            byte[] compressed = tryGzip(raw);
            if (compressed != null) {
                body = compressed;
                gzip = true;
            }
        }

        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofMillis(pdf.getTimeoutMs()))
                .header("Content-Type", "application/json");
        if (watermark) {
            builder.header("X-Report-Watermark", "1");
        }
        if (gzip) {
            builder.header("Content-Encoding", "gzip");
        }
        HttpRequest request = builder.POST(HttpRequest.BodyPublishers.ofByteArray(body)).build();
        return sendWithRetry(request, "report engine");
    }

    public record BinaryResult(byte[] body, String contentType) {}

    /** GET 并保留 Content-Type(字体代理用)。 */
    public BinaryResult getBinary(String url) {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofMillis(pdf.getTimeoutMs()))
                .GET()
                .build();
        int maxAttempts = Math.max(1, pdf.getRetries() + 1);
        ReportException lastError = null;
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                HttpResponse<byte[]> resp = client().send(request, HttpResponse.BodyHandlers.ofByteArray());
                int status = resp.statusCode();
                if (status == 200) {
                    byte[] bytes = resp.body();
                    if (bytes == null || bytes.length == 0) {
                        throw ReportException.error("report engine returned empty body");
                    }
                    String ct = resp.headers().firstValue("content-type").orElse("application/octet-stream");
                    return new BinaryResult(bytes, ct);
                }
                if (status >= 400 && status < 500) {
                    throw ReportException.error("report engine HTTP " + status + ": " + safeBody(resp.body()));
                }
                lastError = ReportException.error("report engine HTTP " + status + ": " + safeBody(resp.body()));
            } catch (ReportException e) {
                throw e;
            } catch (Exception e) {
                lastError = ReportException.error("report engine unreachable: " + e.getMessage());
            }
            if (attempt < maxAttempts) {
                log.warn("report sidecar GET failed ({}/{}), retry: {}", attempt, maxAttempts,
                        lastError != null ? lastError.getMessage() : "");
                sleepBackoff(attempt);
            }
        }
        throw lastError != null ? lastError : ReportException.error("report engine GET failed");
    }

    private byte[] sendWithRetry(HttpRequest request, String label) {
        int maxAttempts = Math.max(1, pdf.getRetries() + 1);
        ReportException lastError = null;
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                HttpResponse<byte[]> resp = client().send(request, HttpResponse.BodyHandlers.ofByteArray());
                int status = resp.statusCode();
                if (status == 200) {
                    byte[] bytes = resp.body();
                    if (bytes == null || bytes.length == 0) {
                        throw ReportException.error(label + " returned empty body");
                    }
                    return bytes;
                }
                if (status >= 400 && status < 500) {
                    throw ReportException.error(label + " HTTP " + status + ": " + safeBody(resp.body()));
                }
                lastError = ReportException.error(label + " HTTP " + status + ": " + safeBody(resp.body()));
            } catch (ReportException e) {
                throw e;
            } catch (Exception e) {
                lastError = ReportException.error(label + " unreachable: " + e.getMessage());
            }
            if (attempt < maxAttempts) {
                log.warn("report sidecar call failed ({}/{}), retry: {}", attempt, maxAttempts,
                        lastError != null ? lastError.getMessage() : "");
                sleepBackoff(attempt);
            }
        }
        throw lastError != null ? lastError : ReportException.error(label + " call failed");
    }

    private void sleepBackoff(int attempt) {
        try {
            Thread.sleep(Math.min(2000L, 200L * attempt));
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
    }

    private static byte[] tryGzip(byte[] data) {
        ByteArrayOutputStream bos = new ByteArrayOutputStream(Math.max(64, data.length / 2));
        try (GZIPOutputStream gz = new GZIPOutputStream(bos)) {
            gz.write(data);
        } catch (Exception e) {
            return null;
        }
        return bos.toByteArray();
    }

    private static String safeBody(byte[] body) {
        if (body == null || body.length == 0) {
            return "";
        }
        String s = new String(body, StandardCharsets.UTF_8);
        return s.length() > 500 ? s.substring(0, 500) : s;
    }
}
