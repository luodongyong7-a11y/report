package com.niqer.report.tool.auth;

public final class AuthHolder {

    private static final ThreadLocal<AuthPrincipal> HOLDER = new ThreadLocal<>();

    private AuthHolder() {
    }

    public static void set(AuthPrincipal principal) {
        HOLDER.set(principal);
    }

    public static AuthPrincipal get() {
        return HOLDER.get();
    }

    public static AuthPrincipal require() {
        AuthPrincipal p = HOLDER.get();
        if (p == null) {
            throw com.niqer.report.exception.ReportException.of(40100, "unauthorized");
        }
        return p;
    }

    public static void clear() {
        HOLDER.remove();
    }
}
