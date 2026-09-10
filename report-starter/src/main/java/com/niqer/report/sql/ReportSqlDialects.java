package com.niqer.report.sql;

import com.niqer.report.exception.ReportException;
import com.niqer.report.service.ReportPreviewService;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class ReportSqlDialects {

    private static final Pattern SQL_TRAILING_LIMIT = Pattern.compile("(?is)\\s+limit\\s+\\d+(\\s*,\\s+\\d+)?\\s*$");

    private ReportSqlDialects() {
    }

    public static String normalize(String dialect) {
        if (dialect == null || dialect.isBlank()) {
            return "postgres";
        }
        String d = dialect.trim().toLowerCase();
        return switch (d) {
            case "postgresql", "pg" -> "postgres";
            case "mariadb" -> "mysql";
            case "mssql", "sql-server" -> "sqlserver";
            default -> d;
        };
    }

    public static String wrapReadOnly(String sql, int maxRows, int timeoutMs, String dialect) {
        if (sql == null || sql.isBlank()) {
            throw ReportException.badRequest("sql required");
        }
        if (maxRows < 1) {
            throw ReportException.badRequest("maxRows must be positive");
        }
        if (timeoutMs < 1) {
            throw ReportException.badRequest("timeoutMs must be positive");
        }
        String trimmed = sql.trim();
        ReportPreviewService.validateReadOnlySql(trimmed);
        Matcher tail = SQL_TRAILING_LIMIT.matcher(trimmed);
        if (tail.find()) {
            trimmed = trimmed.substring(0, tail.start()).trim();
        }
        return switch (normalize(dialect)) {
            case "postgres" -> wrapPostgres(trimmed, maxRows, timeoutMs);
            case "sqlserver" -> "select top " + maxRows + " * from (" + trimmed + ") _tk_report_rows";
            default -> "select * from (" + trimmed + ") _tk_report_rows limit " + maxRows;
        };
    }

    private static String wrapPostgres(String trimmed, int maxRows, int timeoutMs) {
        return "with _tk_report_statement_timeout as (select set_config('statement_timeout', '"
                + timeoutMs + "ms', true)), "
                + "_tk_report_read_only as (select set_config('transaction_read_only', 'on', true)), "
                + "_tk_report_rows as ("
                + trimmed
                + ") select _tk_report_rows.* from _tk_report_statement_timeout, _tk_report_read_only, _tk_report_rows limit "
                + maxRows;
    }
}
