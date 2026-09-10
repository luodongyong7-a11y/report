package com.niqer.report.tool;

import com.niqer.report.config.ReportProperties;
import com.niqer.report.exception.ReportException;
import com.niqer.report.service.ReportTemplateService;
import com.niqer.report.spi.ReportAuthGuard;
import com.niqer.report.spi.ReportConnectionRegistry;
import com.niqer.report.spi.ReportObjectStorage;
import com.niqer.report.spi.ReportSqlExecutor;
import com.niqer.report.sql.JdbcReportSqlExecutor;
import com.niqer.report.tool.auth.AuthFilter;
import com.niqer.report.tool.auth.AuthHolder;
import com.niqer.report.tool.auth.JwtService;
import com.niqer.report.tool.connection.FileReportConnectionRegistry;
import com.niqer.report.tool.storage.ToolStorageService;
import jakarta.annotation.PostConstruct;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.cache.CacheManager;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.util.StringUtils;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Path;

@Configuration
@EnableConfigurationProperties(ReportToolProperties.class)
public class ReportToolConfiguration {

    private final ReportProperties reportProperties;
    private final ReportToolProperties toolProperties;

    public ReportToolConfiguration(ReportProperties reportProperties, ReportToolProperties toolProperties) {
        this.reportProperties = reportProperties;
        this.toolProperties = toolProperties;
    }

    @PostConstruct
    public void bindLicenseFile() {
        if (StringUtils.hasText(reportProperties.getLicense().getFile())) return;
        String dataDir = toolProperties.getDataDir() == null || toolProperties.getDataDir().isBlank()
                ? "./data"
                : toolProperties.getDataDir();
        reportProperties.getLicense().setFile(Path.of(dataDir, "license.key").toString());
    }

    @Bean
    public CacheManager cacheManager() {
        return new ConcurrentMapCacheManager(ReportTemplateService.CACHE_TEMPLATE, ReportTemplateService.CACHE_CODES);
    }

    @Bean
    public JwtService jwtService(ReportToolProperties properties) {
        return new JwtService(properties);
    }

    @Bean
    public FilterRegistrationBean<AuthFilter> authFilter(JwtService jwtService, ReportToolProperties properties) {
        FilterRegistrationBean<AuthFilter> bean = new FilterRegistrationBean<>();
        bean.setFilter(new AuthFilter(jwtService, properties));
        bean.addUrlPatterns("/*");
        bean.setOrder(0);
        return bean;
    }

    @Bean
    @Primary
    public ReportAuthGuard reportAuthGuard() {
        return () -> {
            if (AuthHolder.get() == null) {
                throw ReportException.forbidden("report admin required");
            }
        };
    }

    @Bean
    public ToolStorageService toolStorageService(ReportToolProperties toolProperties,
                                                 com.niqer.report.config.ReportProperties reportProperties,
                                                 ObjectMapper objectMapper,
                                                 CacheManager cacheManager) {
        return new ToolStorageService(toolProperties, reportProperties, objectMapper, cacheManager);
    }

    @Bean
    @Primary
    public ReportObjectStorage reportObjectStorage(ToolStorageService storageService) {
        return storageService.storage();
    }

    @Bean
    public FileReportConnectionRegistry fileReportConnectionRegistry(ReportToolProperties properties,
                                                                     ObjectMapper objectMapper,
                                                                     JdbcTemplate jdbcTemplate) {
        return new FileReportConnectionRegistry(properties, objectMapper, new JdbcReportSqlExecutor(jdbcTemplate));
    }

    @Bean
    @Primary
    public ReportConnectionRegistry reportConnectionRegistry(FileReportConnectionRegistry registry) {
        return registry;
    }

    @Bean
    @Primary
    public ReportSqlExecutor reportSqlExecutor(FileReportConnectionRegistry registry) {
        return new ReportSqlExecutor() {
            @Override
            public java.util.List<java.util.Map<String, Object>> query(String sql, java.util.Map<String, Object> params) {
                return registry.require(null).query(sql, params);
            }

            @Override
            public java.util.Map<String, Object> queryOne(String sql, java.util.Map<String, Object> params) {
                return registry.require(null).queryOne(sql, params);
            }

            @Override
            public int update(String sql, Object... args) {
                return registry.require(null).update(sql, args);
            }

            @Override
            public java.util.List<java.util.Map<String, Object>> queryRaw(String sql, Object... args) {
                return registry.require(null).queryRaw(sql, args);
            }
        };
    }
}
