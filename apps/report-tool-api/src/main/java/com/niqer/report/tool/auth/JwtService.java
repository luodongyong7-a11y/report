package com.niqer.report.tool.auth;

import com.niqer.report.exception.ReportException;
import com.niqer.report.tool.ReportToolProperties;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

public class JwtService {

    private final byte[] secret;
    private final long ttlMs;

    public JwtService(ReportToolProperties properties) {
        this.secret = properties.getJwtSecret().getBytes(StandardCharsets.UTF_8);
        this.ttlMs = properties.getJwtTtlMs();
    }

    public String issue(String username) {
        long exp = System.currentTimeMillis() + ttlMs;
        String payload = username + "|" + exp;
        return b64(payload.getBytes(StandardCharsets.UTF_8)) + "." + sign(payload);
    }

    public String parseUsername(String token) {
        if (token == null || token.isBlank()) {
            throw ReportException.of(40100, "unauthorized");
        }
        int dot = token.indexOf('.');
        if (dot <= 0 || dot == token.length() - 1) {
            throw ReportException.of(40100, "unauthorized");
        }
        String payloadB64 = token.substring(0, dot);
        String sig = token.substring(dot + 1);
        String payload;
        try {
            payload = new String(Base64.getUrlDecoder().decode(payloadB64), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            throw ReportException.of(40100, "unauthorized");
        }
        if (!MessageDigest.isEqual(sign(payload).getBytes(StandardCharsets.UTF_8), sig.getBytes(StandardCharsets.UTF_8))) {
            throw ReportException.of(40100, "unauthorized");
        }
        int sep = payload.lastIndexOf('|');
        if (sep <= 0) {
            throw ReportException.of(40100, "unauthorized");
        }
        long exp;
        try {
            exp = Long.parseLong(payload.substring(sep + 1));
        } catch (NumberFormatException e) {
            throw ReportException.of(40100, "unauthorized");
        }
        if (exp < System.currentTimeMillis()) {
            throw ReportException.of(40100, "unauthorized");
        }
        String username = payload.substring(0, sep);
        if (username.isBlank()) {
            throw ReportException.of(40100, "unauthorized");
        }
        return username;
    }

    private String sign(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return b64(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("hmac failed", e);
        }
    }

    private static String b64(byte[] raw) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }
}
