package com.niqer.report.service;

import com.niqer.report.exception.ReportException;
import com.niqer.report.model.ReportTemplateBinding;
import com.niqer.report.spi.ReportPageKeyResolver;
import com.niqer.report.spi.ReportSqlExecutor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.*;

@RequiredArgsConstructor
@Transactional(rollbackFor = Exception.class, readOnly = true)
public class ReportBindingService {

    private final ReportSqlExecutor sqlExecutor;
    private final ReportPageKeyResolver pageKeyResolver;
    private final ReportTemplateService templateService;

    public List<Map<String, String>> listTemplatesByMenuName(String menuName) {
        String pageKey = pageKeyResolver.resolvePageKey(menuName);
        if (!StringUtils.hasText(pageKey)) return List.of();
        List<Map<String, Object>> rows = sqlExecutor.queryRaw(
                "SELECT template_code FROM report_template_binding WHERE menu_id = ? LIMIT 1", pageKey);
        if (rows.isEmpty()) return List.of();
        Object codeObj = rows.getFirst().get("template_code");
        if (codeObj == null || !StringUtils.hasText(String.valueOf(codeObj))) return List.of();
        Locale locale = LocaleContextHolder.getLocale();
        return Arrays.stream(String.valueOf(codeObj).split(","))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .map(code -> Map.of(
                        "templateCode", code,
                        "displayName", templateService.resolveDisplayName(code, locale)))
                .toList();
    }

    public List<ReportTemplateBinding> listAll() {
        List<Map<String, Object>> rows = sqlExecutor.queryRaw(
                "SELECT * FROM report_template_binding ORDER BY menu_id");
        return rows.stream().map(this::mapRow).toList();
    }

    @Transactional(rollbackFor = Exception.class)
    public void upsertBinding(ReportTemplateBinding binding) {
        if (StringUtils.hasText(binding.getId())) {
            sqlExecutor.update(
                    "UPDATE report_template_binding SET menu_id=?, template_code=?, update_time=?, version=COALESCE(version,0)+1 WHERE id=?",
                    binding.getMenuId(), binding.getTemplateCode(), LocalDateTime.now(), binding.getId());
        } else {
            List<Map<String, Object>> exists = sqlExecutor.queryRaw(
                    "SELECT 1 FROM report_template_binding WHERE menu_id = ? LIMIT 1", binding.getMenuId());
            if (!exists.isEmpty()) throw ReportException.conflict("binding exists");
            String id = UUID.randomUUID().toString().replace("-", "");
            LocalDateTime now = LocalDateTime.now();
            sqlExecutor.update(
                    "INSERT INTO report_template_binding (id, menu_id, template_code, create_time, update_time, version) VALUES (?,?,?,?,?,?)",
                    id, binding.getMenuId(), binding.getTemplateCode(), now, now, 0);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void removeBindings(List<String> ids) {
        if (ids == null || ids.isEmpty()) return;
        for (String id : ids) {
            sqlExecutor.update("DELETE FROM report_template_binding WHERE id = ?", id);
        }
    }

    private ReportTemplateBinding mapRow(Map<String, Object> row) {
        return ReportTemplateBinding.builder()
                .id(str(row.get("id")))
                .menuId(str(row.get("menu_id")))
                .templateCode(str(row.get("template_code")))
                .updaterId(str(row.get("updater_id")))
                .updater(str(row.get("updater")))
                .creatorId(str(row.get("creator_id")))
                .creator(str(row.get("creator")))
                .remark(str(row.get("remark")))
                .version(row.get("version") == null ? null : ((Number) row.get("version")).intValue())
                .build();
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
