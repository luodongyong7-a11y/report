package com.niqer.report.storage;

import com.niqer.report.config.ReportProperties;
import com.niqer.report.spi.ReportObjectStorage;
import io.minio.*;
import io.minio.messages.Item;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

public class MinioReportObjectStorage implements ReportObjectStorage {

    private final MinioClient client;
    private final String bucket;

    public MinioReportObjectStorage(ReportProperties.Storage storage) {
        this.bucket = storage.getBucket();
        this.client = MinioClient.builder()
                .endpoint(endpointWithScheme(storage))
                .credentials(storage.getAccessKey(), storage.getSecretKey())
                .build();
    }

    static String endpointWithScheme(ReportProperties.Storage storage) {
        String endpoint = storage.getEndpoint();
        if (endpoint == null || endpoint.isBlank()) {
            throw new IllegalArgumentException("minio endpoint required");
        }
        if (endpoint.contains("://")) {
            return endpoint;
        }
        return (storage.isSecure() ? "https://" : "http://") + endpoint;
    }

    @Override
    public void put(String objectKey, InputStream inputStream, String contentType, long size) throws Exception {
        client.putObject(PutObjectArgs.builder()
                .bucket(bucket)
                .object(objectKey)
                .stream(inputStream, size, -1)
                .contentType(contentType)
                .build());
    }

    @Override
    public InputStream get(String objectKey) throws Exception {
        return client.getObject(GetObjectArgs.builder().bucket(bucket).object(objectKey).build());
    }

    @Override
    public void delete(String objectKey) throws Exception {
        client.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(objectKey).build());
    }

    @Override
    public boolean exists(String objectKey) {
        try {
            client.statObject(StatObjectArgs.builder().bucket(bucket).object(objectKey).build());
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public List<String> list(String prefix) throws Exception {
        List<String> out = new ArrayList<>();
        Iterable<Result<Item>> results = client.listObjects(ListObjectsArgs.builder()
                .bucket(bucket)
                .prefix(prefix)
                .recursive(true)
                .build());
        for (Result<Item> r : results) {
            Item item = r.get();
            if (item != null && item.objectName() != null) {
                out.add(item.objectName());
            }
        }
        return out;
    }
}
