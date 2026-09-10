package com.niqer.report.spi;

import tools.jackson.databind.JsonNode;

import java.util.Map;

/**
 * Host callback after a report template has been loaded/filled and before
 * host-only metadata is stripped for rendering.
 * <p>
 * The report module does not interpret host business fields (for example
 * document print counters). Hosts may inspect {@code templateRoot} / request
 * params and apply their own side effects.
 */
@FunctionalInterface
public interface ReportPrintCallback {

    void afterTemplateFilled(Map<String, Object> params, JsonNode templateRoot);
}
