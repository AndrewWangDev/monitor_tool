use sysinfo::{CpuRefreshKind, Networks, System};
use std::sync::Mutex;
use tauri::{State, Manager};
use serde::Serialize;

#[derive(Serialize)]
struct SystemMetrics {
    cpu_usage: f32,
    total_memory: u64,
    used_memory: u64,
    // Network: total rx/tx bytes across all interfaces
    total_rx: u64,
    total_tx: u64,
}

struct AppState {
    system: Mutex<System>,
    networks: Mutex<Networks>,
}

#[tauri::command]
fn get_metrics(state: State<AppState>) -> SystemMetrics {
    let mut sys = state.system.lock().unwrap();
    let mut networks = state.networks.lock().unwrap();
    
    // Refresh specific components for performance
    sys.refresh_cpu_specifics(CpuRefreshKind::everything()); 
    sys.refresh_memory();
    
    // Refresh networks (fetching data)
    networks.refresh(true); 

    // Use global_cpu_usage() as suggested by compiler
    let cpu_usage = sys.global_cpu_usage(); 
    let total_memory = sys.total_memory();
    let used_memory = sys.used_memory();
    
    let (total_rx, total_tx) = networks.iter().fold((0, 0), |acc, (_, data)| {
        (acc.0 + data.total_received(), acc.1 + data.total_transmitted())
    });

    SystemMetrics {
        cpu_usage,
        total_memory,
        used_memory,
        total_rx,
        total_tx,
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let sys = System::new_all();
            let networks = Networks::new_with_refreshed_list();
            app.manage(AppState {
                system: Mutex::new(sys),
                networks: Mutex::new(networks),
            });
            
            // Iterate all windows to ensure we hit the right one
            for (label, window) in app.webview_windows() {
                println!("Found window: {}", label);
                let _ = window.set_decorations(false);
                let _ = window.set_shadow(false);
                let _ = window.set_resizable(false);
                let _ = window.set_always_on_top(true);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, get_metrics])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
