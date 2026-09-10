package com.niqer.report.tool.web;

import com.niqer.report.exception.ReportException;
import com.niqer.report.tool.ReportToolProperties;
import com.niqer.report.tool.auth.AuthHolder;
import com.niqer.report.tool.auth.AuthPrincipal;
import com.niqer.report.tool.auth.JwtService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class AuthController {

    private final ReportToolProperties properties;
    private final JwtService jwtService;

    public AuthController(ReportToolProperties properties, JwtService jwtService) {
        this.properties = properties;
        this.jwtService = jwtService;
    }

    @PostMapping("/auth/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody Map<String, Object> body) {
        String username = body == null || body.get("username") == null ? "" : String.valueOf(body.get("username"));
        String password = body == null || body.get("password") == null ? "" : String.valueOf(body.get("password"));
        if (!safeEq(username, properties.getAdminUsername()) || !safeEq(password, properties.getAdminPassword())) {
            throw ReportException.of(40100, "unauthorized");
        }
        Map<String, Object> user = userMap(username);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("token", jwtService.issue(username));
        out.put("user", user);
        return ResponseEntity.ok(out);
    }

    @GetMapping("/auth/me")
    public ResponseEntity<Map<String, Object>> me() {
        AuthPrincipal p = AuthHolder.require();
        return ResponseEntity.ok(userMap(p.username()));
    }

    private static Map<String, Object> userMap(String username) {
        Map<String, Object> user = new LinkedHashMap<>();
        user.put("username", username);
        user.put("displayName", username);
        return user;
    }

    private static boolean safeEq(String a, String b) {
        byte[] left = (a == null ? "" : a).getBytes(StandardCharsets.UTF_8);
        byte[] right = (b == null ? "" : b).getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(left, right);
    }
}
