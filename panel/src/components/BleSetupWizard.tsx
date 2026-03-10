import { useState, useCallback, useEffect, useRef } from "react";
import { useAS120 } from "@/hooks/useAS120";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { WifiNetwork } from "@/transport/types";
import {
  Bluetooth,
  Wifi,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  RefreshCw,
  Signal,
  SignalLow,
  SignalMedium,
  SignalHigh,
  Lock,
  Radio,
  ExternalLink,
  AlertCircle,
} from "lucide-react";

type Step = "pair" | "scan" | "connect-wifi" | "success";

function rssiIcon(rssi: number) {
  if (rssi >= -50) return <Signal className="h-4 w-4 text-green-400" />;
  if (rssi >= -65) return <SignalHigh className="h-4 w-4 text-green-400" />;
  if (rssi >= -75) return <SignalMedium className="h-4 w-4 text-yellow-400" />;
  return <SignalLow className="h-4 w-4 text-red-400" />;
}

function StepIndicator({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-all duration-500 ${
                i < current
                  ? "bg-primary text-primary-foreground"
                  : i === current
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i < current ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={`hidden text-xs sm:inline ${
                i <= current ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`h-px w-8 transition-colors duration-500 ${
                i < current ? "bg-primary" : "bg-border"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function PulsingIcon({ icon: Icon, color }: { icon: React.ElementType; color: string }) {
  return (
    <div className="relative mx-auto h-24 w-24">
      <div className={`absolute inset-0 animate-ping rounded-full ${color} opacity-20`} />
      <div className={`absolute inset-2 animate-pulse rounded-full ${color} opacity-10`} />
      <div className="relative flex h-full w-full items-center justify-center rounded-full border-2 border-border bg-card">
        <Icon className={`h-10 w-10 ${color.replace("bg-", "text-")}`} />
      </div>
    </div>
  );
}

function SpinnerIcon() {
  return (
    <div className="relative mx-auto h-24 w-24">
      <div className="absolute inset-0 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      <div className="absolute inset-3 flex items-center justify-center rounded-full border-2 border-border bg-card">
        <Bluetooth className="h-8 w-8 text-blue-400" />
      </div>
    </div>
  );
}

export function BleSetupWizard({
  onBack,
  onComplete,
}: {
  onBack: () => void;
  onComplete: () => void;
}) {
  const { status, connected, connecting, connect, disconnect, wifiScan, wifiConnect } =
    useAS120();
  const [step, setStep] = useState<Step>("pair");
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [scanning, setScanning] = useState(false);
  const [selectedSsid, setSelectedSsid] = useState("");
  const [password, setPassword] = useState("");
  const [wifiConnecting, setWifiConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedIp, setConnectedIp] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const alreadyOnWifi = status?.wifi?.connected && !status.wifi.ap_mode;

  // Auto-advance from pair step when BLE connected
  const autoScanned = useRef(false);
  useEffect(() => {
    if (connected && step === "pair") {
      setStep("scan");
    }
  }, [connected, step]);

  // Watch for WiFi connection success
  useEffect(() => {
    if (step === "connect-wifi" && wifiConnecting && status?.wifi?.connected && !status.wifi.ap_mode) {
      setWifiConnecting(false);
      setConnectedIp(status.wifi.ip);
      setStep("success");
    }
  }, [status, step, wifiConnecting]);

  const handlePair = useCallback(async () => {
    setError(null);
    try {
      await connect();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("cancelled")) {
        setError(msg);
      }
    }
  }, [connect]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const results = await wifiScan();
      // Deduplicate by SSID, keeping strongest signal
      const seen = new Map<string, WifiNetwork>();
      for (const net of results) {
        if (!net.ssid) continue;
        const existing = seen.get(net.ssid);
        if (!existing || net.rssi > existing.rssi) {
          seen.set(net.ssid, net);
        }
      }
      setNetworks(
        Array.from(seen.values()).sort((a, b) => b.rssi - a.rssi)
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Scan failed: ${msg}`);
    } finally {
      setScanning(false);
    }
  }, [wifiScan]);

  // Auto-scan when entering scan step (skip if already on WiFi)
  useEffect(() => {
    if (step === "scan" && connected && !autoScanned.current && networks.length === 0 && !alreadyOnWifi) {
      autoScanned.current = true;
      handleScan();
    }
  }, [step, connected, handleScan, networks.length, alreadyOnWifi]);

  const handleSelectNetwork = useCallback((ssid: string) => {
    setSelectedSsid(ssid);
    setError(null);
    setTimeout(() => passwordRef.current?.focus(), 100);
  }, []);

  const handleConnectWifi = useCallback(async () => {
    if (!selectedSsid) return;
    setWifiConnecting(true);
    setError(null);
    setStep("connect-wifi");
    try {
      await wifiConnect(selectedSsid, password);
      // Wait for status update to confirm connection (handled by useEffect above)
      // Set a timeout in case we don't get status update
      setTimeout(() => {
        setWifiConnecting((prev) => {
          if (prev) {
            // Still connecting after timeout — check status
            if (status?.wifi?.connected && !status.wifi.ap_mode) {
              setConnectedIp(status.wifi.ip);
              setStep("success");
              return false;
            }
            setError("Connection timed out. Check password and try again.");
            return false;
          }
          return prev;
        });
      }, 15000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`WiFi connection failed: ${msg}`);
      setWifiConnecting(false);
    }
  }, [selectedSsid, password, wifiConnect, status]);

  const handleOpenPanel = useCallback(() => {
    if (connectedIp) {
      window.open(`http://${connectedIp}`, "_blank");
    }
    disconnect();
    onComplete();
  }, [connectedIp, disconnect, onComplete]);

  const stepIndex = ["pair", "scan", "connect-wifi", "success"].indexOf(step);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <button
            onClick={step === "pair" ? onBack : undefined}
            className={`flex items-center gap-1.5 text-sm ${step === "pair" ? "text-muted-foreground hover:text-foreground" : "invisible"}`}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">AS120 Setup</span>
          </div>
          <div className="w-16" />
        </div>
      </header>

      {/* Step indicator */}
      <div className="border-b border-border bg-card/50 px-4 py-3">
        <div className="mx-auto max-w-lg">
          <StepIndicator
            current={stepIndex}
            steps={["Pair", "Find Network", "Connect", "Done"]}
          />
        </div>
      </div>

      {/* Content */}
      <main className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          {/* Step: Pair */}
          {step === "pair" && (
            <div className="space-y-6 text-center animate-in fade-in duration-300">
              {connecting ? (
                <SpinnerIcon />
              ) : (
                <PulsingIcon icon={Bluetooth} color="bg-blue-500" />
              )}
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">
                  {connecting ? "Connecting..." : "Pair with AS120"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {connecting
                    ? "Select your AS120 device from the browser dialog"
                    : "Make sure the AS120 is powered on and within Bluetooth range."}
                </p>
              </div>
              {error && (
                <div className="flex items-center justify-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}
              {!connecting && (
                <Button size="lg" onClick={handlePair} className="px-8">
                  <Bluetooth className="mr-2 h-4 w-4" />
                  Pair Device
                </Button>
              )}
            </div>
          )}

          {/* Step: Scan */}
          {step === "scan" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-1 text-center">
                <h2 className="text-2xl font-bold">
                  {alreadyOnWifi ? "Already Connected" : "Choose a Network"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {alreadyOnWifi
                    ? "Your AS120 is already on WiFi"
                    : "Select the WiFi network for your AS120"}
                </p>
              </div>

              {/* Current WiFi connection banner */}
              {alreadyOnWifi && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                      <Wifi className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{status?.wifi?.ssid}</div>
                      <div className="text-xs font-mono text-muted-foreground">{status?.wifi?.ip}</div>
                    </div>
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                      Connected
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => {
                        window.open(`http://${status?.wifi?.ip}`, "_blank");
                        disconnect();
                        onComplete();
                      }}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Use This Network
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleScan}
                      disabled={scanning}
                    >
                      {scanning ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Change
                    </Button>
                  </div>
                </div>
              )}

              {/* Rescan button — only show after we have results */}
              {!alreadyOnWifi && networks.length > 0 && (
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleScan}
                    disabled={scanning}
                  >
                    {scanning ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {scanning ? "Scanning..." : "Rescan"}
                  </Button>
                </div>
              )}

              {/* Network list */}
              {scanning && networks.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Scanning for networks...
                  </p>
                </div>
              ) : networks.length > 0 ? (
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border">
                  {networks.map((net, i) => (
                    <button
                      key={`${net.ssid}-${i}`}
                      onClick={() => handleSelectNetwork(net.ssid)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent ${
                        selectedSsid === net.ssid
                          ? "bg-accent text-accent-foreground"
                          : ""
                      }`}
                    >
                      <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-left font-medium">{net.ssid}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {net.rssi} dBm
                        {rssiIcon(net.rssi)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : !alreadyOnWifi ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No networks found. Try scanning again.
                </div>
              ) : null}

              {/* Password input */}
              {selectedSsid && (
                <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-4 w-4 text-primary" />
                    <span className="font-medium">{selectedSsid}</span>
                  </div>
                  <Input
                    ref={passwordRef}
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleConnectWifi()}
                  />
                  <Button
                    className="w-full"
                    onClick={handleConnectWifi}
                    disabled={wifiConnecting}
                  >
                    {wifiConnecting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="mr-2 h-4 w-4" />
                    )}
                    Connect to WiFi
                  </Button>
                </div>
              )}

              {error && (
                <div className="flex items-center justify-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Step: Connecting to WiFi */}
          {step === "connect-wifi" && (
            <div className="space-y-6 text-center animate-in fade-in duration-300">
              <div className="relative mx-auto h-24 w-24">
                <div className="absolute inset-0 animate-spin rounded-full border-4 border-emerald-500/20 border-t-emerald-500" style={{ animationDuration: "2s" }} />
                <div className="absolute inset-3 flex items-center justify-center rounded-full border-2 border-border bg-card">
                  <Wifi className="h-8 w-8 text-emerald-400" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Connecting to WiFi</h2>
                <p className="text-sm text-muted-foreground">
                  Connecting to <span className="font-medium text-foreground">{selectedSsid}</span>...
                </p>
              </div>
              {error && (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </div>
                  <Button variant="outline" onClick={() => { setStep("scan"); setError(null); }}>
                    Try Again
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Step: Success */}
          {step === "success" && (
            <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-500">
              <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
                <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-20" style={{ animationDuration: "2s" }} />
                <div className="relative flex h-full w-full items-center justify-center rounded-full border-2 border-emerald-500/30 bg-emerald-500/10">
                  <Check className="h-12 w-12 text-emerald-400" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Connected!</h2>
                <p className="text-sm text-muted-foreground">
                  Your AS120 is now on <span className="font-medium text-foreground">{selectedSsid}</span>
                </p>
              </div>
              {connectedIp && (
                <Badge
                  variant="secondary"
                  className="mx-auto gap-1.5 px-4 py-1.5 font-mono text-sm"
                >
                  <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                  {connectedIp}
                </Badge>
              )}
              <div className="space-y-2">
                {connectedIp && (
                  <Button size="lg" className="w-full" onClick={handleOpenPanel}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open Control Panel
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={() => { disconnect(); onComplete(); }}
                >
                  Continue to Dashboard
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

    </div>
  );
}
