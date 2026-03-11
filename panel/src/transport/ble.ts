import type { Transport, AS120Status, MotorConfig, WifiNetwork } from "./types";
import { debugLog } from "./debug";

const SERVICE_UUID = "a5120000-0001-4c48-4330-303030303030";
const STATUS_CHAR_UUID = "a5120000-0002-4c48-4330-303030303030";
const COMMAND_CHAR_UUID = "a5120000-0003-4c48-4330-303030303030";
const RESPONSE_CHAR_UUID = "a5120000-0004-4c48-4330-303030303030";

export class BleTransport implements Transport {
  readonly type = "ble" as const;
  private _connected = false;
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private statusChar: BluetoothRemoteGATTCharacteristic | null = null;
  private commandChar: BluetoothRemoteGATTCharacteristic | null = null;
  private responseChar: BluetoothRemoteGATTCharacteristic | null = null;
  private listeners: Set<(status: AS120Status) => void> = new Set();
  private lastStatus: AS120Status | null = null;
  private responseResolve: ((value: unknown) => void) | null = null;
  private responseReject: ((reason: Error) => void) | null = null;
  private statusChunks: Map<number, Uint8Array> = new Map();
  private statusTotalChunks = 0;
  private responseChunks: Map<number, Uint8Array> = new Map();
  private responseTotalChunks = 0;

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    if (!navigator.bluetooth) {
      throw new Error("Web Bluetooth is not supported in this browser");
    }

    try {
      debugLog.log("tx", "system", "requestDevice", {
        meta: { filters: [{ namePrefix: "AS120" }] },
      });

      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "AS120" }],
        optionalServices: [SERVICE_UUID],
      });

      debugLog.log("rx", "system", "Device selected", {
        decoded: this.device.name ?? "unnamed",
        meta: { id: this.device.id },
      });

      this.device.addEventListener(
        "gattserverdisconnected",
        this.onDisconnected
      );

      debugLog.log("tx", "system", "gatt.connect()");
      this.server = await this.device.gatt!.connect();
      debugLog.log("rx", "system", "GATT connected");

      // Small delay for service discovery to settle
      await new Promise((r) => setTimeout(r, 500));

      debugLog.log("tx", "system", "getPrimaryService", {
        decoded: SERVICE_UUID,
      });
      const service = await this.server.getPrimaryService(SERVICE_UUID);
      debugLog.log("rx", "system", "Service discovered");

      debugLog.log("tx", "system", "getCharacteristics (3)");
      this.statusChar = await service.getCharacteristic(STATUS_CHAR_UUID);
      this.commandChar = await service.getCharacteristic(COMMAND_CHAR_UUID);
      this.responseChar = await service.getCharacteristic(RESPONSE_CHAR_UUID);
      debugLog.log("rx", "system", "All characteristics found", {
        meta: {
          status: STATUS_CHAR_UUID.slice(0, 13),
          command: COMMAND_CHAR_UUID.slice(0, 13),
          response: RESPONSE_CHAR_UUID.slice(0, 13),
        },
      });

      debugLog.log("tx", "system", "startNotifications(status)");
      await this.statusChar.startNotifications();
      this.statusChar.addEventListener(
        "characteristicvaluechanged",
        this.onStatusNotification
      );

      debugLog.log("tx", "system", "startNotifications(response)");
      await this.responseChar.startNotifications();
      this.responseChar.addEventListener(
        "characteristicvaluechanged",
        this.onResponseNotification
      );

      this._connected = true;
      debugLog.log("rx", "system", "Connected — awaiting first notification");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      debugLog.log("rx", "system", `Connect FAILED: ${msg}`);
      this._connected = false;
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    debugLog.log("tx", "system", "disconnect()");
    if (this.statusChar) {
      try {
        await this.statusChar.stopNotifications();
      } catch {}
    }
    if (this.responseChar) {
      try {
        await this.responseChar.stopNotifications();
      } catch {}
    }
    if (this.server?.connected) {
      this.server.disconnect();
    }
    this._connected = false;
    this.device = null;
    this.server = null;
    this.statusChar = null;
    this.commandChar = null;
    this.responseChar = null;
    debugLog.log("rx", "system", "Disconnected");
  }

  async getStatus(): Promise<AS120Status> {
    if (!this._connected) throw new Error("Not connected");
    if (this.lastStatus) return this.lastStatus;
    return new Promise((resolve) => {
      const unsub = this.onStatusUpdate((status) => {
        unsub();
        resolve(status);
      });
    });
  }

  async moveMotor(index: number, position: number, _replace?: boolean): Promise<void> {
    await this.sendCommand({ cmd: "move", motor: index, position });
  }

  async jogMotor(index: number, steps: number): Promise<void> {
    await this.sendCommand({ cmd: "jog", motor: index, steps });
  }

  async homeMotor(index: number): Promise<void> {
    await this.sendCommand({ cmd: "home", motor: index });
  }

  async homeAll(): Promise<void> {
    await this.sendCommand({ cmd: "home_all" });
  }

  async clearQueue(): Promise<void> {
    await this.sendCommand({ cmd: "clear_queue" });
  }

  async setMotorConfig(
    index: number,
    config: Partial<MotorConfig>
  ): Promise<void> {
    await this.sendCommand({ cmd: "config", motor: index, ...config });
  }

  async wifiScan(): Promise<WifiNetwork[]> {
    const response = await this.sendCommandWithResponse({ cmd: "wifi_scan" });
    return response as WifiNetwork[];
  }

  async wifiConnect(ssid: string, password: string): Promise<void> {
    await this.sendCommand({ cmd: "wifi_connect", ssid, password });
  }

  async wifiReset(): Promise<void> {
    await this.sendCommand({ cmd: "wifi_reset" });
  }

  onStatusUpdate(callback: (status: AS120Status) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private async sendCommand(cmd: Record<string, unknown>): Promise<void> {
    if (!this.commandChar) throw new Error("Not connected");
    const json = JSON.stringify(cmd);
    const encoded = new TextEncoder().encode(json);
    debugLog.log("tx", "command", json, {
      rawBytes: encoded,
      decoded: json,
      meta: { bytes: encoded.length },
    });
    try {
      await this.commandChar.writeValue(encoded);
      debugLog.log("rx", "command", "write acknowledged", {
        meta: { bytes: encoded.length },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      debugLog.log("rx", "command", `write FAILED: ${msg}`);
      throw e;
    }
  }

  private async sendCommandWithResponse(
    cmd: Record<string, unknown>
  ): Promise<unknown> {
    // Clear any stale response chunks
    this.responseChunks.clear();
    this.responseTotalChunks = 0;

    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        this.responseResolve = null;
        this.responseReject = null;
        const err = new Error(
          `BLE response timeout (10s) for cmd: ${JSON.stringify(cmd)}`
        );
        debugLog.log("rx", "response", `TIMEOUT: ${err.message}`);
        reject(err);
      }, 10000);

      this.responseResolve = (value) => {
        clearTimeout(timeout);
        this.responseReject = null;
        resolve(value);
      };
      this.responseReject = (err) => {
        clearTimeout(timeout);
        this.responseResolve = null;
        reject(err);
      };

      try {
        await this.sendCommand(cmd);
      } catch (e) {
        clearTimeout(timeout);
        this.responseResolve = null;
        this.responseReject = null;
        reject(e);
      }
    });
  }

  // Reassemble chunked data from [seq(1)][total(1)][payload...] notifications
  private reassembleChunks(
    chunks: Map<number, Uint8Array>,
    channel: "status" | "response",
    view: DataView
  ): string | null {
    const rawBytes = new Uint8Array(
      view.buffer,
      view.byteOffset,
      view.byteLength
    );
    const seq = view.getUint8(0);
    const total = view.getUint8(1);

    if (total <= 0 || total >= 200 || seq >= total) {
      return null; // Not a valid chunk header
    }

    const payload = new Uint8Array(
      view.buffer,
      view.byteOffset + 2,
      view.byteLength - 2
    );
    chunks.set(seq, payload);

    debugLog.log("rx", channel, `chunk ${seq + 1}/${total}`, {
      rawBytes,
      decoded: new TextDecoder().decode(payload),
      meta: { seq, total, payloadBytes: payload.length, buffered: chunks.size },
    });

    if (chunks.size < total) return null;

    // All chunks received — reassemble
    const parts: Uint8Array[] = [];
    for (let i = 0; i < total; i++) {
      const chunk = chunks.get(i);
      if (!chunk) {
        debugLog.log("rx", channel, `Missing chunk ${i}/${total} — dropping`);
        chunks.clear();
        return null;
      }
      parts.push(chunk);
    }
    chunks.clear();

    const fullLen = parts.reduce((sum, p) => sum + p.length, 0);
    const full = new Uint8Array(fullLen);
    let offset = 0;
    for (const p of parts) {
      full.set(p, offset);
      offset += p.length;
    }

    const decoded = new TextDecoder().decode(full);
    debugLog.log("rx", channel, `reassembled (${total} chunks, ${fullLen}B)`, {
      rawBytes: full,
      decoded,
    });
    return decoded;
  }

  private onStatusNotification = (event: Event): void => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const view = target.value!;

    // Try chunked reassembly first
    if (view.byteLength >= 2) {
      const decoded = this.reassembleChunks(
        this.statusChunks,
        "status",
        view
      );
      if (decoded !== null) {
        try {
          this.lastStatus = JSON.parse(decoded);
          if (this.lastStatus) {
            this.listeners.forEach((cb) => cb(this.lastStatus!));
          }
        } catch (e) {
          debugLog.log("rx", "status", `JSON parse FAILED: ${e}`);
        }
        return;
      }
      // If reassembleChunks returned null, it may be buffering or not a chunk
      // Check if it was a valid chunk header (already logged inside reassembleChunks)
      const seq = view.getUint8(0);
      const total = view.getUint8(1);
      if (total > 0 && total < 200 && seq < total) {
        return; // Buffering — wait for more chunks
      }
    }

    // Fallback: try parsing as plain JSON
    const rawBytes = new Uint8Array(
      view.buffer,
      view.byteOffset,
      view.byteLength
    );
    const decoded = new TextDecoder().decode(view);
    debugLog.log("rx", "status", `raw (${view.byteLength}B)`, {
      rawBytes,
      decoded,
    });
    try {
      this.lastStatus = JSON.parse(decoded);
      if (this.lastStatus) {
        this.listeners.forEach((cb) => cb(this.lastStatus!));
      }
    } catch (e) {
      debugLog.log("rx", "status", `JSON parse FAILED: ${e}`);
    }
  };

  private onResponseNotification = (event: Event): void => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const view = target.value!;

    // Try chunked reassembly
    if (view.byteLength >= 2) {
      const decoded = this.reassembleChunks(
        this.responseChunks,
        "response",
        view
      );
      if (decoded !== null) {
        try {
          const data = JSON.parse(decoded);
          debugLog.log("rx", "response", "complete", { decoded });
          if (this.responseResolve) {
            this.responseResolve(data);
            this.responseResolve = null;
            this.responseReject = null;
          }
        } catch (e) {
          const msg = `Response JSON parse FAILED: ${e}`;
          debugLog.log("rx", "response", msg);
          if (this.responseReject) {
            this.responseReject(new Error(msg));
            this.responseResolve = null;
            this.responseReject = null;
          }
        }
        return;
      }
      const seq = view.getUint8(0);
      const total = view.getUint8(1);
      if (total > 0 && total < 200 && seq < total) {
        return; // Buffering
      }
    }

    // Fallback: plain JSON
    const rawBytes = new Uint8Array(
      view.buffer,
      view.byteOffset,
      view.byteLength
    );
    const decoded = new TextDecoder().decode(view);
    debugLog.log("rx", "response", `raw (${view.byteLength}B)`, {
      rawBytes,
      decoded,
    });
    try {
      const data = JSON.parse(decoded);
      if (this.responseResolve) {
        this.responseResolve(data);
        this.responseResolve = null;
        this.responseReject = null;
      }
    } catch (e) {
      debugLog.log("rx", "response", `JSON parse FAILED: ${e}`);
    }
  };

  private onDisconnected = (): void => {
    debugLog.log("rx", "system", "GATT server disconnected (event)");
    this._connected = false;
    this.listeners.forEach((cb) =>
      cb({
        version: "",
        fault_code: -1,
        motors: [],
      })
    );
  };
}
