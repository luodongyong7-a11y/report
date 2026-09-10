package com.niqer.report.web;

import com.niqer.report.license.ReportLicenseService;
import com.niqer.report.spi.ReportAuthGuard;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/report/license")
@RequiredArgsConstructor
public class ReportLicenseController {

    private final ReportLicenseService licenseService;
    private final ReportAuthGuard authGuard;

    @GetMapping
    public ResponseEntity<Map<String, Object>> status() {
        authGuard.requireAdmin();
        return ResponseEntity.ok(toMap(licenseService.status()));
    }

    private static Map<String, Object> toMap(ReportLicenseService.LicenseStatus status) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("edition", status.edition());
        out.put("sub", status.sub() == null ? "" : status.sub());
        out.put("exp", status.exp());
        out.put("active", status.active());
        return out;
    }
}
