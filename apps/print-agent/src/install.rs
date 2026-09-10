//! First-run self-install + single-instance guard.

use anyhow::{Context, Result};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn install_dir() -> Result<PathBuf> {
    Ok(crate::config::app_data_dir()?)
}

/// Early diagnostics before tracing is initialized (survives MessageBox / silent exits).
pub fn boot_log(msg: &str) {
    let line = format!("{} {}\n", chrono_like_now(), msg);
    let path = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("tk-print-agent")
        .join("boot.log");
    let _ = fs::create_dir_all(path.parent().unwrap_or(Path::new(".")));
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(path) {
        use std::io::Write;
        let _ = f.write_all(line.as_bytes());
    }
}

fn chrono_like_now() -> String {
    use std::time::SystemTime;
    match SystemTime::now().duration_since(SystemTime::UNIX_EPOCH) {
        Ok(d) => format!("{}", d.as_secs()),
        Err(_) => "?".into(),
    }
}

pub fn installed_exe() -> Result<PathBuf> {
    Ok(install_dir()?.join("tk-print-agent.exe"))
}

fn paths_same(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(x), Ok(y)) => x == y,
        _ => a == b,
    }
}

/// Copy to LocalAppData and relaunch from there. Never hard-fails startup:
/// if copy is locked / denied, try launching the installed copy or run in place.
pub fn ensure_installed_or_relaunch() -> Result<()> {
    let current = std::env::current_exe().context("current_exe")?;
    let dest = installed_exe()?;
    let dir = install_dir()?;
    fs::create_dir_all(&dir)?;

    if paths_same(&current, &dest) {
        let _ = register_autostart(&dest);
        return Ok(());
    }

    match fs::copy(&current, &dest) {
        Ok(_) => {
            let _ = register_autostart(&dest);
            let _ = Command::new(&dest).current_dir(&dir).spawn();
            std::process::exit(0);
        }
        Err(_) => {
            // Likely file locked by a running agent.
            if dest.is_file() {
                let _ = register_autostart(&dest);
                // If something already answers /health, do not spawn another process
                // (avoids a blocking "already running" MessageBox on every double-click).
                if agent_port_in_use() {
                    std::process::exit(0);
                }
                let _ = Command::new(&dest).current_dir(&dir).spawn();
                std::process::exit(0);
            }
            // No installed copy: keep running from current path (Downloads, etc.).
            let _ = register_autostart(&current);
            Ok(())
        }
    }
}

/// Best-effort: something is already listening on the agent port.
pub fn agent_port_in_use() -> bool {
    use std::net::{SocketAddr, TcpStream};
    use std::time::Duration;
    let port = read_configured_port().unwrap_or(crate::config::DEFAULT_PORT);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(400)).is_ok()
}

fn read_configured_port() -> Option<u16> {
    let path = crate::config::config_path().ok()?;
    let raw = fs::read_to_string(path).ok()?;
    let raw = raw.strip_prefix('\u{feff}').unwrap_or(&raw);
    serde_json::from_str::<crate::config::AgentConfig>(raw)
        .ok()
        .map(|c| c.port)
}

/// Returns true if this process owns the single-instance mutex.
#[cfg(windows)]
pub fn try_acquire_single_instance() -> bool {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::sync::OnceLock;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{CloseHandle, WAIT_ABANDONED, WAIT_OBJECT_0};
    use windows::Win32::System::Threading::{CreateMutexW, WaitForSingleObject};

    // KEEP the mutex handle alive for the whole process (HANDLE is Copy; don't CloseHandle on drop).
    static MUTEX: OnceLock<isize> = OnceLock::new();

    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }
    let name = wide("Local\\tk-print-agent-singleton");
    unsafe {
        // Do not take ownership in CreateMutex; use WaitForSingleObject(0) so we never
        // mis-read a stale GetLastError() as ERROR_ALREADY_EXISTS.
        let Ok(h) = CreateMutexW(None, false, PCWSTR(name.as_ptr())) else {
            return true;
        };
        let wait = WaitForSingleObject(h, 0);
        if wait == WAIT_OBJECT_0 || wait == WAIT_ABANDONED {
            let _ = MUTEX.set(h.0 as isize);
            true
        } else {
            let _ = CloseHandle(h);
            false
        }
    }
}

#[cfg(not(windows))]
pub fn try_acquire_single_instance() -> bool {
    true
}

#[cfg(windows)]
pub fn show_error(title: &str, message: &str) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
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
            MB_OK | MB_ICONERROR,
        );
    }
}

#[cfg(not(windows))]
pub fn show_error(title: &str, message: &str) {
    eprintln!("{title}: {message}");
}

#[cfg(windows)]
pub fn show_info(title: &str, message: &str) {
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
pub fn show_info(title: &str, message: &str) {
    eprintln!("{title}: {message}");
}

#[cfg(windows)]
fn register_autostart(exe: &Path) -> Result<()> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_WRITE,
        REG_OPTION_NON_VOLATILE, REG_SZ,
    };

    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    let sub = wide(r"Software\Microsoft\Windows\CurrentVersion\Run");
    let name = wide("TK Print Agent");
    let value = wide(&format!("\"{}\"", exe.display()));
    unsafe {
        let mut hkey = HKEY::default();
        let status = RegCreateKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(sub.as_ptr()),
            0,
            PCWSTR::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_WRITE,
            None,
            &mut hkey,
            None,
        );
        if status != ERROR_SUCCESS {
            anyhow::bail!("RegCreateKeyExW failed: {:?}", status);
        }
        let bytes: &[u8] =
            std::slice::from_raw_parts(value.as_ptr() as *const u8, value.len() * 2);
        let set = RegSetValueExW(hkey, PCWSTR(name.as_ptr()), 0, REG_SZ, Some(bytes));
        let _ = RegCloseKey(hkey);
        if set != ERROR_SUCCESS {
            anyhow::bail!("RegSetValueExW failed: {:?}", set);
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn register_autostart(_exe: &Path) -> Result<()> {
    Ok(())
}
