package com.niqer.report.web;

import com.niqer.report.model.ReportTemplateBinding;
import com.niqer.report.service.ReportBindingService;
import com.niqer.report.spi.ReportAuthGuard;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/report/binding")
@RequiredArgsConstructor
public class ReportBindingController {

    private final ReportBindingService bindingService;
    private final ReportAuthGuard authGuard;

    @GetMapping
    public ResponseEntity<List<Map<String, String>>> listByMenuName(@RequestParam String menuName) {
        return ResponseEntity.ok(bindingService.listTemplatesByMenuName(menuName));
    }

    @GetMapping("/all")
    public ResponseEntity<List<ReportTemplateBinding>> listAll() {
        authGuard.requireAdmin();
        return ResponseEntity.ok(bindingService.listAll());
    }

    @PostMapping
    public ResponseEntity<Void> upsert(@RequestBody ReportTemplateBinding binding) {
        authGuard.requireAdmin();
        bindingService.upsertBinding(binding);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping
    public ResponseEntity<Void> remove(@RequestBody List<String> ids) {
        authGuard.requireAdmin();
        bindingService.removeBindings(ids);
        return ResponseEntity.noContent().build();
    }
}
