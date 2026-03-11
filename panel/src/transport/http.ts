import type { Transport, AS120Status, MotorConfig, WifiNetwork, CommPacket } from "./types";

export class HttpTransport implements Transport {
  readonly type = "http" as const;
  private _connected = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<(status: AS120Status) => void> = new Set();
  private baseUrl: string;
  private _packetLog: CommPacket[] = [];
  private _packetId = 0;
  private _onPacket: ((packet: CommPacket) => void) | null = null;
  private static MAX_LOG = 100;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? "";
  }

  set onPacket(cb: ((packet: CommPacket) => void) | null) {
    this._onPacket = cb;
  }

  get packetLog(): CommPacket[] {
    return this._packetLog;
  }

  private log(packet: Omit<CommPacket, "id" | "timestamp">): CommPacket {
    const p: CommPacket = { ...packet, id: ++this._packetId, timestamp: Date.now() };
    this._packetLog.unshift(p);
    if (this._packetLog.length > HttpTransport.MAX_LOG)
      this._packetLog.length = HttpTransport.MAX_LOG;
    this._onPacket?.(p);
    return p;
  }

  private async loggedFetch(
    endpoint: string,
    init?: RequestInit,
    opts?: { silent?: boolean }
  ): Promise<Response> {
    const method = init?.method ?? "GET";
    const body = init?.body as string | undefined;
    if (!opts?.silent) {
      this.log({ direction: "out", method, endpoint, body });
    }
    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, init);
      if (!opts?.silent) {
        this.log({ direction: "in", method, endpoint, status: res.status });
      }
      return res;
    } catch (e) {
      if (!opts?.silent) {
        this.log({ direction: "in", method, endpoint, error: String(e) });
      }
      throw e;
    }
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
    const res = await this.loggedFetch("/api/status", {
      signal: AbortSignal.timeout(3000),
    }, { silent: true });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async moveMotor(index: number, position: number, replace?: boolean): Promise<void> {
    const body: Record<string, unknown> = { position };
    if (replace) body.replace = true;
    const res = await this.loggedFetch(`/api/motor/${index}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async jogMotor(index: number, steps: number): Promise<void> {
    const res = await this.loggedFetch(`/api/motor/${index}/jog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async homeMotor(index: number): Promise<void> {
    const res = await this.loggedFetch(`/api/motor/${index}/home`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async homeAll(): Promise<void> {
    const res = await this.loggedFetch("/api/home", {
      method: "POST",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async clearQueue(): Promise<void> {
    const res = await this.loggedFetch("/api/queue/clear", {
      method: "POST",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async setMotorConfig(
    index: number,
    config: Partial<MotorConfig>
  ): Promise<void> {
    const res = await this.loggedFetch(`/api/motor/${index}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async wifiScan(): Promise<WifiNetwork[]> {
    const res = await this.loggedFetch("/api/wifi/scan");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async wifiConnect(ssid: string, password: string): Promise<void> {
    const res = await this.loggedFetch("/api/wifi/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssid, password }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async wifiReset(): Promise<void> {
    const res = await this.loggedFetch("/api/wifi/reset", {
      method: "POST",
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
    }, 200);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
