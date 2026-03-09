import { useAS120 } from "@/hooks/useAS120";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Wifi,
  Bluetooth,
  Plug,
  AlertTriangle,
  Loader2,
} from "lucide-react";

export function ConnectionBar() {
  const {
    status,
    connected,
    connecting,
    error,
    transportType,
    setTransportType,
    connect,
  } = useAS120();

  const faultActive = status && status.fault_code !== 0;

  return (
    <header className="border-b border-border bg-card px-4 py-3">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight">AS120</h1>
          {connected && status && (
            <>
              <Badge variant="secondary" className="font-mono text-xs">
                v{status.version}
              </Badge>
              {faultActive && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Fault {status.fault_code}
                </Badge>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!connected && !connecting && (
            <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
              <button
                onClick={() => setTransportType("http")}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  transportType === "http"
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Wifi className="h-3 w-3" />
                WiFi
              </button>
              <button
                onClick={() => setTransportType("ble")}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  transportType === "ble"
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Bluetooth className="h-3 w-3" />
                BLE
              </button>
            </div>
          )}

          {connected && (
            <Badge variant="outline" className="gap-1.5">
              {transportType === "http" ? (
                <Wifi className="h-3 w-3 text-green-400" />
              ) : (
                <Bluetooth className="h-3 w-3 text-blue-400" />
              )}
              {transportType === "http" ? "WiFi" : "BLE"}
            </Badge>
          )}

          {error && !connected && (
            <span className="text-xs text-destructive">{error}</span>
          )}

          {!connected && (
            <Button size="sm" onClick={connect} disabled={connecting}>
              {connecting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plug className="mr-1.5 h-3.5 w-3.5" />
              )}
              {connecting ? "Connecting..." : "Connect"}
            </Button>
          )}
          </div>
      </div>
    </header>
  );
}
