package com.niqer.report.license;

import com.niqer.report.config.ReportProperties;
import com.niqer.report.exception.ReportException;
import org.springframework.util.StringUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.time.Instant;
import java.util.Base64;

public class ReportLicenseService {

    public record LicenseStatus(String edition, String sub, Long exp, boolean active) {}

    private final ReportProperties properties;
    private final ObjectMapper objectMapper;
    private final PublicKey publicKey;

    public ReportLicenseService(ReportProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        try {
            byte[] der = Base64.getDecoder().decode(ReportLicenseKeys.PUBLIC_SPKI_BASE64);
            this.publicKey = KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(der));
        } catch (Exception e) {
            throw new IllegalStateException("license public key invalid", e);
        }
    }

    public boolean isPro() {
        return status().active();
    }

    public LicenseStatus status() {
        Parsed parsed = parseQuiet(currentKey());
        if (parsed == null) return new LicenseStatus("free", "", null, false);
        return new LicenseStatus("pro", parsed.sub, parsed.exp == 0 ? null : parsed.exp, true);
    }

    private String currentKey() {
        String fromFile = readFileKey();
        if (StringUtils.hasText(fromFile) && parseQuiet(fromFile) != null) return fromFile;
        String fromYml = properties.getLicense().getKey();
        return fromYml == null ? "" : fromYml.trim();
    }

    private String readFileKey() {
        String file = properties.getLicense().getFile();
        if (!StringUtils.hasText(file)) return "";
        try {
            Path path = Path.of(file);
            if (!Files.isRegularFile(path)) return "";
            String text = Files.readString(path, StandardCharsets.UTF_8).trim();
            return text == null ? "" : text;
        } catch (Exception ignored) {
            return "";
        }
    }

    private Parsed parseQuiet(String key) {
        try {
            return parseOrThrow(key);
        } catch (Exception e) {
            return null;
        }
    }

    private Parsed parseOrThrow(String key) {
        if (!StringUtils.hasText(key) || !key.startsWith("NQL1.")) {
            throw ReportException.badRequest("license invalid");
        }
        String rest = key.substring(5);
        int dot = rest.lastIndexOf('.');
        if (dot <= 0 || dot == rest.length() - 1) throw ReportException.badRequest("license invalid");
        byte[] payload;
        byte[] sig;
        try {
            payload = b64url(rest.substring(0, dot));
            sig = b64url(rest.substring(dot + 1));
        } catch (Exception e) {
            throw ReportException.badRequest("license invalid");
        }
        try {
            Signature verifier = Signature.getInstance("Ed25519");
            verifier.initVerify(publicKey);
            verifier.update(payload);
            if (!verifier.verify(sig)) throw ReportException.badRequest("license invalid");
        } catch (ReportException e) {
            throw e;
        } catch (Exception e) {
            throw ReportException.badRequest("license invalid");
        }
        JsonNode root;
        try {
            root = objectMapper.readTree(payload);
        } catch (Exception e) {
            throw ReportException.badRequest("license invalid");
        }
        if (root == null || !root.isObject()) throw ReportException.badRequest("license invalid");
        int v = root.get("v") != null && root.get("v").isNumber() ? root.get("v").asInt() : -1;
        String edition = text(root, "edition");
        if (v != 1 || !"pro".equals(edition)) throw ReportException.badRequest("license invalid");
        String sub = text(root, "sub");
        long exp = 0;
        if (root.get("exp") != null && root.get("exp").isNumber()) exp = root.get("exp").asLong();
        if (exp > 0 && Instant.now().getEpochSecond() >= exp) throw ReportException.badRequest("license expired");
        return new Parsed(sub, exp);
    }

    private static String text(JsonNode root, String field) {
        JsonNode n = root.get(field);
        if (n == null || n.isNull()) return "";
        String s = n.asString();
        return s == null ? "" : s;
    }

    private static byte[] b64url(String s) {
        return Base64.getUrlDecoder().decode(s);
    }

    private record Parsed(String sub, long exp) {}
}
