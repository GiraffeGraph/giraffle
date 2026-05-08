use serde_json::json;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;
use tauri_plugin_updater::UpdaterExt;
use url::Url;

const STORE_FILE: &str = "config.json";
const URL_KEY: &str = "app_url";
const MAIN_LABEL: &str = "main";
const CONFIG_LABEL: &str = "config";

fn load_saved_url(app: &AppHandle) -> Option<String> {
    let store = app.store(STORE_FILE).ok()?;
    let value = store.get(URL_KEY)?;
    value.as_str().map(|s| s.to_string())
}

fn validate_url(input: &str) -> Result<String, String> {
    let parsed = Url::parse(input).map_err(|e| format!("Invalid URL: {}", e))?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed.to_string()),
        other => Err(format!("Unsupported scheme: {}", other)),
    }
}

fn open_main_window(app: &AppHandle, url: &str) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(MAIN_LABEL) {
        existing.close().ok();
    }
    let parsed: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
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
        .title("Giraffle - Configure URL")
        .inner_size(520.0, 360.0)
        .resizable(false)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_url(app: AppHandle, url: String) -> Result<String, String> {
    let normalized = validate_url(&url)?;
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(URL_KEY, json!(normalized.clone()));
    store.save().map_err(|e| e.to_string())?;

    open_main_window(&app, &normalized)?;
    if let Some(cfg) = app.get_webview_window(CONFIG_LABEL) {
        cfg.close().ok();
    }
    Ok(normalized)
}

#[tauri::command]
fn reset_url(app: AppHandle) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.delete(URL_KEY);
    store.save().map_err(|e| e.to_string())?;

    open_config_window(&app)?;
    if let Some(main) = app.get_webview_window(MAIN_LABEL) {
        main.close().ok();
    }
    Ok(())
}

#[tauri::command]
fn get_saved_url(app: AppHandle) -> Option<String> {
    load_saved_url(&app)
}

#[tauri::command]
async fn check_for_updates(app: AppHandle) -> Result<Option<String>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let _version = update.version.clone();
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
        "Change URL…",
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
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            save_url,
            reset_url,
            get_saved_url,
            check_for_updates
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            let menu = build_menu(&handle)?;
            app.set_menu(menu)?;

            app.on_menu_event(move |app, event| {
                let id = event.id().0.as_str();
                match id {
                    "change_url" => {
                        let _ = reset_url(app.clone());
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

            match load_saved_url(&handle) {
                Some(url) => open_main_window(&handle, &url).map_err(|e| e.to_string())?,
                None => open_config_window(&handle).map_err(|e| e.to_string())?,
            }

            spawn_update_check(handle);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
