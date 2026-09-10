package com.niqer.report.storage;

import com.niqer.report.exception.ReportException;
import com.niqer.report.spi.ReportObjectStorage;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

public class LocalFsReportObjectStorage implements ReportObjectStorage {

    private final Path root;

    public LocalFsReportObjectStorage(Path root) {
        if (root == null) {
            throw new IllegalArgumentException("storage root required");
        }
        this.root = root.toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.root);
        } catch (IOException e) {
            throw new IllegalStateException("cannot create storage root: " + this.root, e);
        }
    }

    @Override
    public void put(String objectKey, InputStream inputStream, String contentType, long size) throws Exception {
        Path target = resolveKey(objectKey);
        Files.createDirectories(target.getParent());
        try (OutputStream out = Files.newOutputStream(target)) {
            inputStream.transferTo(out);
        }
    }

    @Override
    public InputStream get(String objectKey) throws Exception {
        Path target = resolveKey(objectKey);
        if (!Files.isRegularFile(target)) {
            throw ReportException.notFound("object not found");
        }
        return Files.newInputStream(target);
    }

    @Override
    public void delete(String objectKey) throws Exception {
        Path target = resolveKey(objectKey);
        Files.deleteIfExists(target);
    }

    @Override
    public boolean exists(String objectKey) {
        try {
            return Files.isRegularFile(resolveKey(objectKey));
        } catch (RuntimeException e) {
            return false;
        }
    }

    @Override
    public List<String> list(String prefix) throws Exception {
        String pref = prefix == null ? "" : prefix.replace('\\', '/');
        List<String> out = new ArrayList<>();
        if (!Files.isDirectory(root)) {
            return out;
        }
        try (Stream<Path> walk = Files.walk(root)) {
            walk.filter(Files::isRegularFile).forEach(p -> {
                String key = root.relativize(p).toString().replace('\\', '/');
                if (pref.isEmpty() || key.startsWith(pref)) {
                    out.add(key);
                }
            });
        }
        return out;
    }

    private Path resolveKey(String objectKey) {
        if (objectKey == null || objectKey.isBlank()) {
            throw ReportException.badRequest("object key required");
        }
        String key = objectKey.replace('\\', '/');
        while (key.startsWith("/")) {
            key = key.substring(1);
        }
        if (key.isEmpty() || key.contains("..")) {
            throw ReportException.badRequest("invalid object key");
        }
        Path target = root.resolve(key).normalize();
        if (!target.startsWith(root)) {
            throw ReportException.badRequest("invalid object key");
        }
        return target;
    }
}
