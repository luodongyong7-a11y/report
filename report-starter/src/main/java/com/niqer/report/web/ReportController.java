package com.niqer.report.web;

import com.niqer.report.exception.ReportException;
import com.niqer.report.license.ReportLicenseService;
import com.niqer.report.service.ReportPreviewService;
import com.niqer.report.service.ReportRenderService;
import com.niqer.report.service.ReportSidecarClient;
import com.niqer.report.service.ReportTemplateService;
import com.niqer.report.spi.ReportAuthGuard;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.GZIPOutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import java.io.ByteArrayOutputStream;

@RestController
@RequestMapping("/report")
@RequiredArgsConstructor
public class ReportController {

    private static final Set<String> FONT_KEYS = Set.of(
            "times", "timesBd", "timesIt", "timesBi", "simsun", "simhei", "segoesym"
    );

    private final ReportTemplateService reportTemplateService;
    private final ReportPreviewService reportPreviewService;
    private final ReportRenderService reportRenderService;
    private final ReportAuthGuard authGuard;
    private final ReportLicenseService licenseService;

    @GetMapping("/mode")
    public ResponseEntity<Map<String, Object>> list(Integer pageNum, Integer pageSize) throws Exception {
        return ResponseEntity.ok(reportTemplateService.pageCodes(pageNum, pageSize));
    }

    @GetMapping("/mode/{fileName}")
    public ResponseEntity<Map<String, Object>> get(@PathVariable String fileName) throws Exception {
        String content = reportTemplateService.loadTemplateJson(fileName);
        if (content == null) throw ReportException.notFound("template not found");
        long size = content.getBytes(StandardCharsets.UTF_8).length;
        Map<String, Object> result = new HashMap<>();
        result.put("fileName", fileName);
        result.put("content", content);
        result.put("size", size);
        return ResponseEntity.ok(result);
    }

    @PutMapping("/mode/{fileName}")
    public ResponseEntity<Void> saveOrUpdate(@PathVariable String fileName, @RequestBody Map<String, String> requestBody) throws Exception {
        authGuard.requireAdmin();
        String content = requestBody.get("content");
        if (content == null) throw ReportException.badRequest("content required");
        reportTemplateService.saveOrUpdateContent(fileName, content);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/mode")
    public ResponseEntity<Void> delete(@RequestBody List<String> fileNames) throws Exception {
        authGuard.requireAdmin();
        if (fileNames == null || fileNames.isEmpty()) throw ReportException.badRequest("fileNames required");
        reportTemplateService.deleteByCodes(fileNames);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/mode/rename")
    public ResponseEntity<Void> rename(@RequestBody Map<String, String> requestBody) throws Exception {
        authGuard.requireAdmin();
        String oldFileName = requestBody.get("oldFileName");
        String newFileName = requestBody.get("newFileName");
        if (oldFileName == null || newFileName == null) throw ReportException.badRequest("rename params required");
        reportTemplateService.rename(oldFileName, newFileName);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/mode/export/batch")
    public void batchExport(@RequestBody(required = false) List<String> fileNames, HttpServletResponse response) throws Exception {
        authGuard.requireAdmin();
        List<String> exportFiles = (fileNames == null || fileNames.isEmpty())
                ? reportTemplateService.listAllTemplateCodes()
                : fileNames;
        if (exportFiles.isEmpty()) {
            response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            response.getWriter().write("{\"message\":\"no templates\"}");
            return;
        }
        if (exportFiles.size() == 1) {
            String fileName = exportFiles.getFirst();
            byte[] content = reportTemplateService.exportEnvelope(fileName);
            if (content == null) {
                response.setStatus(HttpServletResponse.SC_NOT_FOUND);
                response.getWriter().write("{\"message\":\"not found\"}");
                return;
            }
            String encodedFileName = URLEncoder.encode(envelopeFileName(fileName), StandardCharsets.UTF_8);
            response.setContentType("application/octet-stream");
            response.setHeader("Content-Disposition", "attachment; filename=" + encodedFileName + "; filename*=UTF-8''" + encodedFileName);
            response.getOutputStream().write(content);
        } else {
            String zipFileName = URLEncoder.encode("templates.zip", StandardCharsets.UTF_8);
            response.setContentType("application/zip");
            response.setHeader("Content-Disposition", "attachment; filename=" + zipFileName + "; filename*=UTF-8''" + zipFileName);
            try (ZipOutputStream zipOut = new ZipOutputStream(response.getOutputStream())) {
                for (String fileName : exportFiles) {
                    byte[] content = reportTemplateService.exportEnvelope(fileName);
                    if (content == null) continue;
                    zipOut.putNextEntry(new ZipEntry(envelopeFileName(fileName)));
                    zipOut.write(content);
                    zipOut.closeEntry();
                }
            }
        }
    }

    @PostMapping("/sql/parse")
    public ResponseEntity<Object> parseSql(@RequestBody Map<String, Object> params) {
        ReportPreviewService.ResultHolder r = reportPreviewService.parseSql(params);
        if (!r.ok()) {
            if ("DATA_NOT_FOUND".equals(r.errorMessage())) throw ReportException.notFound("data not found");
            throw ReportException.error(r.errorMessage());
        }
        return ResponseEntity.ok(r.data());
    }

    @PostMapping("/sql/preview")
    public ResponseEntity<JsonNode> preview(@RequestBody Map<String, Object> params, HttpServletRequest request) throws Exception {
        String templateId = String.valueOf(params.get("templateId"));
        String raw = reportTemplateService.loadTemplateJson(templateId);
        if (raw == null) throw ReportException.notFound("template not found");
        return ResponseEntity.ok(reportPreviewService.buildPreviewTemplate(raw, params, request));
    }

    @PostMapping("/pdf")
    public void renderPdf(@RequestBody Map<String, Object> params, HttpServletRequest request, HttpServletResponse response) throws Exception {
        writeBinary(params, request, response, true, false);
    }

    @PostMapping("/xlsx")
    public void renderXlsx(@RequestBody Map<String, Object> params, HttpServletRequest request, HttpServletResponse response) throws Exception {
        if (!licenseService.isPro()) throw ReportException.forbidden("Excel 导出需激活收费版");
        writeBinary(params, request, response, false, false);
    }

    @PostMapping("/pdf/preview")
    public void renderPdfPreview(@RequestBody Map<String, Object> params, HttpServletRequest request, HttpServletResponse response) throws Exception {
        writeBinary(params, request, response, true, true);
    }

    @PostMapping("/html/preview")
    public void renderHtmlPreview(@RequestBody Map<String, Object> params, HttpServletRequest request, HttpServletResponse response) throws Exception {
        String templateId = String.valueOf(params.get("templateId"));
        String raw = reportTemplateService.loadTemplateJson(templateId);
        if (raw == null) throw ReportException.notFound("template not found");
        JsonNode merged = reportPreviewService.buildPreviewTemplate(raw, params, request);
        byte[] bytes = reportRenderService.renderHtml(merged, !licenseService.isPro());
        String encodedName = URLEncoder.encode(templateId + "-preview.html", StandardCharsets.UTF_8);
        response.setContentType("text/html; charset=utf-8");
        response.setHeader("Content-Disposition", "inline; filename=" + encodedName + "; filename*=UTF-8''" + encodedName);
        // HTML 预览含大量重复内联 style,gzip 对带宽收益高;浏览器 XHR 会自动解压。
        if (bytes.length >= 8192 && acceptsGzip(request)) {
            byte[] gzipped = gzipBytes(bytes);
            if (gzipped != null && gzipped.length < bytes.length) {
                response.setHeader("Content-Encoding", "gzip");
                bytes = gzipped;
            }
        }
        response.setContentLength(bytes.length);
        response.getOutputStream().write(bytes);
    }

    /**
     * HTML 预览外链字体:与边车 PDF 度量/绘制同源文件。
     * 浏览器按 /report/fonts/{key} 拉取并强缓存,避免每份预览 HTML 内联数 MB base64。
     */
    @GetMapping("/fonts/{key}")
    public void font(@PathVariable String key, HttpServletResponse response) throws Exception {
        if (key == null || !FONT_KEYS.contains(key)) {
            throw ReportException.notFound("font not found");
        }
        ReportSidecarClient.BinaryResult font = reportRenderService.fetchFont(key);
        response.setContentType(font.contentType() != null ? font.contentType() : "application/octet-stream");
        response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        response.setContentLength(font.body().length);
        response.getOutputStream().write(font.body());
    }

    private static boolean acceptsGzip(HttpServletRequest request) {
        String accept = request.getHeader("Accept-Encoding");
        if (accept == null || accept.isEmpty()) return false;
        String[] parts = accept.split(",");
        for (String part : parts) {
            String token = part.trim();
            int sc = token.indexOf(';');
            if (sc >= 0) token = token.substring(0, sc).trim();
            if ("gzip".equalsIgnoreCase(token)) return true;
        }
        return false;
    }

    private static byte[] gzipBytes(byte[] data) {
        ByteArrayOutputStream bos = new ByteArrayOutputStream(Math.max(64, data.length / 2));
        try (GZIPOutputStream gz = new GZIPOutputStream(bos)) {
            gz.write(data);
        } catch (Exception e) {
            return null;
        }
        return bos.toByteArray();
    }

    private void writeBinary(Map<String, Object> params, HttpServletRequest request, HttpServletResponse response,
                             boolean pdf, boolean preview) throws Exception {
        String templateId = String.valueOf(params.get("templateId"));
        String raw = reportTemplateService.loadTemplateJson(templateId);
        if (raw == null) throw ReportException.notFound("template not found");
        JsonNode merged = preview
                ? reportPreviewService.buildPreviewTemplate(raw, params, request)
                : reportPreviewService.buildRenderTemplate(raw, params, request);
        boolean watermark = pdf && !licenseService.isPro();
        byte[] bytes = pdf ? reportRenderService.renderPdf(merged, watermark) : reportRenderService.renderXlsx(merged);
        String suffix = pdf ? (preview ? "-preview.pdf" : ".pdf") : ".xlsx";
        String encodedName = URLEncoder.encode(templateId + suffix, StandardCharsets.UTF_8);
        response.setContentType(pdf
                ? "application/pdf"
                : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        String disposition = pdf ? "inline" : "attachment";
        response.setHeader("Content-Disposition", disposition + "; filename=" + encodedName + "; filename*=UTF-8''" + encodedName);
        response.setContentLength(bytes.length);
        response.getOutputStream().write(bytes);
    }

    @GetMapping("/sql/schema")
    public ResponseEntity<Map<String, List<String>>> sqlSchema() {
        authGuard.requireAdmin();
        return ResponseEntity.ok(reportPreviewService.listSqlSchema());
    }

    @PostMapping("/dataset/api-fetch")
    public ResponseEntity<JsonNode> fetchApi(@RequestBody Map<String, Object> params, HttpServletRequest request) {
        authGuard.requireAdmin();
        return ResponseEntity.ok(reportPreviewService.fetchDesignerApi(params, request));
    }

    private static String envelopeFileName(String id) {
        String name = id == null ? "" : id;
        int slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        if (slash >= 0) name = name.substring(slash + 1);
        if (name.isBlank()) name = "template";
        if (name.toLowerCase(Locale.ROOT).endsWith(".nqt")) return name;
        return name + ".nqt";
    }
}
