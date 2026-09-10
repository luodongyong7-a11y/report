use crate::config::{self, AgentConfig};
use crate::netutil::{lan_ips, platform_name};
use crate::print::{self, PaperSpec};
use axum::extract::{DefaultBodyLimit, Multipart, Query, State};
use axum::http::{HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use base64::Engine;
use serde::Deserialize;
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
pub struct AppState {
    pub cfg: Arc<RwLock<AgentConfig>>,
}

pub async fn bind_listener(state: &AppState) -> anyhow::Result<(tokio::net::TcpListener, u16, String)> {
    let (bind_mode, port) = {
        let c = state.cfg.read().await;
        (c.bind_mode.clone(), c.port)
    };
    let host = if config::is_lan(&bind_mode) {
        "0.0.0.0"
    } else {
        "127.0.0.1"
    };
    let addr: SocketAddr = format!("{host}:{port}").parse()?;
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| anyhow::anyhow!("bind {addr} failed: {e}"))?;
    tracing::info!("listening on http://{addr} (bindMode={bind_mode})");
    Ok((listener, port, bind_mode))
}

pub async fn serve_with_listener(
    state: AppState,
    listener: tokio::net::TcpListener,
) -> anyhow::Result<()> {
    axum::serve(listener, router(state)).await?;
    Ok(())
}

pub async fn serve(state: AppState) -> anyhow::Result<()> {
    let (listener, _, _) = bind_listener(&state).await?;
    serve_with_listener(state, listener).await
}

pub fn router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any)
        .allow_origin(Any);

    Router::new()
        .route("/health", get(health))
        .route("/printers", get(printers))
        .route("/forms", get(forms))
        .route("/apply-profile", post(apply_profile))
        .route("/print", post(print_multipart))
        .route("/print/json", post(print_json))
        .route("/config", get(get_config).post(set_config))
        .layer(DefaultBodyLimit::max(64 * 1024 * 1024))
        .layer(axum::middleware::from_fn(attach_private_network))
        .layer(cors)
        .with_state(state)
}

async fn attach_private_network(
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> Response {
    let mut res = next.run(req).await;
    res.headers_mut().insert(
        "Access-Control-Allow-Private-Network",
        HeaderValue::from_static("true"),
    );
    res
}

async fn health(State(state): State<AppState>) -> Json<Value> {
    let c = state.cfg.read().await;
    Json(json!({
        "ok": true,
        "service": "tk-print-agent",
        "port": c.port,
        "machineId": c.machine_id,
        "hostname": hostname::get().ok().and_then(|h| h.into_string().ok()).unwrap_or_default(),
        "bindMode": c.bind_mode,
        "lanIps": lan_ips(),
        "platform": platform_name(),
    }))
}

async fn printers() -> impl IntoResponse {
    match print::list_printers() {
        Ok(list) => (StatusCode::OK, Json(json!({ "ok": true, "printers": list }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "ok": false, "error": format!("{e:#}") })),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FormsQuery {
    printer_name: String,
}

async fn forms(Query(q): Query<FormsQuery>) -> impl IntoResponse {
    if q.printer_name.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": "printerName required" })),
        )
            .into_response();
    }
    match print::list_forms(q.printer_name.trim()) {
        Ok(list) => (StatusCode::OK, Json(json!({ "ok": true, "forms": list }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "ok": false, "error": format!("{e:#}") })),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FormBody {
    width_mm: f64,
    height_mm: f64,
    /// Required for apply-profile: Windows form display name.
    #[serde(default)]
    name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApplyBody {
    printer_name: String,
    form: FormBody,
    #[serde(default = "default_orient")]
    orientation: String,
    #[serde(default = "default_true")]
    set_default: bool,
}

fn default_orient() -> String {
    "portrait".into()
}
fn default_true() -> bool {
    true
}

async fn apply_profile(State(state): State<AppState>, Json(body): Json<ApplyBody>) -> impl IntoResponse {
    let form_name = body.form.name.as_deref().unwrap_or("").trim().to_string();
    if form_name.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": "form.name required" })),
        )
            .into_response();
    }
    if !(body.form.width_mm > 0.0 && body.form.height_mm > 0.0) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": "form.widthMm/heightMm required" })),
        )
            .into_response();
    }
    let _ = state; // saving print settings authorizes this local form change; no desktop dialog
    let paper = PaperSpec {
        width_mm: body.form.width_mm,
        height_mm: body.form.height_mm,
        orientation: body.orientation,
        form_name: Some(form_name),
    };
    match print::apply_profile(&body.printer_name, &paper, body.set_default) {
        Ok(r) => (
            StatusCode::OK,
            Json(json!({
                "ok": true,
                "formName": r.form_name,
                "warning": r.warning,
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "ok": false, "error": format!("{e:#}") })),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrintJson {
    printer_name: String,
    #[serde(default)]
    width_mm: f64,
    #[serde(default)]
    height_mm: f64,
    #[serde(default = "default_orient")]
    orientation: String,
    pdf_base64: String,
}

async fn print_json(Json(body): Json<PrintJson>) -> impl IntoResponse {
    let pdf = match base64::engine::general_purpose::STANDARD.decode(body.pdf_base64.trim()) {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "ok": false, "error": format!("bad base64: {e}") })),
            )
                .into_response();
        }
    };
    do_print(&body.printer_name, &pdf, body.width_mm, body.height_mm, &body.orientation).await
}

async fn print_multipart(mut multipart: Multipart) -> impl IntoResponse {
    let mut printer_name = String::new();
    let mut width_mm = 210.0f64;
    let mut height_mm = 297.0f64;
    let mut orientation = "portrait".to_string();
    let mut pdf: Option<Vec<u8>> = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" | "pdf" => {
                pdf = field.bytes().await.ok().map(|b| b.to_vec());
            }
            "printerName" => {
                printer_name = field.text().await.unwrap_or_default();
            }
            "widthMm" => {
                width_mm = field
                    .text()
                    .await
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(210.0);
            }
            "heightMm" => {
                height_mm = field
                    .text()
                    .await
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(297.0);
            }
            "orientation" => {
                orientation = field.text().await.unwrap_or_else(|_| "portrait".into());
            }
            _ => {}
        }
    }

    if printer_name.is_empty() || pdf.is_none() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": "printerName and file required" })),
        )
            .into_response();
    }
    do_print(
        &printer_name,
        pdf.as_ref().unwrap(),
        width_mm,
        height_mm,
        &orientation,
    )
    .await
}

async fn do_print(
    printer_name: &str,
    pdf: &[u8],
    width_mm: f64,
    height_mm: f64,
    orientation: &str,
) -> Response {
    let paper = PaperSpec::new(
        if width_mm > 0.0 { width_mm } else { 210.0 },
        if height_mm > 0.0 { height_mm } else { 297.0 },
        orientation,
    );
    match print::print_pdf(printer_name, pdf, &paper) {
        Ok(()) => (StatusCode::OK, Json(json!({ "ok": true }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "ok": false, "error": format!("{e:#}") })),
        )
            .into_response(),
    }
}

async fn get_config(State(state): State<AppState>) -> Json<Value> {
    let c = state.cfg.read().await;
    Json(json!({
        "ok": true,
        "port": c.port,
        "machineId": c.machine_id,
        "bindMode": c.bind_mode,
        "erpBaseUrl": c.erp_base_url,
        "lanIps": lan_ips(),
        "platform": platform_name(),
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetConfigBody {
    bind_mode: Option<String>,
    erp_base_url: Option<String>,
    auto_allow: Option<bool>,
    /// When true and bindMode changed, relaunch process so listen address applies.
    #[serde(default)]
    restart: bool,
}

async fn set_config(
    State(state): State<AppState>,
    Json(body): Json<SetConfigBody>,
) -> impl IntoResponse {
    let mut bind_changed = false;
    let mut c = state.cfg.write().await;
    if let Some(m) = body.bind_mode {
        let m = m.to_ascii_lowercase();
        if (m == "lan" || m == "loopback") && m != c.bind_mode {
            c.bind_mode = m;
            bind_changed = true;
        }
    }
    if let Some(u) = body.erp_base_url {
        c.erp_base_url = if u.trim().is_empty() {
            None
        } else {
            Some(u.trim_end_matches('/').to_string())
        };
    }
    if let Some(a) = body.auto_allow {
        c.auto_allow = a;
    }
    if let Err(e) = config::save(&c) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "ok": false, "error": format!("{e:#}") })),
        )
            .into_response();
    }
    let bind_mode = c.bind_mode.clone();
    drop(c);

    if body.restart && bind_changed {
        tokio::spawn(async {
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            if let Ok(exe) = std::env::current_exe() {
                let dir = exe
                    .parent()
                    .map(|p| p.to_path_buf())
                    .unwrap_or_else(|| std::path::PathBuf::from("."));
                let _ = std::process::Command::new(&exe).current_dir(dir).spawn();
            }
            std::process::exit(0);
        });
    }

    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "bindMode": bind_mode,
            "restarting": body.restart && bind_changed,
        })),
    )
        .into_response()
}
