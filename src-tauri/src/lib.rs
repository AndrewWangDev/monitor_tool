use sysinfo::{CpuRefreshKind, Networks, System};
use std::sync::Mutex;
use tauri::{Manager, State};
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct SystemMetrics {
    pub cpu_usage: f32,
    pub total_memory: u64,
    pub used_memory: u64,
    pub total_rx: u64,
    pub total_tx: u64,
}

pub struct AppState {
    pub system: Mutex<System>,
    pub networks: Mutex<Networks>,
}

#[tauri::command]
fn get_metrics(state: State<AppState>) -> SystemMetrics {
    // Handle mutex poisoning gracefully to avoid app crash
    let mut sys = state.system.lock().unwrap_or_else(|e| e.into_inner());
    let mut networks = state.networks.lock().unwrap_or_else(|e| e.into_inner());

    // Refresh only necessary CPU metrics for performance and lower overhead
    sys.refresh_cpu_specifics(CpuRefreshKind::nothing().with_cpu_usage());
    sys.refresh_memory();

    // Refresh network interface statistics without dropping inactive interfaces
    networks.refresh(false);

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let sys = System::new_all();
            let networks = Networks::new_with_refreshed_list();
            app.manage(AppState {
                system: Mutex::new(sys),
                networks: Mutex::new(networks),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_metrics])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
