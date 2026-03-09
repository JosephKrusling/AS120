import type { Transport, AS120Status, MotorConfig, WifiNetwork } from "./types";

export class HttpTransport implements Transport {
  readonly type = "http" as const;
  private _connected = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<(status: AS120Status) => void> = new Set();
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? "";
  }

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    try {
      await this.getStatus();
      this._connected = true;
      this.startPolling();
    } catch (e) {
      this._connected = false;
      throw new Error("Failed to connect to AS120 via HTTP");
    }
  }

  async disconnect(): Promise<void> {
    this.stopPolling();
    this._connected = false;
  }

  async getStatus(): Promise<AS120Status> {
    const res = await fetch(`${this.baseUrl}/api/status`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async moveMotor(index: number, position: number): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/motor/${index}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async jogMotor(index: number, steps: number): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/motor/${index}/jog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async homeMotor(index: number): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/motor/${index}/home`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async homeAll(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/home`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async setMotorConfig(
    index: number,
    config: Partial<MotorConfig>
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/motor/${index}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async wifiScan(): Promise<WifiNetwork[]> {
    const res = await fetch(`${this.baseUrl}/api/wifi/scan`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async wifiConnect(ssid: string, password: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/wifi/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssid, password }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  onStatusUpdate(callback: (status: AS120Status) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(async () => {
      try {
        const status = await this.getStatus();
        this.listeners.forEach((cb) => cb(status));
      } catch {
        this._connected = false;
        this.stopPolling();
        this.listeners.forEach((cb) =>
          cb({
            version: "",
            fault_code: -1,
            motors: [],
          })
        );
      }
    }, 500);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
