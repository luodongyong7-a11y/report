package com.niqer.report.service;

import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.niqer.report.config.ReportProperties;

@RequiredArgsConstructor
public class ReportRenderService {

    private final ObjectMapper objectMapper;
    private final ReportSidecarClient sidecarClient;
    private final ReportProperties properties;

    public byte[] renderPdf(JsonNode mergedTemplate) {
        return renderPdf(mergedTemplate, false);
    }

    public byte[] renderPdf(JsonNode mergedTemplate, boolean watermark) {
        String json = objectMapper.writeValueAsString(mergedTemplate);
        return sidecarClient.render(properties.getPdf().getSidecarUrl(), json, watermark);
    }

    public byte[] renderXlsx(JsonNode mergedTemplate) {
        String json = objectMapper.writeValueAsString(mergedTemplate);
        return sidecarClient.render(resolveXlsxUrl(), json, false);
    }

    public byte[] renderHtml(JsonNode mergedTemplate) {
        return renderHtml(mergedTemplate, false);
    }

    public byte[] renderHtml(JsonNode mergedTemplate, boolean watermark) {
        String json = objectMapper.writeValueAsString(mergedTemplate);
        return sidecarClient.render(resolveHtmlUrl(), json, watermark);
    }

    public ReportSidecarClient.BinaryResult fetchFont(String key) {
        return sidecarClient.getBinary(resolveFontUrl(key));
    }

    private String resolveXlsxUrl() {
        String override = properties.getPdf().getSidecarXlsxUrl();
        if (StringUtils.hasText(override)) return override;
        return deriveSidecarSiblingUrl("/xlsx");
    }

    private String resolveHtmlUrl() {
        String override = properties.getPdf().getSidecarHtmlUrl();
        if (StringUtils.hasText(override)) return override;
        return deriveSidecarSiblingUrl("/html");
    }

    private String resolveFontUrl(String key) {
        return deriveSidecarOriginUrl("/fonts/" + key);
    }

    private String deriveSidecarSiblingUrl(String suffix) {
        String base = properties.getPdf().getSidecarUrl();
        if (base == null) base = "";
        base = base.trim();
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        return base + suffix;
    }

    /** 从 sidecarUrl(…/render) 推导边车根路径下的资源,如 /fonts/times。 */
    private String deriveSidecarOriginUrl(String absolutePath) {
        String base = properties.getPdf().getSidecarUrl();
        if (base == null) base = "";
        base = base.trim();
        int scheme = base.indexOf("://");
        int pathStart = scheme >= 0 ? base.indexOf('/', scheme + 3) : base.indexOf('/');
        String origin = pathStart >= 0 ? base.substring(0, pathStart) : base;
        if (origin.endsWith("/")) origin = origin.substring(0, origin.length() - 1);
        String path = absolutePath.startsWith("/") ? absolutePath : "/" + absolutePath;
        return origin + path;
    }
}
