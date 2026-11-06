import { useState, useEffect } from "react";
import "./App.css";
import { Activity, Wifi, Battery, GripHorizontal, Settings, X, Minus, MemoryStick } from "lucide-react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import clsx from "clsx";

interface SystemMetrics {
  cpu_usage: number;
  total_memory: number;
  used_memory: number;
  total_rx: number;
  total_tx: number;
  rx_speed: number;
  tx_speed: number;
  battery_available: boolean;
  battery_level: number;
  is_charging: boolean;
}

interface VisibleMetricsState {
  cpu: boolean;
  ram: boolean;
  network: boolean;
  battery: boolean;
}

const STORAGE_KEY_METRICS = "toolkit_visible_metrics";

// DEF-02: Safe byte formatting with lower and upper bound clamps to prevent underflow
const formatBytes = (bytes: number) => {
  if (isNaN(bytes) || bytes < 1) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const formatSpeed = (bytes: number) => `${formatBytes(bytes)}/s`;

function App() {
  const [isHovered, setIsHovered] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Load preferences from localStorage or fallback to defaults
  const [visibleMetrics, setVisibleMetrics] = useState<VisibleMetricsState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_METRICS);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // Ignore JSON parse errors
    }
    return {
      cpu: true,
      ram: true,
      network: true,
      battery: true,
    };
  });

  // Persist preferences on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_METRICS, JSON.stringify(visibleMetrics));
    } catch {
      // Ignore quota errors
    }
  }, [visibleMetrics]);

  // Window control handlers
  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (err) {
      console.error("Window minimize error", err);
    }
  };

  const handleClose = async () => {
    try {
      await getCurrentWindow().hide();
    } catch (err) {
      console.error("Window hide error", err);
    }
  };

  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [autostart, setAutostart] = useState(false);

  // Initialize autostart status
  useEffect(() => {
    isEnabled().then(setAutostart).catch(() => {});
  }, []);

  const handleToggleAutostart = async (checked: boolean) => {
    try {
      if (checked) {
        await enable();
      } else {
        await disable();
      }
      setAutostart(checked);
    } catch (err) {
      console.error("Failed to toggle autostart:", err);
    }
  };

  // Keyboard shortcut: Escape closes settings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowSettings(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // DEF-07 & NEW-01: Dynamically adjust window height based on active cards and settings visibility
  useEffect(() => {
    const activeCards = [
      visibleMetrics.cpu,
      visibleMetrics.ram,
      visibleMetrics.network,
      visibleMetrics.battery && metrics?.battery_available,
    ].filter(Boolean).length;

    // Base height: 56px (header) + 20px (footer) + per-card 66px
    const contentHeight = 76 + (activeCards === 0 ? 1 : activeCards) * 66;
    // When settings is open, ensure at least 295px safe height so all checkboxes (including autostart) are accessible
    const targetHeight = showSettings
      ? Math.max(contentHeight, 295)
      : Math.max(140, contentHeight);

    getCurrentWindow().setSize(new LogicalSize(300, targetHeight)).catch(() => {});
  }, [visibleMetrics, metrics?.battery_available, showSettings]);

  // Event-Driven Metrics Streaming
  useEffect(() => {
    let isCancelled = false;
    let unlisten: (() => void) | undefined;

    // Fetch initial frame immediately
    invoke<SystemMetrics>("get_metrics")
      .then((data) => {
        if (!isCancelled) setMetrics(data);
      })
      .catch((err) => console.error("Initial metrics fetch error", err));

    // Listen to backend pushed metrics stream
    listen<SystemMetrics>("sys://metrics", (event) => {
      if (!isCancelled) {
        setMetrics(event.payload);
      }
    })
      .then((dispose) => {
        unlisten = dispose;
      })
      .catch((err) => console.error("Listen metrics error", err));

    return () => {
      isCancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  const hasAnyVisibleCard =
    visibleMetrics.cpu ||
    visibleMetrics.ram ||
    visibleMetrics.network ||
    (visibleMetrics.battery && metrics?.battery_available);

  return (
    <div className="app-container">
      {/* DEF-06: Title Bar / Drag Region separated from interactive buttons */}
      <div
        className="title-bar"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Dedicated native drag spacer */}
        <div className="flex-1 h-full" data-tauri-drag-region style={{ cursor: "grab" }} />

        {/* Action buttons (non-draggable to prevent click interception) */}
        <div
          className={clsx(
            "flex items-center gap-2 transition-opacity duration-200 z-10",
            isHovered || showSettings ? "opacity-100" : "opacity-0"
          )}
        >
          <button
            type="button"
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[var(--md-sys-color-on-surface-variant)] transition-colors cursor-pointer"
            onClick={() => setShowSettings((prev) => !prev)}
            title="Settings"
          >
            <Settings
              size={15}
              className={clsx("transition-transform duration-200", showSettings && "rotate-45")}
            />
          </button>
          <button
            type="button"
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[var(--md-sys-color-on-surface-variant)] transition-colors cursor-pointer"
            onClick={handleMinimize}
            title="Minimize"
          >
            <Minus size={15} />
          </button>
          <button
            type="button"
            className="p-1 rounded hover:bg-red-500/80 hover:text-white text-[var(--md-sys-color-on-surface-variant)] transition-colors cursor-pointer"
            onClick={handleClose}
            title="Close"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Settings Overlay */}
      {showSettings && (
        <div className="settings-overlay absolute inset-x-0 top-8 bg-[var(--md-sys-color-surface)] z-20 p-4 border-b border-[var(--md-sys-color-outline)]/20 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-headline text-base font-semibold">Display Metrics</h3>
            <button
              type="button"
              className="text-xs opacity-60 hover:opacity-100 cursor-pointer"
              onClick={() => setShowSettings(false)}
            >
              Done
            </button>
          </div>
          <div className="flex flex-col gap-2.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={visibleMetrics.cpu}
                onChange={(e) => setVisibleMetrics({ ...visibleMetrics, cpu: e.target.checked })}
              />
              <span className="text-body text-sm">CPU Info</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={visibleMetrics.ram}
                onChange={(e) => setVisibleMetrics({ ...visibleMetrics, ram: e.target.checked })}
              />
              <span className="text-body text-sm">Memory</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={visibleMetrics.network}
                onChange={(e) => setVisibleMetrics({ ...visibleMetrics, network: e.target.checked })}
              />
              <span className="text-body text-sm">Network Speed</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={visibleMetrics.battery}
                onChange={(e) => setVisibleMetrics({ ...visibleMetrics, battery: e.target.checked })}
              />
              <span className="text-body text-sm">Battery</span>
            </label>
            <div className="pt-2 mt-0.5 border-t border-[var(--md-sys-color-outline)]/20">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autostart}
                  onChange={(e) => handleToggleAutostart(e.target.checked)}
                />
                <span className="text-body text-sm">Launch on Startup</span>
              </label>
            </div>
          </div>
        </div>
      )}

      <div className="content">
        {/* CPU Monitor */}
        {visibleMetrics.cpu && (
          <div className="card-metric">
            <Activity size={24} style={{ color: "var(--md-sys-color-primary)" }} />
            <div className="flex-1">
              <div className="text-label">CPU Usage</div>
              <div className="text-headline tabular-nums">
                {metrics ? Math.round(metrics.cpu_usage) : 0}%
              </div>
            </div>
          </div>
        )}

        {/* RAM Monitor (DEF-08: Replaced plain text 'R' with MemoryStick icon) */}
        {visibleMetrics.ram && (
          <div className="card-metric">
            <MemoryStick size={24} style={{ color: "var(--md-sys-color-primary)" }} />
            <div className="flex-1">
              <div className="text-label">Memory</div>
              <div className="text-headline tabular-nums">
                {metrics && metrics.total_memory > 0
                  ? Math.round((metrics.used_memory / metrics.total_memory) * 100)
                  : 0}
                %
                <span className="text-body text-[var(--md-sys-color-on-surface-variant)] ml-2 text-xs">
                  {metrics ? formatBytes(metrics.used_memory) : "0 GB"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Network Monitor (DEF-08: font-mono tabular-nums to prevent text jitter) */}
        {visibleMetrics.network && (
          <div className="card-metric">
            <Wifi size={24} style={{ color: "var(--md-sys-color-primary)" }} />
            <div className="flex-1">
              <div className="text-label">Network</div>
              <div className="text-body flex justify-between text-xs font-mono tabular-nums">
                <span>↓ {formatSpeed(metrics?.rx_speed ?? 0)}</span>
                <span className="opacity-60">↑ {formatSpeed(metrics?.tx_speed ?? 0)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Battery Monitor (DEF-03: Powered by native Windows power API) */}
        {visibleMetrics.battery && metrics?.battery_available && (
          <div className="card-metric">
            <Battery size={24} style={{ color: "var(--md-sys-color-primary)" }} />
            <div className="flex-1">
              <div className="text-label">
                Battery {metrics.is_charging ? "(Charging)" : ""}
              </div>
              <div className="text-headline tabular-nums">{metrics.battery_level}%</div>
            </div>
          </div>
        )}

        {/* Empty state when all metrics are disabled */}
        {!hasAnyVisibleCard && (
          <div className="py-4 text-center text-xs opacity-50 select-none">
            All monitors hidden. Open settings to enable.
          </div>
        )}
      </div>

      {/* Footer / Drag Handle */}
      <div
        className="h-4 w-full flex justify-center items-center opacity-30 hover:opacity-60 transition-opacity"
        data-tauri-drag-region
        style={{ cursor: "grab" }}
      >
        <GripHorizontal size={14} />
      </div>
    </div>
  );
}

export default App;
