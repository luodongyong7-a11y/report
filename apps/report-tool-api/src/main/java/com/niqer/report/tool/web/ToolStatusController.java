package com.niqer.report.tool.web;

import com.niqer.report.tool.auth.AuthHolder;
import com.niqer.report.tool.storage.ToolStorageService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class ToolStatusController {

    private final ToolStorageService storageService;

    public ToolStatusController(ToolStorageService storageService) {
        this.storageService = storageService;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @GetMapping("/report/tool/status")
    public ResponseEntity<Map<String, Object>> status() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("dataDir", storageService.dataDir().toString());
        out.put("username", AuthHolder.require().username());
        return ResponseEntity.ok(out);
    }
}
