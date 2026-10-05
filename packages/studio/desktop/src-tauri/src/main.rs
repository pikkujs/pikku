#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent, Wry};
use tauri_plugin_deep_link::DeepLinkExt;

struct Studio {
    port: u16,
    child: Mutex<Option<Child>>,
}

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(4300)
}

fn studio_command(port: u16) -> String {
    let bin = std::env::var("PIKKU_STUDIO_BIN").ok().filter(|b| !b.is_empty()).or_else(|| {
        if cfg!(debug_assertions) {
            Some(format!("{}/../../dist/bin.js", env!("CARGO_MANIFEST_DIR")))
        } else {
            None
        }
    });
    match bin {
        Some(bin) => format!("exec node '{}' --port {}", bin.replace('\'', "'\\''"), port),
        None => format!("exec npx -y @pikku/studio@latest --port {}", port),
    }
}

fn start_server(port: u16) -> std::io::Result<Child> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
    Command::new(shell)
        .args(["-lc", &studio_command(port)])
        .stdin(Stdio::null())
        .spawn()
}

fn stop_server(studio: &Studio) {
    if let Some(mut child) = studio.child.lock().unwrap().take() {
        unsafe {
            libc::kill(child.id() as i32, libc::SIGTERM);
        }
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if let Ok(Some(_)) = child.try_wait() {
                return;
            }
            thread::sleep(Duration::from_millis(100));
        }
        let _ = child.kill();
    }
}

fn studio_call(port: u16, action: &str, body: &serde_json::Value) -> Option<serde_json::Value> {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(10))).ok()?;
    let payload = body.to_string();
    let request = format!(
        "POST /studio/{action} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{payload}",
        payload.len()
    );
    stream.write_all(request.as_bytes()).ok()?;
    let mut response = String::new();
    stream.read_to_string(&mut response).ok()?;
    let (head, body) = response.split_once("\r\n\r\n")?;
    if !head.starts_with("HTTP/1.1 200") {
        return None;
    }
    serde_json::from_str(body).ok()
}

fn wait_for_port(port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        thread::sleep(Duration::from_millis(200));
    }
    false
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn running_projects(port: u16) -> Vec<(String, String)> {
    studio_call(port, "listProjects", &serde_json::json!({}))
        .and_then(|v| v.get("projects").cloned())
        .and_then(|p| p.as_array().cloned())
        .unwrap_or_default()
        .into_iter()
        .filter(|p| p.get("open").and_then(|o| o.as_bool()).unwrap_or(false))
        .filter_map(|p| {
            Some((
                p.get("key")?.as_str()?.to_string(),
                p.get("name")?.as_str()?.to_string(),
            ))
        })
        .collect()
}

fn tray_menu(app: &AppHandle, running: &[(String, String)]) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    menu.append(&MenuItem::with_id(app, "open", "Open Pikku Studio", true, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    if running.is_empty() {
        menu.append(&MenuItem::with_id(app, "none", "No projects running", false, None::<&str>)?)?;
    } else {
        menu.append(&MenuItem::with_id(app, "heading", "Running", false, None::<&str>)?)?;
        for (key, name) in running {
            menu.append(&MenuItem::with_id(app, format!("stop:{key}"), format!("Stop {name}"), true, None::<&str>)?)?;
        }
        menu.append(&MenuItem::with_id(app, "stopall", "Stop all projects", true, None::<&str>)?)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "quit", "Quit Pikku Studio", true, None::<&str>)?)?;
    Ok(menu)
}

fn main() {
    let port = free_port();
    let studio = Arc::new(Studio { port, child: Mutex::new(None) });

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(studio.clone())
        .setup(move |app| {
            #[cfg(debug_assertions)]
            {
                let _ = app.deep_link().register("pikku");
            }
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |_| show_window(&handle));

            *studio.child.lock().unwrap() = Some(start_server(studio.port)?);

            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Pikku Studio")
                .inner_size(1280.0, 860.0)
                .min_inner_size(900.0, 600.0)
                .build()?;

            let tray = TrayIconBuilder::with_id("studio")
                .icon(app.default_window_icon().cloned().unwrap())
                .tooltip("Pikku Studio")
                .menu(&tray_menu(app.handle(), &[])?)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| {
                    let port = app.state::<Arc<Studio>>().port;
                    let id = event.id().as_ref().to_string();
                    match id.as_str() {
                        "open" => show_window(app),
                        "stopall" => {
                            studio_call(port, "closeAllProjects", &serde_json::json!({}));
                        }
                        "quit" => app.exit(0),
                        _ => {
                            if let Some(key) = id.strip_prefix("stop:") {
                                studio_call(port, "closeProject", &serde_json::json!({ "key": key }));
                            }
                        }
                    }
                })
                .build(app)?;

            let port = studio.port;
            let handle = app.handle().clone();
            thread::spawn(move || {
                if !wait_for_port(port, Duration::from_secs(180)) {
                    let _ = window.eval("document.body.textContent = 'Pikku Studio could not start. Check that Node.js is installed.'");
                    return;
                }
                let url = format!("http://127.0.0.1:{port}/console/");
                let _ = window.navigate(url.parse().unwrap());
                let mut shown: Option<Vec<(String, String)>> = None;
                loop {
                    let running = running_projects(port);
                    if shown.as_ref() != Some(&running) {
                        let title = if running.is_empty() { String::new() } else { running.len().to_string() };
                        let menu_handle = handle.clone();
                        let tray = tray.clone();
                        let list = running.clone();
                        let _ = handle.run_on_main_thread(move || {
                            if let Ok(menu) = tray_menu(&menu_handle, &list) {
                                let _ = tray.set_menu(Some(menu));
                            }
                            let _ = tray.set_title(Some(title));
                        });
                        shown = Some(running);
                    }
                    thread::sleep(Duration::from_secs(3));
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("Pikku Studio failed to start");

    app.run(|app, event| match event {
        RunEvent::Exit => stop_server(&app.state::<Arc<Studio>>()),
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => show_window(app),
        _ => {}
    });
}
