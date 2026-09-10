package com.niqer.report.exception;

import lombok.Getter;

@Getter
public class ReportException extends RuntimeException {

    private final int code;

    public ReportException(int code, String message) {
        super(message);
        this.code = code;
    }

    public static ReportException of(int code, String message) {
        return new ReportException(code, message);
    }

    public static ReportException badRequest(String message) {
        return new ReportException(40000, message);
    }

    public static ReportException notFound(String message) {
        return new ReportException(40400, message);
    }

    public static ReportException conflict(String message) {
        return new ReportException(40900, message);
    }

    public static ReportException forbidden(String message) {
        return new ReportException(40300, message);
    }

    public static ReportException error(String message) {
        return new ReportException(50000, message);
    }
}
