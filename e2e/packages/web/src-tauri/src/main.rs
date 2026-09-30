// Written once by `pikku app native init` — this file is yours to edit, and
// pikku will not touch it again. The plugins in `frontends.<name>.native` are
// initialised in pikku.rs, which pikku rewrites; keep the `pikku::plugins` call.
//
// The program is in lib.rs: a mobile build never calls `main`, so everything
// has to be reachable from `run()` instead.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    web_app_lib::run()
}
