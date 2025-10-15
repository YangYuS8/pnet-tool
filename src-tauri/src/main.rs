#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State, Url};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum TelnetAction {
  Open { request: TelnetLaunchRequest },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TelnetLaunchRequest {
  host: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  port: Option<u16>,
  #[serde(skip_serializing_if = "Option::is_none")]
  label: Option<String>,
}

#[derive(Default)]
struct PendingActions(Mutex<Vec<TelnetAction>>);

fn parse_telnet_url(url: &str) -> Option<TelnetLaunchRequest> {
  // Accept formats like telnet://host or telnet://host:port
  // Be tolerant to cases where only host:port is passed (without scheme)
  let mut work = url.trim().to_string();
  if work.is_empty() {
    return None;
  }
  if !work.to_lowercase().starts_with("telnet://") {
    // try to coerce
    work = format!("telnet://{}", work);
  }
  let parsed = Url::parse(&work).ok()?;
  let host = parsed.host_str()?.to_string();
  let port = parsed.port();
  Some(TelnetLaunchRequest { host, port, label: None })
}

#[tauri::command]
fn consume_pending_telnet_actions(state: State<Arc<PendingActions>>) -> Vec<TelnetAction> {
  let mut guard = state.0.lock().unwrap();
  let actions = guard.clone();
  guard.clear();
  actions
}

fn main() {
  let pending = Arc::new(PendingActions::default());

  tauri::Builder::default()
    .manage(pending.clone())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
      // Handle subsequent invocations (deep links)
      let mut new_actions: Vec<TelnetAction> = Vec::new();
      for arg in argv.into_iter().skip(1) { // skip binary path
        if let Some(req) = parse_telnet_url(&arg) {
          new_actions.push(TelnetAction::Open { request: req });
        }
      }
      if !new_actions.is_empty() {
        if let Some(state) = app.try_state::<Arc<PendingActions>>() {
          if let Ok(mut guard) = state.0.lock() {
            guard.extend(new_actions.clone());
          }
        }
  let _ = app.emit("telnet://requests", &new_actions);
      }
    }))
    .setup(move |app| {
      // Capture initial argv deep links
      let mut initial_actions: Vec<TelnetAction> = Vec::new();
      for arg in std::env::args().skip(1) { // skip binary path
        if let Some(req) = parse_telnet_url(&arg) {
          initial_actions.push(TelnetAction::Open { request: req });
        }
      }
      if !initial_actions.is_empty() {
        if let Some(state) = app.try_state::<Arc<PendingActions>>() {
          if let Ok(mut guard) = state.0.lock() {
            guard.extend(initial_actions);
          }
        }
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![consume_pending_telnet_actions])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
