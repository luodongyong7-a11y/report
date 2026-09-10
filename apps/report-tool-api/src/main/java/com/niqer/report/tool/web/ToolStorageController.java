package com.niqer.report.tool.web;

import com.niqer.report.tool.storage.ToolStorageService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/report/tool/storage")
public class ToolStorageController {

    private final ToolStorageService storageService;

    public ToolStorageController(ToolStorageService storageService) {
        this.storageService = storageService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> get() {
        return ResponseEntity.ok(storageService.getPublic());
    }

    @PutMapping
    public ResponseEntity<Map<String, Object>> save(@RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(storageService.save(body));
    }

    @PostMapping("/test")
    public ResponseEntity<Map<String, Object>> test(@RequestBody(required = false) Map<String, Object> body) {
        storageService.test(body);
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
