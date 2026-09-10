package com.niqer.report.spi;

public interface ReportConnectionRegistry {

    ReportSqlExecutor require(String dbName);

    default String dialect(String dbName) {
        return "postgres";
    }
}
