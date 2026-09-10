package com.niqer.report.protect;

import com.niqer.report.config.ReportProperties;
import com.niqer.report.exception.ReportException;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Locale;

public class ReportTemplateCodec {

    public static final String DEFAULT_SECRET = "niqer-nqt-v1-secret!";
    private static final byte[] INFO_MASTER = "nqt-master".getBytes(StandardCharsets.UTF_8);
    private static final byte[] INFO_ENC = "nqt-enc".getBytes(StandardCharsets.UTF_8);
    private static final byte[] XOR_LABEL = "xor".getBytes(StandardCharsets.UTF_8);
    private static final byte[] PERM_LABEL = "perm".getBytes(StandardCharsets.UTF_8);
    private static final byte[] MAC_PREFIX = "nqt1".getBytes(StandardCharsets.UTF_8);
    private static final byte[] MAGIC = new byte[]{'N', 'Q', 'T', '1'};
    private static final byte VERSION = 1;
    private static final int NONCE_LEN = 16;
    private static final int TAG_LEN = 16;
    private static final int HEADER_LEN = 4 + 1 + NONCE_LEN + 4;
    private static final int MAC_LEN = 32;

    private final byte[] master;
    private final SecureRandom random = new SecureRandom();

    public ReportTemplateCodec(ReportProperties properties) {
        String raw = properties.getCrypto() == null ? "" : properties.getCrypto().getSecret();
        this.master = deriveMaster(resolveSecret(raw));
    }

    public static boolean isEnvelope(String text) {
        return isTextEnvelope(text);
    }

    public static boolean isEnvelope(byte[] raw) {
        if (raw == null) return false;
        if (isBinaryEnvelope(raw)) return true;
        return isTextEnvelope(new String(raw, StandardCharsets.UTF_8));
    }

    public byte[] seal(String plainUtf8) {
        if (plainUtf8 == null) throw ReportException.badRequest("template envelope invalid");
        byte[] plain = plainUtf8.getBytes(StandardCharsets.UTF_8);
        byte[] nonce = new byte[NONCE_LEN];
        random.nextBytes(nonce);
        byte[] permSeed = hmac(master, concat(nonce, PERM_LABEL));
        byte[] obfuscated = permute(plain, permSeed, false);
        xorInPlace(obfuscated, nonce);
        byte[] encKey = hkdf(master, nonce, INFO_ENC, 32);
        byte[] packed = aesGcm(encKey, copyOf(nonce, 12), obfuscated, true);
        byte[] mac = hmac(master, concat(MAC_PREFIX, nonce, packed));
        ByteBuffer buf = ByteBuffer.allocate(HEADER_LEN + packed.length + MAC_LEN);
        buf.put(MAGIC);
        buf.put(VERSION);
        buf.put(nonce);
        buf.putInt(packed.length);
        buf.put(packed);
        buf.put(mac);
        return buf.array();
    }

    public String open(String rawText) {
        if (rawText == null) throw ReportException.badRequest("template envelope invalid");
        return open(rawText.getBytes(StandardCharsets.UTF_8));
    }

    public String open(byte[] raw) {
        if (isBinaryEnvelope(raw)) return openBinary(raw);
        String text = new String(raw, StandardCharsets.UTF_8);
        if (isTextEnvelope(text)) return openText(text);
        throw ReportException.badRequest("template envelope invalid");
    }

    private static boolean isTextEnvelope(String text) {
        if (text == null) return false;
        String s = stripBom(text).stripLeading();
        return s.startsWith("NQT1\n") || s.startsWith("NQT1\r\n");
    }

    private static boolean isBinaryEnvelope(byte[] raw) {
        if (raw == null || raw.length < HEADER_LEN + TAG_LEN + MAC_LEN) return false;
        if (raw[0] != 'N' || raw[1] != 'Q' || raw[2] != 'T' || raw[3] != '1') return false;
        if (raw[4] != VERSION) return false;
        int ctLen = ByteBuffer.wrap(raw, 21, 4).getInt();
        return ctLen >= TAG_LEN && raw.length == HEADER_LEN + ctLen + MAC_LEN;
    }

    private String openBinary(byte[] raw) {
        ByteBuffer buf = ByteBuffer.wrap(raw);
        buf.position(5);
        byte[] nonce = new byte[NONCE_LEN];
        buf.get(nonce);
        int ctLen = buf.getInt();
        if (ctLen < TAG_LEN || buf.remaining() != ctLen + MAC_LEN) {
            throw ReportException.badRequest("template envelope invalid");
        }
        byte[] packed = new byte[ctLen];
        buf.get(packed);
        byte[] mac = new byte[MAC_LEN];
        buf.get(mac);
        return unlock(nonce, packed, mac);
    }

    private String openText(String rawText) {
        String body = stripBom(rawText).stripLeading();
        String nHex = null;
        String cB64 = null;
        String mB64 = null;
        for (String line : body.split("\\r?\\n")) {
            if (line.startsWith("n=")) nHex = line.substring(2).trim();
            else if (line.startsWith("c=")) cB64 = line.substring(2).trim();
            else if (line.startsWith("m=")) mB64 = line.substring(2).trim();
        }
        if (nHex == null || cB64 == null || mB64 == null) {
            throw ReportException.badRequest("template envelope invalid");
        }
        byte[] nonce;
        byte[] packed;
        byte[] mac;
        try {
            nonce = unhex(nHex);
            packed = Base64.getUrlDecoder().decode(cB64);
            mac = Base64.getUrlDecoder().decode(mB64);
        } catch (Exception e) {
            throw ReportException.badRequest("template envelope invalid");
        }
        if (nonce.length != NONCE_LEN || packed.length < TAG_LEN) {
            throw ReportException.badRequest("template envelope invalid");
        }
        return unlock(nonce, packed, mac);
    }

    private String unlock(byte[] nonce, byte[] packed, byte[] mac) {
        byte[] expect = hmac(master, concat(MAC_PREFIX, nonce, packed));
        if (!MessageDigest.isEqual(expect, mac)) throw ReportException.badRequest("template envelope invalid");
        byte[] encKey = hkdf(master, nonce, INFO_ENC, 32);
        byte[] obfuscated = aesGcm(encKey, copyOf(nonce, 12), packed, false);
        xorInPlace(obfuscated, nonce);
        byte[] permSeed = hmac(master, concat(nonce, PERM_LABEL));
        byte[] plain = permute(obfuscated, permSeed, true);
        return new String(plain, StandardCharsets.UTF_8);
    }

    private void xorInPlace(byte[] data, byte[] nonce) {
        int block = 0;
        int off = 0;
        while (off < data.length) {
            byte[] ks = hmac(master, concat(nonce, XOR_LABEL, u32(block++)));
            int n = Math.min(ks.length, data.length - off);
            for (int i = 0; i < n; i++) data[off + i] ^= ks[i];
            off += n;
        }
    }

    private static byte[] permute(byte[] input, byte[] permSeed, boolean inverse) {
        byte[] data = input.clone();
        int n = data.length;
        if (n < 2) return data;
        int[] order = new int[n];
        for (int i = 0; i < n; i++) order[i] = i;
        Sha256Ctr rng = new Sha256Ctr(permSeed);
        for (int i = n - 1; i >= 1; i--) {
            int j = Integer.remainderUnsigned(rng.nextU32(), i + 1);
            int tmp = order[i];
            order[i] = order[j];
            order[j] = tmp;
        }
        byte[] out = new byte[n];
        if (!inverse) {
            for (int i = 0; i < n; i++) out[i] = data[order[i]];
        } else {
            for (int i = 0; i < n; i++) out[order[i]] = data[i];
        }
        return out;
    }

    private static byte[] deriveMaster(byte[] secret) {
        return hkdf(secret, new byte[32], INFO_MASTER, 32);
    }

    static byte[] resolveSecret(String raw) {
        String s = raw == null ? "" : raw.trim();
        if (s.isEmpty()) s = DEFAULT_SECRET;
        if (s.length() >= 32 && s.length() % 2 == 0 && s.matches("(?i)[0-9a-f]+")) {
            return unhex(s);
        }
        byte[] utf8 = s.getBytes(StandardCharsets.UTF_8);
        if (utf8.length < 16) throw new IllegalStateException("report.crypto.secret too short");
        return utf8;
    }

    private static byte[] hkdf(byte[] ikm, byte[] salt, byte[] info, int len) {
        byte[] prk = hmac(salt, ikm);
        byte[] out = new byte[len];
        byte[] t = new byte[0];
        int pos = 0;
        int c = 1;
        while (pos < len) {
            t = hmac(prk, concat(t, info, new byte[]{(byte) c}));
            int n = Math.min(t.length, len - pos);
            System.arraycopy(t, 0, out, pos, n);
            pos += n;
            c++;
        }
        return out;
    }

    private static byte[] hmac(byte[] key, byte[] data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(data);
        } catch (Exception e) {
            throw ReportException.badRequest("template envelope invalid");
        }
    }

    private static byte[] aesGcm(byte[] key, byte[] iv, byte[] data, boolean encrypt) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(encrypt ? Cipher.ENCRYPT_MODE : Cipher.DECRYPT_MODE,
                    new SecretKeySpec(key, "AES"),
                    new GCMParameterSpec(TAG_LEN * 8, iv));
            return cipher.doFinal(data);
        } catch (Exception e) {
            throw ReportException.badRequest("template envelope invalid");
        }
    }

    private static byte[] sha256(byte[] data) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(data);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String stripBom(String text) {
        if (text != null && !text.isEmpty() && text.charAt(0) == '\uFEFF') return text.substring(1);
        return text;
    }

    private static byte[] concat(byte[]... parts) {
        int n = 0;
        for (byte[] p : parts) n += p.length;
        byte[] out = new byte[n];
        int off = 0;
        for (byte[] p : parts) {
            System.arraycopy(p, 0, out, off, p.length);
            off += p.length;
        }
        return out;
    }

    private static byte[] u32(int v) {
        return ByteBuffer.allocate(4).putInt(v).array();
    }

    private static byte[] copyOf(byte[] src, int n) {
        byte[] out = new byte[n];
        System.arraycopy(src, 0, out, 0, n);
        return out;
    }

    private static String hex(byte[] data) {
        StringBuilder sb = new StringBuilder(data.length * 2);
        for (byte b : data) sb.append(String.format(Locale.ROOT, "%02x", b & 0xff));
        return sb.toString();
    }

    private static byte[] unhex(String hex) {
        if ((hex.length() & 1) != 0) throw new IllegalArgumentException("hex");
        byte[] out = new byte[hex.length() / 2];
        for (int i = 0; i < out.length; i++) {
            out[i] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        }
        return out;
    }

    private static String b64url(byte[] data) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(data);
    }

    private static final class Sha256Ctr {
        private final byte[] seed;
        private int counter;
        private byte[] buf = new byte[0];
        private int pos;

        Sha256Ctr(byte[] seed) {
            this.seed = seed;
        }

        int nextU32() {
            ensure(4);
            int v = ((buf[pos] & 0xff) << 24)
                    | ((buf[pos + 1] & 0xff) << 16)
                    | ((buf[pos + 2] & 0xff) << 8)
                    | (buf[pos + 3] & 0xff);
            pos += 4;
            return v;
        }

        private void ensure(int n) {
            if (pos + n <= buf.length) return;
            buf = sha256(concat(seed, u32(counter++)));
            pos = 0;
        }
    }
}
