//! System tray (Windows / macOS). Requires a native event loop on this thread.

use crate::netutil::lan_ips;
use std::process::Command;
use tao::event::{Event, StartCause};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tray_icon::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tray_icon::{Icon, TrayIconBuilder};

enum UserEvent {
    Menu(MenuEvent),
}

fn make_icon() -> Icon {
    let size = 32u32;
    let mut rgba = vec![0u8; (size * size * 4) as usize];
    let r = (size as i32 / 2) - 2;
    let cx = size as i32 / 2;
    let cy = size as i32 / 2;
    for y in 0..size as i32 {
        for x in 0..size as i32 {
            let i = ((y as u32 * size + x as u32) * 4) as usize;
            let dx = x - cx;
            let dy = y - cy;
            if dx * dx + dy * dy <= r * r {
                rgba[i] = 37;
                rgba[i + 1] = 99;
                rgba[i + 2] = 235;
                rgba[i + 3] = 255;
            }
        }
    }
    Icon::from_rgba(rgba, size, size).expect("icon")
}

fn current_bind() -> String {
    crate::config::load_or_create()
        .map(|c| c.bind_mode)
        .unwrap_or_else(|_| "lan".into())
}

fn address_text(port: u16) -> String {
    let bind_mode = current_bind();
    let mut lines = vec![format!("本机: http://127.0.0.1:{port}")];
    if crate::config::is_lan(&bind_mode) {
        lines.push("状态: 已开启局域网共享".into());
        for ip in lan_ips() {
            lines.push(format!("局域网: http://{ip}:{port}"));
        }
        if lines.len() == 2 {
            lines.push("局域网: (未检测到网卡 IP)".into());
        }
    } else {
        lines.push("状态: 仅本机（未共享）".into());
        lines.push("可在托盘选择「开启局域网共享」".into());
    }
    lines.join("\n")
}

#[cfg(windows)]
fn show_info(title: &str, message: &str) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONINFORMATION, MB_OK};
    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }
    unsafe {
        let t = wide(title);
        let m = wide(message);
        let _ = MessageBoxW(
            HWND(std::ptr::null_mut()),
            PCWSTR(m.as_ptr()),
            PCWSTR(t.as_ptr()),
            MB_OK | MB_ICONINFORMATION,
        );
    }
}

#[cfg(not(windows))]
fn show_info(title: &str, message: &str) {
    tracing::info!("{title}\n{message}");
}

fn open_log_dir() {
    if let Ok(dir) = crate::config::app_data_dir() {
        #[cfg(windows)]
        {
            let _ = Command::new("explorer").arg(&dir).spawn();
        }
        #[cfg(target_os = "macos")]
        {
            let _ = Command::new("open").arg(&dir).spawn();
        }
        #[cfg(all(unix, not(target_os = "macos")))]
        {
            let _ = Command::new("xdg-open").arg(&dir).spawn();
        }
    }
}

fn set_bind_and_restart(bind: &str) {
    if let Ok(mut cfg) = crate::config::load_or_create() {
        cfg.bind_mode = bind.to_string();
        let _ = crate::config::save(&cfg);
    }
    restart_self();
}

fn restart_self() {
    if let Ok(exe) = std::env::current_exe() {
        let dir = exe.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| ".".into());
        let _ = Command::new(&exe).current_dir(dir).spawn();
    }
    std::process::exit(0);
}

/// Blocks the calling thread with the tray event loop. Call from a dedicated thread.
pub fn run_tray_loop(port: u16, _bind_mode: String) {
    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();
    MenuEvent::set_event_handler(Some(move |event| {
        let _ = proxy.send_event(UserEvent::Menu(event));
    }));

    let menu = Menu::new();
    let item_addr = MenuItem::new("显示访问地址", true, None);
    let item_share_on = MenuItem::new("开启局域网共享", true, None);
    let item_share_off = MenuItem::new("关闭局域网共享（仅本机）", true, None);
    let item_logs = MenuItem::new("打开日志目录", true, None);
    let item_quit = MenuItem::new("退出", true, None);
    let _ = menu.append(&item_addr);
    let _ = menu.append(&item_share_on);
    let _ = menu.append(&item_share_off);
    let _ = menu.append(&item_logs);
    let _ = menu.append(&PredefinedMenuItem::separator());
    let _ = menu.append(&item_quit);

    let id_addr = item_addr.id().clone();
    let id_share_on = item_share_on.id().clone();
    let id_share_off = item_share_off.id().clone();
    let id_logs = item_logs.id().clone();
    let id_quit = item_quit.id().clone();

    let mut tray_icon = None;
    let tooltip = format!("TK 打印代理 :{port}");

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::NewEvents(StartCause::Init) => {
                match TrayIconBuilder::new()
                    .with_menu(Box::new(menu.clone()))
                    .with_tooltip(&tooltip)
                    .with_icon(make_icon())
                    .build()
                {
                    Ok(icon) => tray_icon = Some(icon),
                    Err(e) => tracing::error!("tray icon: {e}"),
                }
            }
            Event::UserEvent(UserEvent::Menu(ev)) => {
                if ev.id == id_quit {
                    tray_icon.take();
                    std::process::exit(0);
                } else if ev.id == id_addr {
                    show_info("TK 打印代理", &address_text(port));
                } else if ev.id == id_share_on {
                    show_info("TK 打印代理", "正在开启局域网共享并重启…");
                    set_bind_and_restart("lan");
                } else if ev.id == id_share_off {
                    show_info("TK 打印代理", "正在切换为仅本机并重启…");
                    set_bind_and_restart("loopback");
                } else if ev.id == id_logs {
                    open_log_dir();
                }
            }
            Event::LoopDestroyed => {
                tray_icon.take();
            }
            _ => {}
        }
    });
}
