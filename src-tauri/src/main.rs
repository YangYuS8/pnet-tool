#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{collections::HashMap, io::Read, sync::{Arc, Mutex}};
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

// ===== PTY support =====
use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
#[derive(Default)]
struct PtyRegistry(Mutex<HashMap<String, PtyEntry>>);
struct PtyEntry {
  child: Box<dyn portable_pty::Child + Send>,
  pair: PtyPair,
  writer: Box<dyn std::io::Write + Send>,
}

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
  let ptys = Arc::new(PtyRegistry::default());

  tauri::Builder::default()
    .manage(pending.clone())
    .manage(ptys.clone())
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
    .invoke_handler(tauri::generate_handler![
      consume_pending_telnet_actions,
      start_pty,
      write_pty,
      resize_pty,
      kill_pty
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[tauri::command]
async fn start_pty(app: tauri::AppHandle, state: State<'_, Arc<PtyRegistry>>, host: String, port: Option<u16>, cols: Option<u16>, rows: Option<u16>) -> Result<String, String> {
  let mut cmd = CommandBuilder::new("telnet");
  cmd.arg(&host);
  cmd.arg(port.unwrap_or(23).to_string());

  let pty_system = native_pty_system();
  let pair = pty_system
    .openpty(PtySize { cols: cols.unwrap_or(80), rows: rows.unwrap_or(24), pixel_width: 0, pixel_height: 0 })
    .map_err(|e| format!("openpty: {e}"))?;
  let child = pair.slave.spawn_command(cmd).map_err(|e| format!("spawn telnet: {e}"))?;

  let mut reader = pair.master.try_clone_reader().map_err(|e| format!("reader: {e}"))?;
  let writer = pair.master.take_writer().map_err(|e| format!("writer: {e}"))?;
  let id = nanoid::nanoid!();

  {
    let mut guard = state.0.lock().map_err(|_| "lock ptys".to_string())?;
    guard.insert(id.clone(), PtyEntry { child, pair, writer });
  }

  let app_handle = app.clone();
  let id_clone = id.clone();
  std::thread::spawn(move || {
    let mut buf = [0u8; 8192];
    loop {
      match reader.read(&mut buf) {
        Ok(0) => break,
        Ok(n) => {
          let _ = app_handle.emit("pty://data", &PtyData { id: id_clone.clone(), data: String::from_utf8_lossy(&buf[..n]).to_string() });
        }
        Err(_) => break,
      }
    }
    let _ = app_handle.emit("pty://exit", &PtyExit { id: id_clone.clone() });
  });

  Ok(id)
}

#[derive(Serialize)]
struct PtyData { id: String, data: String }

#[derive(Serialize)]
struct PtyExit { id: String }

#[tauri::command]
async fn write_pty(state: State<'_, Arc<PtyRegistry>>, id: String, data: String) -> Result<(), String> {
  let mut guard = state.0.lock().map_err(|_| "lock ptys".to_string())?;
  let entry = guard.get_mut(&id).ok_or_else(|| "pty not found".to_string())?;
  use std::io::Write;
  entry.writer.write_all(data.as_bytes()).map_err(|e| format!("write: {e}"))?;
  Ok(())
}

#[tauri::command]
async fn resize_pty(state: State<'_, Arc<PtyRegistry>>, id: String, cols: u16, rows: u16) -> Result<(), String> {
  let guard = state.0.lock().map_err(|_| "lock ptys".to_string())?;
  let entry = guard.get(&id).ok_or_else(|| "pty not found".to_string())?;
  entry.pair.master.resize(PtySize { cols, rows, pixel_width: 0, pixel_height: 0 }).map_err(|e| format!("resize: {e}"))?;
  Ok(())
}

#[tauri::command]
async fn kill_pty(state: State<'_, Arc<PtyRegistry>>, id: String) -> Result<(), String> {
  let mut guard = state.0.lock().map_err(|_| "lock ptys".to_string())?;
  if let Some(mut entry) = guard.remove(&id) {
    let _ = entry.child.kill();
  }
  Ok(())
}
