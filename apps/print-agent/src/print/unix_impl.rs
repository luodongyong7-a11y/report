use super::{ApplyResult, PaperSpec, PrinterInfo};
use anyhow::{bail, Context, Result};
use std::io::Write;
use std::process::Command;
use tempfile::NamedTempFile;

pub fn list_printers() -> Result<Vec<PrinterInfo>> {
    let output = Command::new("lpstat")
        .args(["-a"])
        .output()
        .context("lpstat failed (is CUPS installed?)")?;
    if !output.status.success() {
        bail!(
            "lpstat error: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut printers = Vec::new();
    for line in text.lines() {
        let name = line.split_whitespace().next().unwrap_or("").trim();
        if name.is_empty() {
            continue;
        }
        printers.push(PrinterInfo {
            name: name.to_string(),
            driver: None,
            port: None,
            status: 0,
        });
    }
    Ok(printers)
}

pub fn apply_profile(printer_name: &str, paper: &PaperSpec, _set_default: bool) -> Result<ApplyResult> {
    let form = paper.form_name();
    // CUPS custom media is typically applied at job time; mark as soft-ok.
    let _ = printer_name;
    Ok(ApplyResult {
        form_name: form,
        warning: Some(
            "unix: custom media applied at print time via lp -o media=Custom.WxHmm".into(),
        ),
    })
}

pub fn print_pdf(printer_name: &str, pdf: &[u8], paper: &PaperSpec) -> Result<()> {
    let mut tmp = NamedTempFile::new().context("temp pdf")?;
    tmp.write_all(pdf)?;
    tmp.flush()?;
    let path = tmp.path();

    let w = paper.width_mm;
    let h = paper.height_mm;
    let media = format!("Custom.{w}x{h}mm");
    let orient = if paper.orientation.eq_ignore_ascii_case("landscape") {
        "landscape"
    } else {
        "portrait"
    };

    let output = Command::new("lp")
        .args([
            "-d",
            printer_name,
            "-o",
            &format!("media={media}"),
            "-o",
            &format!("orientation-requested={}", if orient == "landscape" { "4" } else { "3" }),
            path.to_str().unwrap_or(""),
        ])
        .output()
        .context("lp failed")?;
    if !output.status.success() {
        bail!("lp error: {}", String::from_utf8_lossy(&output.stderr));
    }
    Ok(())
}
