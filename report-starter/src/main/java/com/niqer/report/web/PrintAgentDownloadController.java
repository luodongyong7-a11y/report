package com.niqer.report.web;

import com.niqer.report.service.PrintAgentPackageService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@RestController
@RequestMapping("/report/print-agent")
@RequiredArgsConstructor
public class PrintAgentDownloadController {

    private final PrintAgentPackageService printAgentPackageService;

    @GetMapping("/info")
    public ResponseEntity<Map<String, Object>> info(
            @RequestParam(required = false) String platform,
            HttpServletRequest request) {
        return ResponseEntity.ok(printAgentPackageService.info(platform, request.getHeader("User-Agent")));
    }

    @GetMapping("/download")
    public ResponseEntity<Resource> download(
            @RequestParam(required = false) String platform,
            HttpServletRequest request) {
        String ua = request.getHeader("User-Agent");
        Resource resource = printAgentPackageService.resource(platform, ua);
        String fileName = printAgentPackageService.downloadFileName(platform, ua);
        String encoded = URLEncoder.encode(fileName, StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=" + encoded + "; filename*=UTF-8''" + encoded)
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(resource);
    }
}
