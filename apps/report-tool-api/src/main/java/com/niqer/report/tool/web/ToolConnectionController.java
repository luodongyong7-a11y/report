package com.niqer.report.tool.web;

import com.niqer.report.tool.connection.FileReportConnectionRegistry;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/report/tool/connections")
public class ToolConnectionController {

    private final FileReportConnectionRegistry registry;

    public ToolConnectionController(FileReportConnectionRegistry registry) {
        this.registry = registry;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> list() {
        return ResponseEntity.ok(registry.listPublic());
    }

    @GetMapping("/meta/drivers")
    public ResponseEntity<List<Map<String, String>>> drivers() {
        return ResponseEntity.ok(registry.drivers());
    }

    @PutMapping
    public ResponseEntity<Map<String, Object>> upsert(@RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(registry.upsert(body));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        registry.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/test")
    public ResponseEntity<Map<String, Object>> test(@RequestBody Map<String, Object> body) {
        registry.test(body);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/{id}/default")
    public ResponseEntity<Map<String, Object>> setDefault(@PathVariable String id) {
        return ResponseEntity.ok(registry.setDefault(id));
    }
}
