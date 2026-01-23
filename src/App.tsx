import { useState, useEffect } from "react";
import "./App.css";
import { Activity, Wifi, Battery, GripHorizontal, Settings } from "lucide-react";
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

function App() {
  const [isHovered, setIsHovered] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [visibleMetrics, setVisibleMetrics] = useState({
    cpu: true,
    ram: true,
    network: true,
    battery: true
  });

  // Drag handler
  const startDrag = async () => {
    await getCurrentWindow().startDragging();
  };

  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [prevMetrics, setPrevMetrics] = useState<SystemMetrics | null>(null);
  const [networkSpeed, setNetworkSpeed] = useState({ rx: 0, tx: 0 }); // Bytes per sec
  const [battery, setBattery] = useState({ level: 100, charging: false, available: false });

  // Fetch Metrics Loop
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const data: SystemMetrics = await invoke("get_metrics");

        setPrevMetrics(current => {
          if (current) {
            // Calculate speed
            const rxSpeed = data.total_rx - current.total_rx; // Bytes diff
            const txSpeed = data.total_tx - current.total_tx;
            // Handle potential overflow or reset
            setNetworkSpeed({
              rx: rxSpeed >= 0 ? rxSpeed : 0,
              tx: txSpeed >= 0 ? txSpeed : 0
            });
          }
          return data;
        });
        setMetrics(data);
      } catch (e) {
        console.error("Failed to fetch metrics", e);
      }
    };

    const interval = setInterval(fetchMetrics, 1000);
    fetchMetrics(); // Initial call
    return () => clearInterval(interval);
  }, []);

  // Battery Monitor
  useEffect(() => {
    let batteryApi: any;
    const updateBattery = () => {
      if (batteryApi) {
        setBattery({
          level: Math.round(batteryApi.level * 100),
          charging: batteryApi.charging,
          available: true
        });
      }
    };

    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((b: any) => {
        batteryApi = b;
        updateBattery();
        b.addEventListener('levelchange', updateBattery);
        b.addEventListener('chargingchange', updateBattery);
      });
    }

    return () => {
      if (batteryApi) {
        batteryApi.removeEventListener('levelchange', updateBattery);
        batteryApi.removeEventListener('chargingchange', updateBattery);
      }
    };
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytes: number) => `${formatBytes(bytes)}/s`;

  return (
    <div className="app-container">
      {/* Title Bar / Drag Region - Explicitly draggable via JS */}
      <div
        className="title-bar"
        onMouseDown={startDrag}
        style={{ cursor: 'grab', zIndex: 50 }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          className={clsx("transition-opacity duration-300", isHovered || showSettings ? "opacity-100" : "opacity-0")}
          onClick={(e) => {
            e.stopPropagation(); // Prevent drag when clicking settings
            setShowSettings(!showSettings);
          }}
        >
          <Settings size={16} className="text-[var(--md-sys-color-on-surface-variant)] cursor-pointer hover:rotate-45 transition-transform" />
        </div>
      </div>

      {/* Settings Overlay */}
      {showSettings && (
        <div className="absolute inset-x-0 top-8 bg-[var(--md-sys-color-surface)] z-10 p-4 border-b border-[var(--md-sys-color-outline)] shadow-lg animate-in slide-in-from-top-2">
          <h3 className="text-headline mb-4">Display</h3>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={visibleMetrics.cpu} onChange={e => setVisibleMetrics({ ...visibleMetrics, cpu: e.target.checked })} />
              <span className="text-body">CPU Info</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={visibleMetrics.ram} onChange={e => setVisibleMetrics({ ...visibleMetrics, ram: e.target.checked })} />
              <span className="text-body">Memory</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={visibleMetrics.network} onChange={e => setVisibleMetrics({ ...visibleMetrics, network: e.target.checked })} />
              <span className="text-body">Network Speed</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={visibleMetrics.battery} onChange={e => setVisibleMetrics({ ...visibleMetrics, battery: e.target.checked })} />
              <span className="text-body">Battery</span>
            </label>
          </div>
        </div>
      )}

      <div className="content">
        {/* CPU Monitor */}
        {visibleMetrics.cpu && (
          <div className="card-metric">
            <Activity size={24} className="text-primary" style={{ color: 'var(--md-sys-color-primary)' }} />
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
            {/* Mock Icon for RAM */}
            <div className="w-6 h-6 rounded-md border-2 border-[var(--md-sys-color-primary)] flex items-center justify-center text-[10px] font-bold text-[var(--md-sys-color-primary)]">R</div>
            <div className="flex-1">
              <div className="text-label">Memory</div>
              <div className="text-headline">
                {metrics ? Math.round((metrics.used_memory / metrics.total_memory) * 100) : 0}%
                <span className="text-body text-[var(--md-sys-color-on-surface-variant)] ml-2">
                  {metrics ? formatBytes(metrics.used_memory) : '0 GB'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Network Monitor */}
        {visibleMetrics.network && (
          <div className="card-metric">
            <Wifi size={24} style={{ color: 'var(--md-sys-color-primary)' }} />
            <div className="flex-1">
              <div className="text-label">Network</div>
              <div className="text-body flex justify-between">
                <span>↓ {formatSpeed(networkSpeed.rx)}</span>
                <span className="opacity-50">↑ {formatSpeed(networkSpeed.tx)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Battery (Conditional) */}
        {visibleMetrics.battery && battery.available && (
          <div className="card-metric">
            <Battery size={24} style={{ color: 'var(--md-sys-color-primary)' }} />
            <div className="flex-1">
              <div className="text-label">Battery {battery.charging ? '(Charging)' : ''}</div>
              <div className="text-headline">{battery.level}%</div>
            </div>
          </div>
        )}

      </div>

      {/* Footer / Drag Handle (Optional bottom drag) */}
      <div
        className="h-4 w-full flex justify-center items-center opacity-20"
        onMouseDown={startDrag}
        style={{ cursor: 'grab' }}
      >
        <GripHorizontal size={16} />
      </div>
    </div>
  );
}

export default App;
