package com.niqer.report.spi;

import java.io.InputStream;
import java.util.List;

public interface ReportObjectStorage {

    void put(String objectKey, InputStream inputStream, String contentType, long size) throws Exception;

    InputStream get(String objectKey) throws Exception;

    void delete(String objectKey) throws Exception;

    boolean exists(String objectKey);

    List<String> list(String prefix) throws Exception;
}
