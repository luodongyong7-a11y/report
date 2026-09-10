package com.niqer.report.spi;

import java.util.List;
import java.util.Map;

public interface ReportSqlExecutor {

    List<Map<String, Object>> query(String sql, Map<String, Object> params);

    Map<String, Object> queryOne(String sql, Map<String, Object> params);

    int update(String sql, Object... args);

    List<Map<String, Object>> queryRaw(String sql, Object... args);
}
