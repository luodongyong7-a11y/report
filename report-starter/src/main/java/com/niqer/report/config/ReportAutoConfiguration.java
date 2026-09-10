package com.niqer.report.config;

import com.niqer.report.exception.ReportException;
import com.niqer.report.service.*;
import com.niqer.report.spi.ReportAuthGuard;
import com.niqer.report.spi.ReportConnectionRegistry;
import com.niqer.report.spi.ReportObjectStorage;
import com.niqer.report.spi.ReportPageKeyResolver;
import com.niqer.report.spi.ReportPrintCallback;
import com.niqer.report.spi.ReportSqlExecutor;
import com.niqer.report.sql.JdbcReportSqlExecutor;
import com.niqer.report.storage.MinioReportObjectStorage;
import com.niqer.report.license.ReportLicenseService;
import com.niqer.report.protect.ReportTemplateCodec;
import com.niqer.report.web.PrintAgentDownloadController;
import com.niqer.report.web.ReportBindingController;
import com.niqer.report.web.ReportController;
import com.niqer.report.web.ReportExceptionHandler;
import com.niqer.report.web.ReportLicenseController;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;

@AutoConfiguration
@EnableConfigurationProperties(ReportProperties.class)
@ConditionalOnProperty(prefix = "report", name = "enabled", havingValue = "true", matchIfMissing = true)
@Import({ReportController.class, ReportBindingController.class, PrintAgentDownloadController.class, ReportExceptionHandler.class, ReportLicenseController.class})
public class ReportAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean(ReportAuthGuard.class)
    public ReportAuthGuard reportAuthGuard(ReportProperties properties) {
        return () -> {
            if (properties.getAuth().isEnforceAdmin()) {
                throw ReportException.forbidden("report admin required; provide ReportAuthGuard bean");
            }
        };
    }

    @Bean
    @ConditionalOnMissingBean(ReportPageKeyResolver.class)
    public ReportPageKeyResolver reportPageKeyResolver() {
        return menuName -> menuName;
    }

    @Bean
    @ConditionalOnMissingBean(ReportObjectStorage.class)
    public ReportObjectStorage reportObjectStorage(ReportProperties properties) {
        ReportProperties.Storage storage = properties.getStorage();
        if (storage.getEndpoint() == null || storage.getEndpoint().isBlank()) {
            throw new IllegalStateException("report.storage.endpoint is required when no ReportObjectStorage bean is provided");
        }
        return new MinioReportObjectStorage(storage);
    }

    @Bean
    @ConditionalOnMissingBean(ReportSqlExecutor.class)
    public ReportSqlExecutor reportSqlExecutor(JdbcTemplate jdbcTemplate) {
        return new JdbcReportSqlExecutor(jdbcTemplate);
    }

    @Bean
    @ConditionalOnMissingBean(ReportPrintCallback.class)
    public ReportPrintCallback reportPrintCallback() {
        return (params, templateRoot) -> {};
    }

    @Bean
    @ConditionalOnMissingBean
    public ReportLicenseService reportLicenseService(ReportProperties properties, ObjectMapper objectMapper) {
        return new ReportLicenseService(properties, objectMapper);
    }

    @Bean
    @ConditionalOnMissingBean
    public ReportTemplateCodec reportTemplateCodec(ReportProperties properties) {
        return new ReportTemplateCodec(properties);
    }

    @Bean
    @ConditionalOnMissingBean
    public ReportSidecarClient reportSidecarClient(ReportProperties properties) {
        return new ReportSidecarClient(properties);
    }

    @Bean
    @ConditionalOnMissingBean
    public ReportTemplateService reportTemplateService(ReportObjectStorage storage,
                                                       ReportProperties properties,
                                                       ObjectMapper objectMapper,
                                                       ReportTemplateCodec codec) {
        return new ReportTemplateService(storage, properties, objectMapper, codec);
    }

    @Bean
    @ConditionalOnMissingBean
    public ReportPreviewService reportPreviewService(ReportPrintCallback printCallback,
                                                     ReportSqlExecutor sqlExecutor,
                                                     ReportAuthGuard authGuard,
                                                     ObjectMapper objectMapper,
                                                     ReportProperties properties,
                                                     ObjectProvider<ReportConnectionRegistry> connectionRegistries) {
        return new ReportPreviewService(printCallback, sqlExecutor, authGuard, objectMapper, properties,
                connectionRegistries.getIfAvailable());
    }

    @Bean
    @ConditionalOnMissingBean
    public ReportRenderService reportRenderService(ObjectMapper objectMapper,
                                                   ReportSidecarClient sidecarClient,
                                                   ReportProperties properties) {
        return new ReportRenderService(objectMapper, sidecarClient, properties);
    }

    @Bean
    @ConditionalOnMissingBean
    public ReportBindingService reportBindingService(ReportSqlExecutor sqlExecutor,
                                                     ReportPageKeyResolver pageKeyResolver,
                                                     ReportTemplateService templateService) {
        return new ReportBindingService(sqlExecutor, pageKeyResolver, templateService);
    }

    @Bean
    @ConditionalOnMissingBean
    public PrintAgentPackageService printAgentPackageService(ReportProperties properties) {
        return new PrintAgentPackageService(properties);
    }
}
