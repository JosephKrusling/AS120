export type DebugDirection = "tx" | "rx";
export type DebugChannel = "status" | "command" | "response" | "system";

export interface DebugEntry {
  timestamp: number;
  direction: DebugDirection;
  channel: DebugChannel;
  label: string;
  rawBytes?: Uint8Array;
  rawHex?: string;
  decoded?: string;
  meta?: Record<string, unknown>;
}

type DebugListener = (entry: DebugEntry) => void;

const MAX_ENTRIES = 500;

class DebugLog {
  entries: DebugEntry[] = [];
  private listeners = new Set<DebugListener>();

  log(
    direction: DebugDirection,
    channel: DebugChannel,
    label: string,
    opts?: {
      rawBytes?: Uint8Array;
      decoded?: string;
      meta?: Record<string, unknown>;
    }
  ) {
    const entry: DebugEntry = {
      timestamp: Date.now(),
      direction,
      channel,
      label,
      rawBytes: opts?.rawBytes,
      rawHex: opts?.rawBytes ? bytesToHex(opts.rawBytes) : undefined,
      decoded: opts?.decoded,
      meta: opts?.meta,
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
    this.listeners.forEach((cb) => cb(entry));
  }

  subscribe(cb: DebugListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  clear() {
    this.entries = [];
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

export const debugLog = new DebugLog();
