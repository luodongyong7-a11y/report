use super::{ApplyResult, PaperForm, PaperSpec, PrinterInfo};
use anyhow::{bail, Context, Result};
use std::ffi::OsStr;
use std::fs;
use std::io::Write;
use std::os::windows::ffi::OsStrExt;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;
use tempfile::NamedTempFile;

/// Avoid flashing a console window when launching Sumatra.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
use windows::core::{Error as WinError, PCWSTR};
use windows::Win32::Foundation::{HANDLE, HWND, MAX_PATH, RECTL, SIZE};
use windows::Win32::Graphics::Printing::{
    AddFormW, ClosePrinter, EnumFormsW, EnumPrintersW, GetFormW, OpenPrinterW, SetFormW,
    FORM_INFO_1W, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_2W,
};
use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, IDYES, MB_ICONQUESTION, MB_YESNO};

fn wide(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

pub fn confirm_allow(title: &str, message: &str) -> bool {
    unsafe {
        let t = wide(title);
        let m = wide(message);
        let r = MessageBoxW(
            HWND(std::ptr::null_mut()),
            PCWSTR(m.as_ptr()),
            PCWSTR(t.as_ptr()),
            MB_YESNO | MB_ICONQUESTION,
        );
        r == IDYES
    }
}

pub fn list_printers() -> Result<Vec<PrinterInfo>> {
    unsafe {
        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        let mut needed: u32 = 0;
        let mut returned: u32 = 0;
        let _ = EnumPrintersW(flags, PCWSTR::null(), 2, None, &mut needed, &mut returned);
        if needed == 0 {
            return Ok(Vec::new());
        }
        let mut buf = vec![0u8; needed as usize];
        EnumPrintersW(
            flags,
            PCWSTR::null(),
            2,
            Some(&mut buf),
            &mut needed,
            &mut returned,
        )
        .context("EnumPrintersW")?;

        let mut out = Vec::with_capacity(returned as usize);
        let base = buf.as_ptr() as *const PRINTER_INFO_2W;
        for i in 0..returned as isize {
            let info = &*base.offset(i);
            let name = pwstr_to_string(info.pPrinterName);
            if name.is_empty() {
                continue;
            }
            out.push(PrinterInfo {
                name,
                driver: Some(pwstr_to_string(info.pDriverName)).filter(|s| !s.is_empty()),
                port: Some(pwstr_to_string(info.pPortName)).filter(|s| !s.is_empty()),
                status: info.Status,
            });
        }
        Ok(out)
    }
}

fn pwstr_to_string(p: windows::core::PWSTR) -> String {
    if p.is_null() {
        return String::new();
    }
    unsafe {
        let mut len = 0usize;
        while *p.0.add(len) != 0 {
            len += 1;
            if len > MAX_PATH as usize * 4 {
                break;
            }
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(p.0, len))
    }
}

pub fn list_forms(printer_name: &str) -> Result<Vec<PaperForm>> {
    let mut pname = wide(printer_name);
    let mut handle = HANDLE::default();
    unsafe {
        OpenPrinterW(PCWSTR(pname.as_mut_ptr()), &mut handle, None)
            .ok()
            .with_context(|| format!("OpenPrinterW {printer_name}"))?;
        let mut needed: u32 = 0;
        let mut returned: u32 = 0;
        let _ = EnumFormsW(handle, 1, None, &mut needed, &mut returned);
        if needed == 0 {
            let _ = ClosePrinter(handle);
            return Ok(Vec::new());
        }
        let mut buf = vec![0u8; needed as usize];
        EnumFormsW(handle, 1, Some(&mut buf), &mut needed, &mut returned)
            .ok()
            .context("EnumFormsW")?;
        let mut out = Vec::with_capacity(returned as usize);
        let base = buf.as_ptr() as *const FORM_INFO_1W;
        for i in 0..returned as isize {
            let info = &*base.offset(i);
            let name = pwstr_to_string(info.pName);
            if name.is_empty() {
                continue;
            }
            // FORM size unit is 0.001 mm
            let width_mm = (info.Size.cx as f64) / 1000.0;
            let height_mm = (info.Size.cy as f64) / 1000.0;
            if width_mm <= 0.0 || height_mm <= 0.0 {
                continue;
            }
            out.push(PaperForm {
                name,
                width_mm: (width_mm * 100.0).round() / 100.0,
                height_mm: (height_mm * 100.0).round() / 100.0,
            });
        }
        let _ = ClosePrinter(handle);
        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(out)
    }
}

fn form_exists(printer: HANDLE, form_name: &str) -> bool {
    unsafe {
        let mut name = wide(form_name);
        let mut needed: u32 = 0;
        let _ = GetFormW(printer, PCWSTR(name.as_mut_ptr()), 1, None, &mut needed);
        if needed == 0 {
            return false;
        }
        let mut buf = vec![0u8; needed as usize];
        GetFormW(
            printer,
            PCWSTR(name.as_mut_ptr()),
            1,
            Some(&mut buf),
            &mut needed,
        )
        .as_bool()
    }
}

/// FORM size unit is 0.001 mm.
/// ImageableArea (可打印区域) = full paper Size — same as Windows form defaults.
fn ensure_form(printer_name: &str, paper: &PaperSpec) -> Result<String> {
    let form_name = paper.form_name();
    let width = (paper.width_mm * 1000.0).round() as i32;
    let height = (paper.height_mm * 1000.0).round() as i32;
    if width <= 0 || height <= 0 {
        bail!("paper size required");
    }

    let mut pname = wide(printer_name);
    let mut handle = HANDLE::default();
    unsafe {
        OpenPrinterW(PCWSTR(pname.as_mut_ptr()), &mut handle, None)
            .ok()
            .with_context(|| format!("OpenPrinterW {printer_name}"))?;

        let mut fname = wide(&form_name);
        let mut info = FORM_INFO_1W {
            Flags: 0,
            pName: windows::core::PWSTR(fname.as_mut_ptr()),
            Size: SIZE {
                cx: width,
                cy: height,
            },
            ImageableArea: RECTL {
                left: 0,
                top: 0,
                right: width,
                bottom: height,
            },
        };

        let exists = form_exists(handle, &form_name);
        let operation = if exists { "SetFormW" } else { "AddFormW" };
        let ok = if exists {
            SetFormW(
                handle,
                PCWSTR(fname.as_mut_ptr()),
                1,
                &mut info as *mut _ as *mut _,
            )
            .as_bool()
        } else {
            AddFormW(handle, 1, &mut info as *mut _ as *mut _).as_bool()
        };
        let error = if ok { None } else { Some(WinError::from_win32()) };
        let _ = ClosePrinter(handle);
        if let Some(error) = error {
            bail!("{operation} failed: {error}");
        }
    }
    Ok(form_name)
}

pub fn apply_profile(printer_name: &str, paper: &PaperSpec, _set_default: bool) -> Result<ApplyResult> {
    let form_name = ensure_form(printer_name, paper)?;
    Ok(ApplyResult {
        form_name,
        warning: None,
    })
}

/// Embedded at compile time so the shipped package is a single exe.
const SUMATRA_EMBEDDED: &[u8] = include_bytes!("../../third_party/SumatraPDF.exe");
const SUMATRA_SETTINGS_EMBEDDED: &[u8] =
    include_bytes!("../../third_party/SumatraPDF-settings.txt");

fn ensure_embedded_sumatra() -> Result<PathBuf> {
    let dir = crate::config::app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("tk-print-agent"))
        .join("runtime");
    fs::create_dir_all(&dir)?;
    let dest = dir.join("SumatraPDF.exe");
    let need_write = match fs::metadata(&dest) {
        Ok(m) => m.len() as usize != SUMATRA_EMBEDDED.len(),
        Err(_) => true,
    };
    if need_write {
        fs::write(&dest, SUMATRA_EMBEDDED).context("extract embedded SumatraPDF")?;
    }
    let settings = dir.join("SumatraPDF-settings.txt");
    fs::write(&settings, SUMATRA_SETTINGS_EMBEDDED).context("extract SumatraPDF settings")?;
    Ok(dest)
}

fn format_mm(value: f64) -> String {
    super::format_form_mm(value)
}

fn dimensions_match(a: f64, b: f64) -> bool {
    (a - b).abs() <= 0.5
}

/// Prefer an existing printer form with the same stock size (incl. rotated),
/// so print reuses the form created from print-settings instead of adding a
/// second `TK_*` name for the same millimetres.
fn resolve_form_for_print(printer_name: &str, paper: &PaperSpec) -> Result<String> {
    if let Ok(forms) = list_forms(printer_name) {
        for form in forms {
            let same = (dimensions_match(form.width_mm, paper.width_mm)
                && dimensions_match(form.height_mm, paper.height_mm))
                || (dimensions_match(form.width_mm, paper.height_mm)
                    && dimensions_match(form.height_mm, paper.width_mm));
            if same {
                return Ok(form.name);
            }
        }
    }
    ensure_form(printer_name, paper)
}

fn sumatra_paper_arg(printer_name: &str, paper: &PaperSpec) -> String {
    match resolve_form_for_print(printer_name, paper) {
        Ok(name) if !name.is_empty() => format!("paper={name}"),
        _ => format!(
            "paper={}mm x {}mm",
            format_mm(paper.width_mm),
            format_mm(paper.height_mm)
        ),
    }
}

pub fn print_pdf(printer_name: &str, pdf: &[u8], paper: &PaperSpec) -> Result<()> {
    let mut tmp = NamedTempFile::new().context("temp pdf")?;
    tmp.write_all(pdf)?;
    tmp.flush()?;
    let path = tmp.path().to_path_buf();
    let keep = std::env::temp_dir().join(format!("tk-print-{}.pdf", uuid::Uuid::new_v4()));
    fs::copy(&path, &keep)?;

    let orient = if paper.orientation.eq_ignore_ascii_case("landscape") {
        "landscape"
    } else {
        "portrait"
    };
    let paper_arg = sumatra_paper_arg(printer_name, paper);
    let settings = format!("noscale,{paper_arg},{orient}");

    let sumatra = ensure_embedded_sumatra()?;
    let status = Command::new(&sumatra)
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "-print-to",
            printer_name,
            "-silent",
            "-print-settings",
            &settings,
            keep.to_str().unwrap_or(""),
        ])
        .status()
        .context("SumatraPDF launch")?;
    if !status.success() {
        bail!("SumatraPDF exit {status}");
    }
    let _ = fs::remove_file(&keep);
    Ok(())
}
