import { TransportProvider } from "@/transport/context";
import { useAS120 } from "@/hooks/useAS120";
import { MotorCard } from "@/components/MotorCard";
import { SystemInfo } from "@/components/SystemInfo";
import { DebugConsole } from "@/components/DebugConsole";
import { TopologyView } from "@/components/TopologyView";
import { AutosamplerView } from "@/components/AutosamplerView";
import { BleSetupWizard } from "@/components/BleSetupWizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Wifi,
  Bluetooth,
  Unplug,
  AlertTriangle,
  Loader2,
  Plug,
  ArrowRight,
  Radio,
  Network,
  ChevronDown,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

type AppMode = "choose" | "wifi" | "ble-setup";

function ChooseMode({ onChoose }: { onChoose: (mode: AppMode) => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <div className="w-full max-w-lg space-y-8">
        {/* Logo area */}
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-border bg-card shadow-lg">
            <Radio className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">AS120</h1>
          <p className="text-sm text-muted-foreground">
            Liquid Handler Control Panel
          </p>
        </div>

        {/* Connection options */}
        <div className="space-y-3">
          <button
            onClick={() => onChoose("wifi")}
            className="group flex w-full items-center gap-4 rounded-xl border-2 border-border bg-card p-5 text-left transition-all hover:border-primary/50 hover:bg-accent/50"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 transition-colors group-hover:bg-emerald-500/20">
              <Wifi className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="font-semibold">Connect via WiFi</div>
              <div className="text-sm text-muted-foreground">
                Already on the same network or AS120-Setup AP
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>

          <button
            onClick={() => onChoose("ble-setup")}
            className="group flex w-full items-center gap-4 rounded-xl border-2 border-border bg-card p-5 text-left transition-all hover:border-blue-500/50 hover:bg-accent/50"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 transition-colors group-hover:bg-blue-500/20">
              <Bluetooth className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="font-semibold">Set Up WiFi via Bluetooth</div>
              <div className="text-sm text-muted-foreground">
                Configure the AS120's WiFi network over BLE
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground/60">
          AS120 Liquid Handler &middot; EST Analytical
        </p>
      </div>
    </div>
  );
}

function WifiDashboard({ onBack, showBack = true }: { onBack: () => void; showBack?: boolean }) {
  const {
    status,
    connected,
    connecting,
    error,
    connect,
    disconnect,
  } = useAS120();

  const faultActive = status && status.fault_code !== 0;

  if (!connected) {
    // Served from device IP — just show a spinner, no user action needed
    if (!showBack) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
          <div className="space-y-4 text-center">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Connecting...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
        <div className="w-full max-w-md space-y-8 text-center">
          {/* Animated illustration */}
          <div className="mx-auto w-80">
            <svg viewBox="0 0 240 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
              {/* Phone body */}
              <rect x="80" y="30" width="80" height="140" rx="12" stroke="#3f3f46" strokeWidth="2" fill="#18181b" />
              <rect x="86" y="44" width="68" height="110" rx="4" fill="#27272a" />
              {/* Phone notch */}
              <rect x="104" y="34" width="32" height="4" rx="2" fill="#3f3f46" />

              {/* WiFi settings mockup inside phone */}
              {/* Header bar */}
              <rect x="86" y="44" width="68" height="16" rx="2" fill="#09090b" />
              <text x="120" y="55" textAnchor="middle" fontSize="7" fill="#a1a1aa" fontFamily="system-ui">Wi-Fi</text>

              {/* Network list items */}
              {/* Network 1 - generic */}
              <rect x="90" y="64" width="60" height="14" rx="2" fill="#18181b" />
              <rect x="94" y="68" width="24" height="3" rx="1" fill="#3f3f46" />
              <path d="M144 69 Q146 66 148 69" stroke="#3f3f46" strokeWidth="1.2" strokeLinecap="round" fill="none" />
              <path d="M142 71 Q146 64 150 71" stroke="#3f3f46" strokeWidth="1.2" strokeLinecap="round" fill="none" />

              {/* Network 2 - AS120-Setup (highlighted) */}
              <rect x="90" y="82" width="60" height="14" rx="2" fill="#065f46" fillOpacity="0.4">
                <animate attributeName="fill-opacity" values="0.2;0.5;0.2" dur="2s" repeatCount="indefinite" />
              </rect>
              <rect x="90" y="82" width="60" height="14" rx="2" stroke="#10b981" strokeWidth="1" strokeOpacity="0.6" fill="none">
                <animate attributeName="stroke-opacity" values="0.3;0.8;0.3" dur="2s" repeatCount="indefinite" />
              </rect>
              <text x="94" y="91.5" fontSize="5.5" fill="#34d399" fontFamily="system-ui" fontWeight="600">AS120-Setup</text>
              {/* Signal icon */}
              <path d="M144 87 Q146 84 148 87" stroke="#34d399" strokeWidth="1.2" strokeLinecap="round" fill="none" />
              <path d="M142 89 Q146 82 150 89" stroke="#34d399" strokeWidth="1.2" strokeLinecap="round" fill="none" />
              <path d="M140 91 Q146 80 152 91" stroke="#34d399" strokeWidth="1.2" strokeLinecap="round" fill="none" />

              {/* Network 3 - generic */}
              <rect x="90" y="100" width="60" height="14" rx="2" fill="#18181b" />
              <rect x="94" y="104" width="20" height="3" rx="1" fill="#3f3f46" />
              <path d="M144 105 Q146 102 148 105" stroke="#3f3f46" strokeWidth="1.2" strokeLinecap="round" fill="none" />

              {/* Tap finger indicator */}
              <g>
                <animateTransform attributeName="transform" type="translate" values="0,4;0,0;0,0;0,4" dur="2.5s" repeatCount="indefinite" />
                {/* Finger */}
                <ellipse cx="135" cy="89" rx="7" ry="8" fill="#a1a1aa" fillOpacity="0.15">
                  <animate attributeName="fill-opacity" values="0;0.2;0.2;0" dur="2.5s" repeatCount="indefinite" />
                </ellipse>
                {/* Tap ripple */}
                <circle cx="135" cy="89" r="10" stroke="#a1a1aa" strokeWidth="0.8" fill="none" strokeOpacity="0">
                  <animate attributeName="r" values="6;14" dur="2.5s" repeatCount="indefinite" />
                  <animate attributeName="stroke-opacity" values="0;0.3;0" dur="2.5s" repeatCount="indefinite" />
                </circle>
              </g>

              {/* Broadcasting waves from AS120 box on the right */}
              <g>
                {/* AS120 device */}
                <rect x="190" y="72" width="36" height="28" rx="4" stroke="#3f3f46" strokeWidth="1.5" fill="#18181b" />
                <text x="208" y="88" textAnchor="middle" fontSize="5" fill="#a1a1aa" fontFamily="system-ui">AS120</text>
                {/* LED */}
                <circle cx="197" cy="80" r="1.5" fill="#34d399">
                  <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
                </circle>

                {/* WiFi broadcast arcs */}
                <g transform="translate(190, 86) rotate(180)">
                  <path d="M0 0 Q-6 -8 0 -16" stroke="#34d399" strokeWidth="1.2" strokeLinecap="round" fill="none" strokeOpacity="0">
                    <animate attributeName="stroke-opacity" values="0;0.6;0" dur="2s" repeatCount="indefinite" />
                  </path>
                  <path d="M0 2 Q-10 -8 0 -18" stroke="#34d399" strokeWidth="1.2" strokeLinecap="round" fill="none" strokeOpacity="0">
                    <animate attributeName="stroke-opacity" values="0;0.4;0" dur="2s" begin="0.3s" repeatCount="indefinite" />
                  </path>
                  <path d="M0 4 Q-14 -8 0 -20" stroke="#34d399" strokeWidth="1.2" strokeLinecap="round" fill="none" strokeOpacity="0">
                    <animate attributeName="stroke-opacity" values="0;0.2;0" dur="2s" begin="0.6s" repeatCount="indefinite" />
                  </path>
                </g>
              </g>

              {/* Dashed connection line between phone and AS120 */}
              <line x1="160" y1="89" x2="188" y2="86" stroke="#34d399" strokeWidth="1" strokeDasharray="3,3" strokeOpacity="0.3">
                <animate attributeName="stroke-opacity" values="0.1;0.5;0.1" dur="2s" repeatCount="indefinite" />
              </line>
            </svg>
          </div>

          {/* Instructions */}
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Connect to AS120</h2>
            <p className="text-sm text-muted-foreground">
              Open your <span className="text-foreground font-medium">WiFi settings</span> and
              connect to the <span className="font-mono text-emerald-400">AS120-Setup</span> network,
              then come back here.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="flex items-center justify-center gap-3">
            {showBack && (
              <Button variant="outline" onClick={onBack}>
                Back
              </Button>
            )}
            <Button onClick={connect} disabled={connecting}>
              {connecting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Plug className="mr-1.5 h-4 w-4" />
              )}
              {connecting ? "Connecting..." : "Connect"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold tracking-tight">AS120 Control Panel</h1>
            <Badge variant="secondary" className="font-mono text-xs">
              v{status?.version}
            </Badge>
            {faultActive && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                Fault
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              <Wifi className="h-3 w-3 text-green-400" />
              {status?.wifi?.ssid || "WiFi"}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => { disconnect(); onBack(); }}>
              <Unplug className="mr-1.5 h-3.5 w-3.5" />
              Disconnect
            </Button>
          </div>
        </div>
      </header>

      {/* Fault banner */}
      {faultActive && (
        <div className="border-b border-red-500/20 bg-red-950/30 px-4 py-3">
          <div className="mx-auto flex max-w-6xl items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <div className="space-y-1">
              <div className="text-sm font-semibold text-red-400">
                Fault Code {status?.fault_code}
              </div>
              <div className="text-sm text-red-300/80">
                {status?.fault_message || "Unknown fault — check firmware logs for details"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard */}
      <main className="flex-1">
        {status && status.motors.length > 0 && (
          <div className="mx-auto max-w-6xl space-y-6 p-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <AutosamplerView motors={status.motors} />
            </div>
            <SystemInfo />
            <div className="grid gap-4 sm:grid-cols-2">
              {status.motors.map((motor) => (
                <MotorCard key={motor.index} motor={motor} />
              ))}
            </div>
            {/* Topology */}
            <details className="group rounded-xl border border-border bg-card">
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
                <Network className="h-4 w-4" />
                System Topology
                <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-border p-4">
                <TopologyView />
              </div>
            </details>
            <DebugConsole />
          </div>
        )}
      </main>
    </div>
  );
}

function isServedFromDevice(): boolean {
  const hostname = window.location.hostname;
  return /^\d+\.\d+\.\d+\.\d+$/.test(hostname) && hostname !== "127.0.0.1";
}

function AppContent() {
  const servedFromDevice = isServedFromDevice();
  const [mode, setMode] = useState<AppMode>(servedFromDevice ? "wifi" : "choose");
  const { setTransportType, connected, connect } = useAS120();

  // Auto-connect when served from the device's IP
  const autoConnected = useRef(false);
  useEffect(() => {
    if (servedFromDevice && !connected && !autoConnected.current) {
      autoConnected.current = true;
      connect();
    }
  }, [servedFromDevice, connected, connect]);

  const handleChoose = (chosen: AppMode) => {
    if (chosen === "wifi") {
      setTransportType("http");
    } else if (chosen === "ble-setup") {
      setTransportType("ble");
    }
    setMode(chosen);
  };

  const handleBack = () => {
    setMode("choose");
  };

  switch (mode) {
    case "choose":
      return <ChooseMode onChoose={handleChoose} />;
    case "wifi":
      return <WifiDashboard onBack={handleBack} showBack={!servedFromDevice} />;
    case "ble-setup":
      return <BleSetupWizard onBack={handleBack} onComplete={() => { setTransportType("http"); setMode("wifi"); }} />;
  }
}

export default function App() {
  return (
    <TransportProvider>
      <AppContent />
    </TransportProvider>
  );
}
