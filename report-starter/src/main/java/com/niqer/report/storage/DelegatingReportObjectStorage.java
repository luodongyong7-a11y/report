package com.niqer.report.storage;

import com.niqer.report.spi.ReportObjectStorage;

import java.io.InputStream;
import java.util.List;

public class DelegatingReportObjectStorage implements ReportObjectStorage {

    private volatile ReportObjectStorage delegate;

    public DelegatingReportObjectStorage(ReportObjectStorage delegate) {
        setDelegate(delegate);
    }

    public void setDelegate(ReportObjectStorage next) {
        if (next == null) {
            throw new IllegalArgumentException("storage delegate required");
        }
        this.delegate = next;
    }

    public ReportObjectStorage getDelegate() {
        return delegate;
    }

    @Override
    public void put(String objectKey, InputStream inputStream, String contentType, long size) throws Exception {
        delegate.put(objectKey, inputStream, contentType, size);
    }

    @Override
    public InputStream get(String objectKey) throws Exception {
        return delegate.get(objectKey);
    }

    @Override
    public void delete(String objectKey) throws Exception {
        delegate.delete(objectKey);
    }

    @Override
    public boolean exists(String objectKey) {
        return delegate.exists(objectKey);
    }

    @Override
    public List<String> list(String prefix) throws Exception {
        return delegate.list(prefix);
    }
}
