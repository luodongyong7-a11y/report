package com.niqer.report.tool.auth;

import com.niqer.report.exception.ReportException;
import com.niqer.report.tool.ReportToolProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

public class AuthFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final ReportToolProperties properties;

    public AuthFilter(JwtService jwtService, ReportToolProperties properties) {
        this.jwtService = jwtService;
        this.properties = properties;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String path = request.getRequestURI();
        if ("/auth/login".equals(path) || "/health".equals(path)) {
            return true;
        }
        return path.startsWith("/report/fonts/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        try {
            String header = request.getHeader("Authorization");
            if (header == null || !header.startsWith("Bearer ")) {
                throw ReportException.of(40100, "unauthorized");
            }
            String username = jwtService.parseUsername(header.substring(7).trim());
            if (!username.equals(properties.getAdminUsername())) {
                throw ReportException.of(40100, "unauthorized");
            }
            AuthHolder.set(new AuthPrincipal(username, username));
            filterChain.doFilter(request, response);
        } catch (ReportException e) {
            if (e.getCode() != 40100) {
                throw e;
            }
            response.setStatus(401);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"code\":40100,\"message\":\"unauthorized\"}");
        } finally {
            AuthHolder.clear();
        }
    }
}
