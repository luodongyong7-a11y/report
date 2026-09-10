package com.niqer.report.spi;

import cn.hutool.http.HttpRequest;
import jakarta.servlet.http.HttpServletRequest;

public interface ReportAuthGuard {

    void requireAdmin();

    default void forwardAuthHeaders(HttpRequest apiRequest, HttpServletRequest origin) {
        String lang = origin.getHeader("accept-language");
        if (lang != null && !lang.isEmpty()) {
            apiRequest.header("accept-language", lang);
        }
    }
}
