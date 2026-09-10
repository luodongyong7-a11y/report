#![cfg_attr(windows, windows_subsystem = "windows")]

mod config;
mod heartbeat;
mod http;
mod install;
mod netutil;
mod print;

#[cfg(any(windows, target_os = "macos"))]
mod tray;

use clap::Parser;
use http::AppState;
use std::fs::OpenOptions;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing_subscriber::EnvFilter;

#[derive(Parser, Debug)]
#[command(name = "tk-print-agent", about = "Cross-platform silent print agent")]
struct Args {
    /// ERP base URL for heartbeat (e.g. http://192.168.1.10:8080)
    #[arg(long)]
    erp: Option<String>,

    /// Override listen port
    #[arg(long)]
    port: Option<u16>,

    /// Bind mode: loopback | lan
    #[arg(long)]
    bind: Option<String>,

    /// Skip MessageBox confirmation for apply-profile
    #[arg(long)]
    auto_allow: bool,

    /// Do not show system tray icon
    #[arg(long, default_value_t = false)]
    no_tray: bool,

    /// Skip copy-to-LocalAppData + autostart (dev builds)
    #[arg(long, default_value_t = false)]
    no_install: bool,

    /// Deprecated: Windows build has no console window.
    #[arg(long, default_value_t = false, hide = true)]
    hide: bool,
}

fn main() {
    if let Err(e) = run() {
        install::boot_log(&format!("fatal: {e:#}"));
        install::show_error("TK 打印代理", &format!("启动失败:\n{e:#}"));
        std::process::exit(1);
    }
}

fn run() -> anyhow::Result<()> {
    let args = Args::parse();
    let _ = args.hide;

    #[cfg(windows)]
    if !args.no_install {
        // May exit after copying / relaunching. Soft-fails and continues in place.
        let _ = install::ensure_installed_or_relaunch();
    }

    // Port bind is the real singleton; mutex is advisory only (avoid false "already running").
    if !install::try_acquire_single_instance() && install::agent_port_in_use() {
        return Ok(());
    }

    init_logging()?;

    let mut cfg = config::load_or_create()?;
    if let Some(erp) = args.erp {
        cfg.erp_base_url = Some(erp);
    }
    if let Some(port) = args.port {
        cfg.port = port;
    }
    if let Some(bind) = args.bind {
        let b = bind.to_ascii_lowercase();
        if b == "lan" || b == "loopback" {
            cfg.bind_mode = b;
        }
    }
    if args.auto_allow {
        cfg.auto_allow = true;
    }
    // Prefer LAN for shared use unless user explicitly set loopback via tray/flag.
    if cfg.bind_mode.is_empty() {
        cfg.bind_mode = "lan".into();
    }
    config::save(&cfg)?;

    let state = AppState {
        cfg: Arc::new(RwLock::new(cfg)),
    };

    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;

    let (listener, port, bind_mode) = match rt.block_on(http::bind_listener(&state)) {
        Ok(v) => v,
        Err(e) => {
            install::show_error(
                "TK 打印代理",
                &format!("无法监听端口:\n{e:#}\n\n可能已被占用，请结束旧的 tk-print-agent 进程后重试。"),
            );
            return Err(e);
        }
    };

    let config_display = config::config_path()?.display().to_string();

    #[cfg(any(windows, target_os = "macos"))]
    let use_tray = !args.no_tray;
    #[cfg(not(any(windows, target_os = "macos")))]
    let use_tray = false;

    if use_tray {
        // Windows/macOS tray event loop must own the main thread. Run HTTP on a
        // background worker with the Tokio handle (do not start tray from #[tokio::main]).
        let handle = rt.handle().clone();
        std::thread::Builder::new()
            .name("tk-print-http".into())
            .spawn(move || {
                handle.block_on(async move {
                    heartbeat::spawn(state.cfg.clone());
                    tracing::info!(
                        "tk-print-agent ready; platform={} config={}",
                        netutil::platform_name(),
                        config_display
                    );
                    if let Err(e) = http::serve_with_listener(state, listener).await {
                        tracing::error!("http server stopped: {e:#}");
                    }
                });
            })
            .expect("spawn http thread");

        #[cfg(any(windows, target_os = "macos"))]
        tray::run_tray_loop(port, bind_mode);

        // Keep runtime alive for the HTTP thread (tray normally never returns).
        drop(rt);
        Ok(())
    } else {
        rt.block_on(async move {
            heartbeat::spawn(state.cfg.clone());
            tracing::info!(
                "tk-print-agent ready; platform={} config={}",
                netutil::platform_name(),
                config_display
            );
            http::serve_with_listener(state, listener).await
        })?;
        Ok(())
    }
}

fn init_logging() -> anyhow::Result<()> {
    // Ignore broken RUST_LOG from parent shells; always keep at least info.
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"))
        .add_directive("tk_print_agent=info".parse()?);
    #[cfg(windows)]
    {
        let dir = config::app_data_dir()?;
        let log_path = dir.join("agent.log");
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)?;
        tracing_subscriber::fmt()
            .with_env_filter(filter)
            .with_writer(std::sync::Mutex::new(file))
            .with_ansi(false)
            .init();
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        tracing_subscriber::fmt().with_env_filter(filter).init();
        Ok(())
    }
}
