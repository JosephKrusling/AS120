import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import type { Transport, AS120Status, CommPacket } from "./types";
import { HttpTransport } from "./http";
import { BleTransport } from "./ble";

interface TransportContextValue {
  transport: Transport | null;
  status: AS120Status | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  transportType: "http" | "ble";
  commLog: CommPacket[];
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  setTransportType: (type: "http" | "ble") => void;
}

const TransportContext = createContext<TransportContextValue | null>(null);

function detectDefaultTransport(): "http" | "ble" {
  const hostname = window.location.hostname;
  // If served from an IP address (ESP32), use HTTP
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return "http";
  }
  // localhost during development — could be either, default HTTP for dev convenience
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http";
  }
  // Cloud host — use BLE
  return "ble";
}

export function TransportProvider({ children }: { children: React.ReactNode }) {
  const [transportType, setTransportType] = useState<"http" | "ble">(
    detectDefaultTransport
  );
  const [status, setStatus] = useState<AS120Status | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commLog, setCommLog] = useState<CommPacket[]>([]);
  const transportRef = useRef<Transport | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    if (transportRef.current?.connected) {
      transportRef.current.disconnect().catch(() => {});
    }
    transportRef.current = null;
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const connect = useCallback(async () => {
    cleanup();
    setConnecting(true);
    setError(null);

    try {
      const t =
        transportType === "http" ? new HttpTransport() : new BleTransport();
      transportRef.current = t;

      if (t instanceof HttpTransport) {
        t.onPacket = () => setCommLog([...t.packetLog]);
      }

      unsubRef.current = t.onStatusUpdate((s) => {
        if (s.fault_code === -1 && s.version === "") {
          setConnected(false);
          setError("Connection lost");
          return;
        }
        setStatus(s);
        setConnected(true);
      });

      await t.connect();
      const initialStatus = await t.getStatus();
      setStatus(initialStatus);
      setConnected(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Connection failed";
      setError(msg);
      setConnected(false);
      cleanup();
    } finally {
      setConnecting(false);
    }
  }, [transportType, cleanup]);

  const disconnect = useCallback(async () => {
    cleanup();
    setConnected(false);
    setStatus(null);
    setError(null);
  }, [cleanup]);

  // Auto-reconnect when connection is lost (but was previously connected)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!connected && error === "Connection lost" && !connecting) {
      reconnectTimer.current = setTimeout(() => {
        connect();
      }, 2000);
      return () => {
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      };
    }
  }, [connected, error, connecting, connect]);

  const handleSetTransportType = useCallback(
    (type: "http" | "ble") => {
      if (type !== transportType) {
        cleanup();
        setConnected(false);
        setStatus(null);
        setError(null);
        setTransportType(type);
      }
    },
    [transportType, cleanup]
  );

  return (
    <TransportContext.Provider
      value={{
        transport: transportRef.current,
        status,
        connected,
        connecting,
        error,
        transportType,
        commLog,
        connect,
        disconnect,
        setTransportType: handleSetTransportType,
      }}
    >
      {children}
    </TransportContext.Provider>
  );
}

export function useTransport(): TransportContextValue {
  const ctx = useContext(TransportContext);
  if (!ctx) {
    throw new Error("useTransport must be used within a TransportProvider");
  }
  return ctx;
}
