use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

pub const DEFAULT_PORT: u16 = 19290;
pub const APP_DIR_NAME: &str = "tk-print-agent";
pub const AGENT_FILE: &str = "agent.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    pub port: u16,
    pub machine_id: String,
    #[serde(default = "default_bind_mode")]
    pub bind_mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub erp_base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allowed_origin: Option<String>,
    #[serde(default)]
    pub auto_allow: bool,
}

fn default_bind_mode() -> String {
    // Default LAN so shared-host install needs no extra flags.
    "lan".into()
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            port: DEFAULT_PORT,
            machine_id: uuid::Uuid::new_v4().to_string(),
            bind_mode: default_bind_mode(),
            erp_base_url: None,
            allowed_origin: None,
            // Web UI already confirms "写入纸型"; desktop MessageBox on every apply is noisy.
            auto_allow: true,
        }
    }
}

pub fn app_data_dir() -> Result<PathBuf> {
    let base = dirs::data_local_dir().context("no local data dir")?;
    let dir = base.join(APP_DIR_NAME);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn config_path() -> Result<PathBuf> {
    Ok(app_data_dir()?.join(AGENT_FILE))
}

pub fn load_or_create() -> Result<AgentConfig> {
    let path = config_path()?;
    if path.exists() {
        let raw = fs::read_to_string(&path).context("read agent.json")?;
        // PowerShell Set-Content / some editors write UTF-8 BOM; serde_json rejects it.
        let raw = raw.strip_prefix('\u{feff}').unwrap_or(&raw);
        match serde_json::from_str::<AgentConfig>(raw) {
            Ok(cfg) => return Ok(cfg),
            Err(e) => {
                // Corrupt / hand-edited: back up and recreate rather than block startup.
                let bak = path.with_extension("json.bak");
                let _ = fs::copy(&path, &bak);
                crate::install::boot_log(&format!(
                    "agent.json invalid ({e}); recreated (backup {})",
                    bak.display()
                ));
            }
        }
    }
    let cfg = AgentConfig::default();
    save(&cfg)?;
    Ok(cfg)
}

pub fn save(cfg: &AgentConfig) -> Result<()> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let raw = serde_json::to_string_pretty(cfg)?;
    // Write UTF-8 without BOM so round-trips stay serde-compatible.
    fs::write(path, raw.as_bytes())?;
    Ok(())
}

pub fn is_lan(bind_mode: &str) -> bool {
    matches!(bind_mode.to_ascii_lowercase().as_str(), "lan" | "0.0.0.0" | "all")
}
