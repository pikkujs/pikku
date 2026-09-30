// Written once by `pikku app native init` — this file is yours to edit, and
// pikku will not touch it again. The plugins in `frontends.<name>.native` are
// initialised in pikku.rs, which pikku rewrites; keep the `pikku::plugins` call.

mod pikku;

/// Mobile has no `main`: Android loads this crate through JNI and iOS links it
/// as a static library, and the attribute generates the entry point each one
/// looks for. On desktop it expands to nothing and `main.rs` calls this.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // A second launch should reach the window already open. There is no second
    // launch to catch on mobile, where the OS owns the app lifecycle and the
    // plugin does not build.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));

    pikku::plugins(builder)
        .run(tauri::generate_context!())
        .expect("error while running the app");
}
