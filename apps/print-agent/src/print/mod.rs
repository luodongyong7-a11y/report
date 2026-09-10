use anyhow::Result;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterInfo {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub driver: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<String>,
    #[serde(default)]
    pub status: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperForm {
    pub name: String,
    pub width_mm: f64,
    pub height_mm: f64,
}

#[derive(Debug, Clone)]
pub struct PaperSpec {
    pub width_mm: f64,
    pub height_mm: f64,
    pub orientation: String,
    /// Custom Windows form display name; empty → auto `TK_{w}x{h}`.
    pub form_name: Option<String>,
}

impl PaperSpec {
    pub fn new(width_mm: f64, height_mm: f64, orientation: impl Into<String>) -> Self {
        Self {
            width_mm,
            height_mm,
            orientation: orientation.into(),
            form_name: None,
        }
    }

    pub fn form_name(&self) -> String {
        let name = self.form_name.as_deref().unwrap_or("").trim();
        if !name.is_empty() {
            return name.to_string();
        }
        // Keep two decimals (trim trailing zeros) so names match the web client
        // (`TK_76.2x127`) instead of integer rounding (`TK_76x127`).
        format!(
            "TK_{}x{}",
            format_form_mm(self.width_mm),
            format_form_mm(self.height_mm)
        )
    }
}

/// Form-name dimension: round to 0.01 mm, drop trailing zeros (matches JS `formatFormDimension`).
pub fn format_form_mm(value: f64) -> String {
    let rounded = (value * 100.0).round() / 100.0;
    let text = format!("{rounded:.2}");
    text.trim_end_matches('0').trim_end_matches('.').to_string()
}

#[derive(Debug, Clone)]
pub struct ApplyResult {
    pub form_name: String,
    pub warning: Option<String>,
}

pub fn list_printers() -> Result<Vec<PrinterInfo>> {
    #[cfg(windows)]
    {
        windows_impl::list_printers()
    }
    #[cfg(unix)]
    {
        unix_impl::list_printers()
    }
    #[cfg(not(any(windows, unix)))]
    {
        Ok(Vec::new())
    }
}

pub fn list_forms(printer_name: &str) -> Result<Vec<PaperForm>> {
    #[cfg(windows)]
    {
        windows_impl::list_forms(printer_name)
    }
    #[cfg(unix)]
    {
        let _ = printer_name;
        Ok(Vec::new())
    }
    #[cfg(not(any(windows, unix)))]
    {
        let _ = printer_name;
        Ok(Vec::new())
    }
}

pub fn apply_profile(printer_name: &str, paper: &PaperSpec, set_default: bool) -> Result<ApplyResult> {
    #[cfg(windows)]
    {
        windows_impl::apply_profile(printer_name, paper, set_default)
    }
    #[cfg(unix)]
    {
        unix_impl::apply_profile(printer_name, paper, set_default)
    }
    #[cfg(not(any(windows, unix)))]
    {
        let _ = (printer_name, set_default);
        Ok(ApplyResult {
            form_name: paper.form_name(),
            warning: Some("unsupported platform".into()),
        })
    }
}

pub fn print_pdf(printer_name: &str, pdf: &[u8], paper: &PaperSpec) -> Result<()> {
    #[cfg(windows)]
    {
        windows_impl::print_pdf(printer_name, pdf, paper)
    }
    #[cfg(unix)]
    {
        unix_impl::print_pdf(printer_name, pdf, paper)
    }
    #[cfg(not(any(windows, unix)))]
    {
        let _ = (printer_name, pdf, paper);
        anyhow::bail!("unsupported platform")
    }
}

pub fn confirm_allow(title: &str, message: &str) -> bool {
    #[cfg(windows)]
    {
        windows_impl::confirm_allow(title, message)
    }
    #[cfg(not(windows))]
    {
        tracing::info!("{title}: {message} (auto-allow on non-Windows)");
        let _ = (title, message);
        true
    }
}

#[cfg(windows)]
mod windows_impl;
#[cfg(unix)]
mod unix_impl;
