use crate::config::AgentConfig;
use crate::netutil::{lan_ips, platform_name};
use crate::print;
use serde::Serialize;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tracing::{info, warn};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HeartbeatBody {
    machine_id: String,
    hostname: String,
    platform: String,
    bind_mode: String,
    port: u16,
    lan_ips: Vec<String>,
    printers: Vec<print::PrinterInfo>,
}

pub fn spawn(cfg: Arc<RwLock<AgentConfig>>) {
    tokio::spawn(async move {
        loop {
            if let Err(e) = tick(cfg.clone()).await {
                warn!("heartbeat: {e:#}");
            }
            tokio::time::sleep(Duration::from_secs(30)).await;
        }
    });
}

async fn tick(cfg: Arc<RwLock<AgentConfig>>) -> anyhow::Result<()> {
    let snapshot = {
        let c = cfg.read().await;
        let base = c.erp_base_url.clone().filter(|s| !s.trim().is_empty());
        let Some(base) = base else {
            return Ok(());
        };
        let printers = print::list_printers().unwrap_or_default();
        let body = HeartbeatBody {
            machine_id: c.machine_id.clone(),
            hostname: hostname::get()
                .ok()
                .and_then(|h| h.into_string().ok())
                .unwrap_or_else(|| "unknown".into()),
            platform: platform_name().into(),
            bind_mode: c.bind_mode.clone(),
            port: c.port,
            lan_ips: lan_ips(),
            printers,
        };
        (base.trim_end_matches('/').to_string(), body)
    };

    let url = format!("{}/api/print-agent/heartbeat", snapshot.0);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()?;
    let res = client.post(&url).json(&snapshot.1).send().await?;
    if !res.status().is_success() {
        warn!("heartbeat HTTP {}", res.status());
    } else {
        info!("heartbeat ok");
    }
    Ok(())
}
