import { useCallback } from "react";
import { useTransport } from "@/transport/context";
import type { MotorConfig, WifiNetwork } from "@/transport/types";

export function useAS120() {
  const { transport, status, connected, connecting, error, connect, disconnect, transportType, setTransportType } =
    useTransport();

  const moveMotor = useCallback(
    async (index: number, position: number) => {
      if (!transport) return;
      await transport.moveMotor(index, position);
    },
    [transport]
  );

  const jogMotor = useCallback(
    async (index: number, steps: number) => {
      if (!transport) return;
      await transport.jogMotor(index, steps);
    },
    [transport]
  );

  const homeMotor = useCallback(
    async (index: number) => {
      if (!transport) return;
      await transport.homeMotor(index);
    },
    [transport]
  );

  const homeAll = useCallback(async () => {
    if (!transport) return;
    await transport.homeAll();
  }, [transport]);

  const setMotorConfig = useCallback(
    async (index: number, config: Partial<MotorConfig>) => {
      if (!transport) return;
      await transport.setMotorConfig(index, config);
    },
    [transport]
  );

  const wifiScan = useCallback(async (): Promise<WifiNetwork[]> => {
    if (!transport) return [];
    return transport.wifiScan();
  }, [transport]);

  const wifiConnect = useCallback(
    async (ssid: string, password: string) => {
      if (!transport) return;
      await transport.wifiConnect(ssid, password);
    },
    [transport]
  );

  return {
    status,
    connected,
    connecting,
    error,
    transportType,
    setTransportType,
    connect,
    disconnect,
    moveMotor,
    jogMotor,
    homeMotor,
    homeAll,
    setMotorConfig,
    wifiScan,
    wifiConnect,
  };
}
