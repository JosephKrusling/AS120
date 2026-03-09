import { useState, useCallback } from "react";
import { useAS120 } from "@/hooks/useAS120";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Loader2,
  Signal,
  SignalLow,
  SignalMedium,
  SignalHigh,
  Lock,
} from "lucide-react";
import type { WifiNetwork } from "@/transport/types";

function rssiIcon(rssi: number) {
  if (rssi >= -50) return <Signal className="h-4 w-4 text-green-400" />;
  if (rssi >= -65) return <SignalHigh className="h-4 w-4 text-green-400" />;
  if (rssi >= -75) return <SignalMedium className="h-4 w-4 text-yellow-400" />;
  return <SignalLow className="h-4 w-4 text-red-400" />;
}

export function WiFiConfig() {
  const { status, wifiScan, wifiConnect, transportType } = useAS120();
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [scanning, setScanning] = useState(false);
  const [selectedSsid, setSelectedSsid] = useState("");
  const [password, setPassword] = useState("");
  const [connectingWifi, setConnectingWifi] = useState(false);
  const [wifiError, setWifiError] = useState<string | null>(null);

  const showWifiConfig =
    transportType === "ble" ||
    status?.wifi?.ap_mode === true;

  if (!showWifiConfig) return null;

  const handleScan = useCallback(async () => {
    setScanning(true);
    setWifiError(null);
    try {
      const results = await wifiScan();
      setNetworks(results.sort((a, b) => b.rssi - a.rssi));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setWifiError(`Scan failed: ${msg}`);
    } finally {
      setScanning(false);
    }
  }, [wifiScan]);

  const handleConnect = useCallback(async () => {
    if (!selectedSsid) return;
    setConnectingWifi(true);
    setWifiError(null);
    try {
      await wifiConnect(selectedSsid, password);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setWifiError(`Connection failed: ${msg}`);
    } finally {
      setConnectingWifi(false);
    }
  }, [selectedSsid, password, wifiConnect]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wifi className="h-4 w-4" />
            WiFi Configuration
          </CardTitle>
          {status?.wifi && (
            <Badge
              variant="outline"
              className={
                status.wifi.connected
                  ? "border-green-500/30 text-green-400"
                  : "border-yellow-500/30 text-yellow-400"
              }
            >
              {status.wifi.connected
                ? `Connected: ${status.wifi.ssid}`
                : `AP: ${status.wifi.ssid}`}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {status?.wifi && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span>
              Mode: <span className="text-foreground">{status.wifi.ap_mode ? "AP" : status.wifi.connected ? "STA" : "DISCONNECTED"}</span>
            </span>
            <span>
              IP: <span className="font-mono text-foreground">{status.wifi.ip}</span>
            </span>
            <span>
              SSID: <span className="text-foreground">{status.wifi.ssid}</span>
            </span>
          </div>
        )}

        <Separator />

        {/* Scan button */}
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
          {scanning ? "Scanning..." : "Scan Networks"}
        </Button>

        {/* Network list */}
        {networks.length > 0 && (
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border">
            {networks.map((net, i) => (
              <button
                key={`${net.ssid}-${i}`}
                onClick={() => setSelectedSsid(net.ssid)}
                className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-accent ${
                  selectedSsid === net.ssid
                    ? "bg-accent text-accent-foreground"
                    : ""
                }`}
              >
                <span className="truncate">{net.ssid}</span>
                <span className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {net.rssi} dBm
                  {rssiIcon(net.rssi)}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Connect form */}
        {selectedSsid && (
          <div className="space-y-3 rounded-lg border border-border bg-background p-3">
            <div className="text-sm">
              Connect to: <span className="font-medium">{selectedSsid}</span>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Password</Label>
              <Input
                type="password"
                placeholder="Network password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              />
            </div>
            <Button
              size="sm"
              onClick={handleConnect}
              disabled={connectingWifi}
              className="w-full"
            >
              {connectingWifi ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wifi className="mr-1.5 h-3.5 w-3.5" />
              )}
              {connectingWifi ? "Connecting..." : "Connect"}
            </Button>
          </div>
        )}

        {wifiError && (
          <p className="text-xs text-destructive">{wifiError}</p>
        )}
      </CardContent>
    </Card>
  );
}
