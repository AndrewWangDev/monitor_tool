use sysinfo::{CpuRefreshKind, MemoryRefreshKind, Networks, RefreshKind, System};
use std::sync::Mutex;
use tauri::{Manager, State};
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
use tauri::menu::{Menu, MenuItem};
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct SystemMetrics {
    pub cpu_usage: f32,
    pub total_memory: u64,
    pub used_memory: u64,
    pub total_rx: u64,
    pub total_tx: u64,
    pub battery_available: bool,
    pub battery_level: u8,
    pub is_charging: bool,
}

pub struct AppState {
    pub system: Mutex<System>,
    pub networks: Mutex<Networks>,
}

#[cfg(windows)]
#[repr(C)]
struct SYSTEM_POWER_STATUS {
    ac_line_status: u8,
    battery_flag: u8,
    battery_life_percent: u8,
    system_status_flag: u8,
    battery_life_time: u32,
    battery_full_life_time: u32,
}

#[cfg(windows)]
extern "system" {
    fn GetSystemPowerStatus(lpSystemPowerStatus: *mut SYSTEM_POWER_STATUS) -> i32;
}

#[cfg(windows)]
fn get_native_battery_status() -> (bool, u8, bool) {
    let mut status = SYSTEM_POWER_STATUS {
        ac_line_status: 255,
        battery_flag: 255,
        battery_life_percent: 255,
        system_status_flag: 0,
        battery_life_time: 0,
        battery_full_life_time: 0,
    };
    if unsafe { GetSystemPowerStatus(&mut status) } != 0 {
        // 128 indicates no system battery installed (desktop PC)
        // 255 indicates unknown battery status
        if status.battery_flag != 128 && status.battery_flag != 255 && status.battery_life_percent <= 100 {
            let is_charging = (status.battery_flag & 8) != 0 || status.ac_line_status == 1;
            return (true, status.battery_life_percent, is_charging);
        }
    }
    (false, 100, false)
}

#[cfg(not(windows))]
fn get_native_battery_status() -> (bool, u8, bool) {
    (false, 100, false)
}

#[tauri::command]
fn get_metrics(state: State<AppState>) -> SystemMetrics {
    let mut sys = state.system.lock().unwrap_or_else(|e| e.into_inner());
    let mut networks = state.networks.lock().unwrap_or_else(|e| e.into_inner());

    // Refresh only necessary CPU metrics for performance and lower overhead
    sys.refresh_cpu_specifics(CpuRefreshKind::nothing().with_cpu_usage());
    sys.refresh_memory();

    // Refresh network interface list and statistics dynamically (detects hotplug)
    networks.refresh(true);

    let cpu_usage = sys.global_cpu_usage();
    let total_memory = sys.total_memory();
    let used_memory = sys.used_memory();

    // Filter out loopback (lo / loopback) and common virtual interfaces (WSL / Docker / VM)
    let (total_rx, total_tx) = networks.iter().filter(|(name, _)| {
        let n = name.to_lowercase();
        !n.contains("loopback")
            && !n.starts_with("lo")
            && !n.contains("vethernet")
            && !n.contains("virtual")
            && !n.contains("vmware")
            && !n.contains("docker")
    }).fold((0, 0), |acc, (_, data)| {
        (acc.0 + data.total_received(), acc.1 + data.total_transmitted())
    });

    let (battery_available, battery_level, is_charging) = get_native_battery_status();

    SystemMetrics {
        cpu_usage,
        total_memory,
        used_memory,
        total_rx,
        total_tx,
        battery_available,
        battery_level,
        is_charging,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Precise initialization to avoid scanning processes, disks, users on cold start
            let sys = System::new_with_specifics(
                RefreshKind::nothing()
                    .with_cpu(CpuRefreshKind::nothing().with_cpu_usage())
                    .with_memory(MemoryRefreshKind::everything()),
            );
            let networks = Networks::new_with_refreshed_list();
            app.manage(AppState {
                system: Mutex::new(sys),
                networks: Mutex::new(networks),
            });

            // Set up System Tray menu
            let show_i = MenuItem::with_id(app, "show", "显示悬浮窗", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "退出程序", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            let is_minimized = window.is_minimized().unwrap_or(false);
                            if is_visible && !is_minimized {
                                let _ = window.hide();
                            } else {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            let _ = tray_builder.build(app);

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![get_metrics])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
