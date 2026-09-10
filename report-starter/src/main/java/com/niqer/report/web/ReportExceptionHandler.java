package com.niqer.report.web;

import com.niqer.report.exception.ReportException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice(basePackages = "com.niqer.report.web")
public class ReportExceptionHandler {

    @ExceptionHandler(ReportException.class)
    public ResponseEntity<Map<String, Object>> handle(ReportException e) {
        HttpStatus status = switch (e.getCode()) {
            case 40400 -> HttpStatus.NOT_FOUND;
            case 40300 -> HttpStatus.FORBIDDEN;
            case 40900 -> HttpStatus.CONFLICT;
            case 40100 -> HttpStatus.UNAUTHORIZED;
            case 40000 -> HttpStatus.BAD_REQUEST;
            default -> HttpStatus.INTERNAL_SERVER_ERROR;
        };
        return ResponseEntity.status(status).body(Map.of(
                "code", e.getCode(),
                "message", e.getMessage() == null ? "" : e.getMessage()));
    }
}
