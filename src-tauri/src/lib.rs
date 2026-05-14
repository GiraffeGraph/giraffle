use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;

use serde_json::{json, Value};
use tauri::async_runtime::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;
use tauri_plugin_updater::UpdaterExt;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::oneshot;
use url::Url;

const STORE_FILE: &str = "config.json";
const MODE_KEY: &str = "mode";
const REMOTE_URL_KEY: &str = "remote_url";
const REMOTE_DB_URL_KEY: &str = "remote_db_url";
const MAIN_LABEL: &str = "main";
const CONFIG_LABEL: &str = "config";

#[derive(Default)]
struct EmbeddedServer {
    child: Option<Child>,
    url: Option<String>,
}

type SharedServer = Arc<Mutex<EmbeddedServer>>;

#[derive(serde::Serialize, Clone)]
struct LaunchStatus {
    stage: String,
    detail: Option<String>,
}

fn store_string(app: &AppHandle, key: &str) -> Option<String> {
    let store = app.store(STORE_FILE).ok()?;
    let value = store.get(key)?;
    value.as_str().map(|s| s.to_string())
}

fn store_set(app: &AppHandle, key: &str, value: Value) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(key, value);
    store.save().map_err(|e| e.to_string())
}

fn store_delete(app: &AppHandle, key: &str) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.delete(key);
    store.save().map_err(|e| e.to_string())
}

fn validate_url(input: &str) -> Result<String, String> {
    let parsed = Url::parse(input).map_err(|e| format!("Invalid URL: {}", e))?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed.to_string()),
        other => Err(format!("Unsupported scheme: {}", other)),
    }
}

fn validate_db_url(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("DB URL is required".into());
    }
    if !trimmed.starts_with("postgres://") && !trimmed.starts_with("postgresql://") {
        return Err("DB URL must start with postgres:// or postgresql://".into());
    }
    Ok(trimmed.to_string())
}

fn open_main_window(app: &AppHandle, url: &str) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(MAIN_LABEL) {
        existing.close().ok();
    }
    let parsed: Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
    WebviewWindowBuilder::new(app, MAIN_LABEL, WebviewUrl::External(parsed))
        .title("Giraffle")
        .inner_size(1280.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn open_config_window(app: &AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(CONFIG_LABEL) {
        existing.set_focus().ok();
        return Ok(());
    }
    WebviewWindowBuilder::new(app, CONFIG_LABEL, WebviewUrl::App("index.html".into()))
        .title("Giraffle - Configure")
        .inner_size(560.0, 460.0)
        .resizable(false)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn runtime_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("runtime"));
        candidates.push(resource_dir.clone());
    }
    if cfg!(debug_assertions) {
        if let Ok(exe) = std::env::current_exe() {
            let mut cursor = exe.clone();
            for _ in 0..4 {
                if !cursor.pop() {
                    break;
                }
                candidates.push(cursor.join("runtime"));
                candidates.push(cursor.join("src-tauri").join("runtime"));
            }
        }
    }
    for candidate in &candidates {
        if candidate.join("bootstrap.mjs").exists() {
            return Ok(candidate.clone());
        }
    }
    Err(format!(
        "runtime/ not found. Tried: {}",
        candidates
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    ))
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dir = base.join("local-runtime");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn node_binary(app: &AppHandle) -> Result<PathBuf, String> {
    // In production Tauri renames the sidecar to `node` (stripping the
    // `-<target-triple>` suffix) next to the app binary. In dev the file
    // stays under `src-tauri/binaries/` with the triple suffix; Tauri's
    // BaseDirectory::Resource points at `target/<profile>/` there, so we add
    // explicit fallbacks walking up to the manifest directory.
    let triple = current_triple();
    let ext = if cfg!(windows) { ".exe" } else { "" };
    let suffixed = format!("node-{triple}{ext}");
    let exe_name = if cfg!(windows) { "node.exe" } else { "node" };

    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(exe_name));
        candidates.push(resource_dir.join("bin").join(exe_name));
        candidates.push(resource_dir.join("binaries").join(&suffixed));
    }

    if cfg!(debug_assertions) {
        if let Ok(exe) = std::env::current_exe() {
            // exe = target/<profile>/<bin>. Walk up to src-tauri/.
            let mut cursor = exe.clone();
            for _ in 0..4 {
                if !cursor.pop() {
                    break;
                }
                candidates.push(cursor.join("binaries").join(&suffixed));
                candidates.push(cursor.join("src-tauri").join("binaries").join(&suffixed));
            }
        }
    }

    for candidate in &candidates {
        if candidate.exists() {
            return Ok(candidate.clone());
        }
    }
    Err(format!(
        "Node sidecar not found. Tried: {}",
        candidates
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    ))
}

fn current_triple() -> &'static str {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "x86_64-apple-darwin"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "x86_64-unknown-linux-gnu"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "aarch64-unknown-linux-gnu"
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "x86_64-pc-windows-msvc"
    } else {
        "unknown"
    }
}

fn emit_status(app: &AppHandle, stage: &str, detail: Option<String>) {
    let _ = app.emit(
        "giraffle://launch-status",
        LaunchStatus {
            stage: stage.to_string(),
            detail,
        },
    );
}

async fn spawn_bootstrap(
    app: AppHandle,
    mode: &str,
    database_url: Option<String>,
) -> Result<(Child, String), String> {
    let runtime = runtime_dir(&app)?;
    let bootstrap = runtime.join("bootstrap.mjs");
    let server_dir = runtime.join("server");
    let node = node_binary(&app)?;

    if !node.exists() {
        return Err(format!("Node binary missing at {}", node.display()));
    }
    if !bootstrap.exists() {
        return Err(format!("bootstrap.mjs missing at {}", bootstrap.display()));
    }
    if !server_dir.join("server.js").exists() {
        return Err(format!(
            "Next standalone server missing at {}",
            server_dir.join("server.js").display()
        ));
    }

    let data = data_dir(&app)?;
    let mut cmd = Command::new(&node);
    cmd.arg(&bootstrap)
        .env("GIRAFFLE_MODE", mode)
        .env("GIRAFFLE_DATA_DIR", &data)
        .env("GIRAFFLE_RESOURCE_DIR", &server_dir)
        .env("NODE_ENV", "production")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    if let Some(url) = database_url.as_ref() {
        cmd.env("GIRAFFLE_DATABASE_URL", url);
    }

    emit_status(&app, "spawning", None);
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().ok_or("bootstrap stdout unavailable")?;
    let stderr = child.stderr.take().ok_or("bootstrap stderr unavailable")?;

    let stderr_buf: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let (ready_tx, ready_rx) = oneshot::channel::<Result<String, String>>();
    let app_for_stdout = app.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        let mut sender = Some(ready_tx);
        while let Ok(Some(line)) = reader.next_line().await {
            if let Ok(parsed) = serde_json::from_str::<Value>(&line) {
                let event = parsed
                    .get("event")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                match event {
                    "ready" => {
                        if let Some(tx) = sender.take() {
                            let url = parsed
                                .get("url")
                                .and_then(|v| v.as_str())
                                .unwrap_or_default()
                                .to_string();
                            let _ = tx.send(Ok(url));
                        }
                    }
                    "fatal" => {
                        let detail = parsed
                            .get("message")
                            .and_then(|v| v.as_str())
                            .unwrap_or("bootstrap fatal")
                            .to_string();
                        if let Some(tx) = sender.take() {
                            let _ = tx.send(Err(detail.clone()));
                        }
                        emit_status(&app_for_stdout, "fatal", Some(detail));
                    }
                    "status" => {
                        let stage = parsed
                            .get("stage")
                            .and_then(|v| v.as_str())
                            .unwrap_or("status")
                            .to_string();
                        emit_status(&app_for_stdout, &stage, None);
                    }
                    _ => {
                        let _ = app_for_stdout.emit("giraffle://bootstrap-log", line.clone());
                    }
                }
            } else {
                let _ = app_for_stdout.emit("giraffle://bootstrap-log", line);
            }
        }
    });

    let app_for_stderr = app.clone();
    let stderr_buf_for_task = stderr_buf.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            eprintln!("[bootstrap] {line}");
            let _ = app_for_stderr.emit("giraffle://bootstrap-stderr", line.clone());
            let mut buf = stderr_buf_for_task.lock().await;
            buf.push(line);
            if buf.len() > 50 {
                let drop_n = buf.len() - 50;
                buf.drain(0..drop_n);
            }
        }
    });

    let result = tokio::time::timeout(std::time::Duration::from_secs(120), ready_rx).await;
    match result {
        Ok(Ok(Ok(url))) => Ok((child, url)),
        Ok(Ok(Err(detail))) => {
            let _ = child.kill().await;
            Err(fmt_with_stderr(&detail, &stderr_buf).await)
        }
        Ok(Err(_)) => {
            // Sender dropped — process exited before sending ready. Give the
            // stderr reader a tick to flush, then surface what we captured.
            let exit_status = tokio::time::timeout(
                std::time::Duration::from_millis(200),
                child.wait(),
            )
            .await;
            let code = match exit_status {
                Ok(Ok(s)) => s.code().map(|c| c.to_string()).unwrap_or("signal".into()),
                _ => "unknown".into(),
            };
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            Err(fmt_with_stderr(
                &format!("bootstrap exited before ready (exit {code})"),
                &stderr_buf,
            )
            .await)
        }
        Err(_) => {
            let _ = child.kill().await;
            Err(fmt_with_stderr("bootstrap did not become ready within 120s", &stderr_buf).await)
        }
    }
}

async fn fmt_with_stderr(detail: &str, buf: &Arc<Mutex<Vec<String>>>) -> String {
    let lines = buf.lock().await.clone();
    if lines.is_empty() {
        detail.to_string()
    } else {
        format!("{detail}\n\nstderr:\n{}", lines.join("\n"))
    }
}

async fn ensure_server_stopped(server: &SharedServer) {
    let mut guard = server.lock().await;
    if let Some(mut child) = guard.child.take() {
        let _ = child.kill().await;
    }
    guard.url = None;
}

async fn start_local_mode(
    app: AppHandle,
    server: SharedServer,
    database_url: Option<String>,
) -> Result<String, String> {
    ensure_server_stopped(&server).await;
    let mode = if database_url.is_some() {
        "external-db"
    } else {
        "local"
    };
    let (child, url) = spawn_bootstrap(app.clone(), mode, database_url).await?;
    let mut guard = server.lock().await;
    guard.child = Some(child);
    guard.url = Some(url.clone());
    Ok(url)
}

#[tauri::command]
async fn get_config(app: AppHandle) -> Result<Value, String> {
    Ok(json!({
        "mode": store_string(&app, MODE_KEY).unwrap_or_else(|| "local".to_string()),
        "remote_url": store_string(&app, REMOTE_URL_KEY).unwrap_or_default(),
        "remote_db_url": store_string(&app, REMOTE_DB_URL_KEY).unwrap_or_default(),
    }))
}

#[tauri::command]
async fn start_local(
    app: AppHandle,
    server: State<'_, SharedServer>,
) -> Result<String, String> {
    store_set(&app, MODE_KEY, json!("local"))?;
    let url = start_local_mode(app.clone(), server.inner().clone(), None).await?;
    open_main_window(&app, &url)?;
    if let Some(cfg) = app.get_webview_window(CONFIG_LABEL) {
        cfg.close().ok();
    }
    Ok(url)
}

#[tauri::command]
async fn start_external_db(
    app: AppHandle,
    server: State<'_, SharedServer>,
    db_url: String,
) -> Result<String, String> {
    let normalized = validate_db_url(&db_url)?;
    store_set(&app, MODE_KEY, json!("external-db"))?;
    store_set(&app, REMOTE_DB_URL_KEY, json!(normalized.clone()))?;
    let url = start_local_mode(app.clone(), server.inner().clone(), Some(normalized)).await?;
    open_main_window(&app, &url)?;
    if let Some(cfg) = app.get_webview_window(CONFIG_LABEL) {
        cfg.close().ok();
    }
    Ok(url)
}

#[tauri::command]
async fn start_remote(
    app: AppHandle,
    server: State<'_, SharedServer>,
    url: String,
    db_url: String,
) -> Result<String, String> {
    let normalized_url = validate_url(&url)?;
    let normalized_db = validate_db_url(&db_url)?;
    ensure_server_stopped(server.inner()).await;
    store_set(&app, MODE_KEY, json!("remote"))?;
    store_set(&app, REMOTE_URL_KEY, json!(normalized_url.clone()))?;
    store_set(&app, REMOTE_DB_URL_KEY, json!(normalized_db))?;
    open_main_window(&app, &normalized_url)?;
    if let Some(cfg) = app.get_webview_window(CONFIG_LABEL) {
        cfg.close().ok();
    }
    Ok(normalized_url)
}

async fn do_reset_config(app: AppHandle, server: SharedServer) -> Result<(), String> {
    ensure_server_stopped(&server).await;
    store_delete(&app, MODE_KEY)?;
    store_delete(&app, REMOTE_URL_KEY)?;
    store_delete(&app, REMOTE_DB_URL_KEY)?;
    open_config_window(&app)?;
    if let Some(main) = app.get_webview_window(MAIN_LABEL) {
        main.close().ok();
    }
    Ok(())
}

#[tauri::command]
async fn reset_config(
    app: AppHandle,
    server: State<'_, SharedServer>,
) -> Result<(), String> {
    do_reset_config(app, server.inner().clone()).await
}

#[tauri::command]
async fn check_for_updates(app: AppHandle) -> Result<Option<String>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    app.restart();
}

fn spawn_update_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let Ok(updater) = app.updater() else { return };
        let check = match updater.check().await {
            Ok(Some(u)) => u,
            _ => return,
        };
        if let Err(err) = check.download_and_install(|_, _| {}, || {}).await {
            eprintln!("auto-update failed: {err}");
            return;
        }
        app.restart();
    });
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let change_url = MenuItem::with_id(
        app,
        "change_url",
        "Change Configuration…",
        true,
        Some("CmdOrCtrl+,"),
    )?;
    let reload = MenuItem::with_id(app, "reload", "Reload", true, Some("CmdOrCtrl+R"))?;
    let check_update = MenuItem::with_id(
        app,
        "check_update",
        "Check for Updates…",
        true,
        None::<&str>,
    )?;
    let quit = PredefinedMenuItem::quit(app, None)?;
    let separator = PredefinedMenuItem::separator(app)?;

    let app_submenu = Submenu::with_items(
        app,
        "Giraffle",
        true,
        &[&change_url, &reload, &check_update, &separator, &quit],
    )?;

    let edit_submenu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    Menu::with_items(app, &[&app_submenu, &edit_submenu])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let server: SharedServer = Arc::new(Mutex::new(EmbeddedServer::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(server.clone())
        .invoke_handler(tauri::generate_handler![
            get_config,
            start_local,
            start_external_db,
            start_remote,
            reset_config,
            check_for_updates
        ])
        .setup(move |app| {
            let handle = app.handle().clone();

            let menu = build_menu(&handle)?;
            app.set_menu(menu)?;

            let server_for_menu = server.clone();
            app.on_menu_event(move |app, event| {
                let id = event.id().0.as_str();
                let app = app.clone();
                let server = server_for_menu.clone();
                match id {
                    "change_url" => {
                        tauri::async_runtime::spawn(async move {
                            let _ = do_reset_config(app, server).await;
                        });
                    }
                    "reload" => {
                        if let Some(win) = app.get_webview_window(MAIN_LABEL) {
                            win.eval("window.location.reload()").ok();
                        }
                    }
                    "check_update" => {
                        spawn_update_check(app.clone());
                    }
                    _ => {}
                }
            });

            let mode = store_string(&handle, MODE_KEY).unwrap_or_default();
            let handle_for_setup = handle.clone();
            let server_for_setup = server.clone();
            tauri::async_runtime::spawn(async move {
                let result: Result<(), String> = match mode.as_str() {
                    "local" => {
                        match start_local_mode(handle_for_setup.clone(), server_for_setup.clone(), None).await {
                            Ok(url) => open_main_window(&handle_for_setup, &url),
                            Err(err) => Err(err),
                        }
                    }
                    "external-db" => {
                        let db_url = store_string(&handle_for_setup, REMOTE_DB_URL_KEY);
                        match db_url {
                            Some(db) => match start_local_mode(handle_for_setup.clone(), server_for_setup.clone(), Some(db)).await {
                                Ok(url) => open_main_window(&handle_for_setup, &url),
                                Err(err) => Err(err),
                            },
                            None => open_config_window(&handle_for_setup),
                        }
                    }
                    "remote" => {
                        match store_string(&handle_for_setup, REMOTE_URL_KEY) {
                            Some(url) => open_main_window(&handle_for_setup, &url),
                            None => open_config_window(&handle_for_setup),
                        }
                    }
                    _ => open_config_window(&handle_for_setup),
                };

                if let Err(err) = result {
                    eprintln!("setup failed: {err}");
                    emit_status(&handle_for_setup, "fatal", Some(err));
                    let _ = open_config_window(&handle_for_setup);
                }
            });

            spawn_update_check(handle);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
