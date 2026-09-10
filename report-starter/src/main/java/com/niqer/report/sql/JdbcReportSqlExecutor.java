package com.niqer.report.sql;

import com.niqer.report.exception.ReportException;
import com.niqer.report.spi.ReportSqlExecutor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class JdbcReportSqlExecutor implements ReportSqlExecutor {

    private static final Pattern HASH_PARAM = Pattern.compile("#\\{([^}]+)}");

    private final JdbcTemplate jdbcTemplate;
    private final NamedParameterJdbcTemplate namedJdbc;

    public JdbcReportSqlExecutor(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        this.namedJdbc = new NamedParameterJdbcTemplate(jdbcTemplate);
    }

    @Override
    public List<Map<String, Object>> query(String sql, Map<String, Object> params) {
        String named = toNamedSql(sql);
        Map<String, Object> safe = params == null ? Map.of() : params;
        return namedJdbc.queryForList(named, safe);
    }

    @Override
    public Map<String, Object> queryOne(String sql, Map<String, Object> params) {
        List<Map<String, Object>> list = query(sql, params);
        return list.isEmpty() ? null : list.getFirst();
    }

    @Override
    public int update(String sql, Object... args) {
        return jdbcTemplate.update(sql, args);
    }

    @Override
    public List<Map<String, Object>> queryRaw(String sql, Object... args) {
        return jdbcTemplate.queryForList(sql, args);
    }

    static String toNamedSql(String sql) {
        if (sql == null) {
            throw ReportException.badRequest("sql required");
        }
        Matcher m = HASH_PARAM.matcher(sql);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String key = m.group(1).trim();
            if (key.isEmpty() || !key.matches("[a-zA-Z_][a-zA-Z0-9_]*")) {
                throw ReportException.badRequest("invalid sql param: " + key);
            }
            m.appendReplacement(sb, ":" + key);
        }
        m.appendTail(sb);
        return sb.toString();
    }
}
