import { useState, useEffect, useRef } from "react";
import "./App.css";
import { Activity, Wifi, Battery, GripHorizontal, Settings, X, Minus } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import clsx from "clsx";

interface SystemMetrics {
  cpu_usage: number;
  total_memory: number;
  used_memory: number;
  total_rx: number;
  total_tx: number;
}

interface VisibleMetricsState {
  cpu: boolean;
  ram: boolean;
  network: boolean;
  battery: boolean;
}

const STORAGE_KEY_METRICS = "toolkit_visible_metrics";

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
  const handleStartDrag = async (e: React.MouseEvent) => {
    // Only drag with left mouse button
    if (e.button === 0) {
      try {
        await getCurrentWindow().startDragging();
      } catch (err) {
        console.error("Window drag error", err);
      }
    }
  };

  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (err) {
      console.error("Window minimize error", err);
    }
  };

  const handleClose = async () => {
    try {
      await getCurrentWindow().close();
    } catch (err) {
      console.error("Window close error", err);
    }
  };

  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [networkSpeed, setNetworkSpeed] = useState({ rx: 0, tx: 0 }); // Bytes per sec
  const [battery, setBattery] = useState({ level: 100, charging: false, available: false });

  // Use ref to track previous metrics and timestamp without causing re-renders
  const prevMetricsRef = useRef<{ rx: number; tx: number; time: number } | null>(null);

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

  // Fetch Metrics Loop
  useEffect(() => {
    let isCancelled = false;

    const fetchMetrics = async () => {
      try {
        const data: SystemMetrics = await invoke("get_metrics");
        if (isCancelled) return;

        const now = performance.now();
        if (prevMetricsRef.current) {
          const deltaSec = (now - prevMetricsRef.current.time) / 1000;
          if (deltaSec > 0) {
            const rxDiff = data.total_rx - prevMetricsRef.current.rx;
            const txDiff = data.total_tx - prevMetricsRef.current.tx;
            setNetworkSpeed({
              rx: rxDiff >= 0 ? Math.round(rxDiff / deltaSec) : 0,
              tx: txDiff >= 0 ? Math.round(txDiff / deltaSec) : 0,
            });
          }
        }

        prevMetricsRef.current = {
          rx: data.total_rx,
          tx: data.total_tx,
          time: now,
        };

        setMetrics(data);
      } catch (e) {
        console.error("Failed to fetch metrics", e);
      }
    };

    const interval = setInterval(fetchMetrics, 1000);
    fetchMetrics(); // Initial call
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Battery Monitor with race condition guard
  useEffect(() => {
    let isMounted = true;
    let batteryApi: any = null;

    const updateBattery = () => {
      if (isMounted && batteryApi) {
        setBattery({
          level: Math.round(batteryApi.level * 100),
          charging: batteryApi.charging,
          available: true,
        });
      }
    };

    if (typeof navigator !== "undefined" && "getBattery" in navigator) {
      (navigator as any)
        .getBattery()
        .then((b: any) => {
          if (!isMounted) return;
          batteryApi = b;
          updateBattery();
          b.addEventListener("levelchange", updateBattery);
          b.addEventListener("chargingchange", updateBattery);
        })
        .catch(() => {
          // Battery API unsupported or restricted
        });
    }

    return () => {
      isMounted = false;
      if (batteryApi) {
        batteryApi.removeEventListener("levelchange", updateBattery);
        batteryApi.removeEventListener("chargingchange", updateBattery);
      }
    };
  }, []);

  // Safe byte formatting with domain check
  const formatBytes = (bytes: number) => {
    if (isNaN(bytes) || bytes <= 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatSpeed = (bytes: number) => `${formatBytes(bytes)}/s`;

  return (
    <div className="app-container">
      {/* Title Bar / Drag Region */}
      <div
        className="title-bar"
        data-tauri-drag-region
        onMouseDown={handleStartDrag}
        style={{ cursor: "grab", zIndex: 50 }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          className={clsx(
            "flex items-center gap-2 transition-opacity duration-200",
            isHovered || showSettings ? "opacity-100" : "opacity-0"
          )}
          onMouseDown={(e) => e.stopPropagation()} // Prevent window drag when clicking controls
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
              <div className="text-headline">
                {metrics ? Math.round(metrics.cpu_usage) : 0}%
              </div>
            </div>
          </div>
        )}

        {/* RAM Monitor */}
        {visibleMetrics.ram && (
          <div className="card-metric">
            {/* Custom Icon for RAM */}
            <div
              className="w-6 h-6 rounded border-2 flex items-center justify-center text-[10px] font-bold"
              style={{
                borderColor: "var(--md-sys-color-primary)",
                color: "var(--md-sys-color-primary)",
              }}
            >
              R
            </div>
            <div className="flex-1">
              <div className="text-label">Memory</div>
              <div className="text-headline">
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

        {/* Network Monitor */}
        {visibleMetrics.network && (
          <div className="card-metric">
            <Wifi size={24} style={{ color: "var(--md-sys-color-primary)" }} />
            <div className="flex-1">
              <div className="text-label">Network</div>
              <div className="text-body flex justify-between text-xs">
                <span>↓ {formatSpeed(networkSpeed.rx)}</span>
                <span className="opacity-60">↑ {formatSpeed(networkSpeed.tx)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Battery Monitor (Conditional) */}
        {visibleMetrics.battery && battery.available && (
          <div className="card-metric">
            <Battery size={24} style={{ color: "var(--md-sys-color-primary)" }} />
            <div className="flex-1">
              <div className="text-label">
                Battery {battery.charging ? "(Charging)" : ""}
              </div>
              <div className="text-headline">{battery.level}%</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer / Drag Handle */}
      <div
        className="h-5 w-full flex justify-center items-center opacity-30 hover:opacity-60 transition-opacity"
        data-tauri-drag-region
        onMouseDown={handleStartDrag}
        style={{ cursor: "grab" }}
      >
        <GripHorizontal size={16} />
      </div>
    </div>
  );
}

export default App;
