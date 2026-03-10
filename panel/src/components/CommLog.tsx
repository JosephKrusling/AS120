import { useState, useRef, useEffect } from "react";
import { useAS120 } from "@/hooks/useAS120";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUp, ArrowDown, Radio } from "lucide-react";
import type { CommPacket, SerialLogEntry } from "@/transport/types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  const ms = d.getMilliseconds().toString().padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

function formatUptime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const frac = ms % 1000;
  return `${m}:${s.toString().padStart(2, "0")}.${frac.toString().padStart(3, "0")}`;
}

// Try to decode 4-byte serial command into a human-readable string
function decodeSerialData(hex: string, dir: "rx" | "tx"): string {
  if (hex.length === 0) return "";

  // TX "ok\r" = 6f6b0d
  if (hex === "6f6b0d") return "ok";

  // TX "0ok\n" = 306f6b0a
  if (hex === "306f6b0a") return "0ok";

  // TX "Error:1\n"
  if (hex === "4572726f723a310a") return "Error:1";

  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }

  // 4-byte RX commands
  if (dir === "rx" && bytes.length === 4) {
    // Absolute move: byte[0] in '5'-'9', byte[3] is \r or \n
    if (bytes[0] >= 0x35 && bytes[0] <= 0x39 && (bytes[3] === 0x0d || bytes[3] === 0x0a)) {
      const motorIdx = bytes[0] - 0x35;
      const motorNames = ["FB", "UD", "PL", "LR", "M4"];
      const pos = (bytes[1] << 8) | bytes[2];
      return `move ${motorNames[motorIdx]} → ${pos}`;
    }

    // Check for printable ASCII
    const allPrintable = bytes.every((b) => b >= 0x20 && b < 0x7f || b === 0x0d || b === 0x0a);
    if (allPrintable) {
      return bytes.map((b) => (b === 0x0d || b === 0x0a) ? "" : String.fromCharCode(b)).join("").trim();
    }
  }

  // TX responses: try ASCII first
  const allPrintable = bytes.every((b) => b >= 0x20 && b < 0x7f || b === 0x0d || b === 0x0a);
  if (allPrintable && bytes.length <= 8) {
    return bytes.map((b) => (b === 0x0d || b === 0x0a) ? "" : String.fromCharCode(b)).join("").trim();
  }

  // Fallback: show hex
  return hex.toUpperCase().match(/.{2}/g)?.join(" ") ?? hex;
}

// ---------------------------------------------------------------------------
// Tab button
// ---------------------------------------------------------------------------

function Tab({ label, active, count, onClick }: {
  label: string; active: boolean; count: number; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
    >
      {label}
      {count > 0 && (
        <span className="ml-1.5 tabular-nums text-[10px] text-muted-foreground">{count}</span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// HTTP packet row
// ---------------------------------------------------------------------------

function summarizeEndpoint(p: CommPacket): string {
  const short = p.endpoint.replace(/^\/api\//, "");
  if (p.direction === "out" && p.body) {
    try {
      const obj = JSON.parse(p.body);
      const parts = Object.entries(obj).map(([k, v]) => `${k}=${v}`);
      return `${short} ${parts.join(" ")}`;
    } catch {
      return short;
    }
  }
  return short;
}

function HttpRow({ packet }: { packet: CommPacket }) {
  const isOut = packet.direction === "out";
  const isError = packet.error || (packet.status && packet.status >= 400);

  return (
    <div className="flex items-center gap-2 px-2 py-1 text-[11px] font-mono hover:bg-muted/50 rounded transition-colors">
      <span className="text-muted-foreground shrink-0 w-[72px]">
        {formatTime(packet.timestamp)}
      </span>
      <span className={`shrink-0 ${isOut ? "text-blue-400" : isError ? "text-red-400" : "text-emerald-400"}`}>
        {isOut ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      </span>
      <span className={`shrink-0 w-10 text-[10px] uppercase font-semibold ${isOut ? "text-blue-400" : isError ? "text-red-400" : "text-emerald-400"}`}>
        {packet.method}
      </span>
      <span className="truncate text-foreground">
        {summarizeEndpoint(packet)}
      </span>
      {packet.status && (
        <span className={`ml-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded ${
          packet.status < 300 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
        }`}>
          {packet.status}
        </span>
      )}
      {packet.error && (
        <span className="ml-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 truncate max-w-32">
          ERR
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Serial packet row
// ---------------------------------------------------------------------------

function SerialRow({ entry }: { entry: SerialLogEntry }) {
  const isRx = entry.dir === "rx";
  const decoded = decodeSerialData(entry.hex, entry.dir);

  return (
    <div className="flex items-center gap-2 px-2 py-1 text-[11px] font-mono hover:bg-muted/50 rounded transition-colors">
      <span className="text-muted-foreground shrink-0 w-[72px]">
        {formatUptime(entry.t)}
      </span>
      <span className={`shrink-0 ${isRx ? "text-amber-400" : "text-cyan-400"}`}>
        {isRx ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
      </span>
      <span className={`shrink-0 w-6 text-[10px] uppercase font-semibold ${isRx ? "text-amber-400" : "text-cyan-400"}`}>
        {entry.dir}
      </span>
      <span className="text-foreground truncate">{decoded}</span>
      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/60 font-mono">
        {entry.hex.toUpperCase().match(/.{2}/g)?.join(" ")}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CommLog() {
  const { commLog, status } = useAS120();
  const [tab, setTab] = useState<"serial" | "http">("serial");

  // Track serial entries with deduplication via seq number
  const lastSeqRef = useRef(0);
  const [serialEntries, setSerialEntries] = useState<SerialLogEntry[]>([]);

  useEffect(() => {
    if (!status?.serial) return;
    const { seq, entries } = status.serial;
    if (seq !== lastSeqRef.current && entries.length > 0) {
      lastSeqRef.current = seq;
      // Replace with latest snapshot from firmware (already ordered oldest→newest)
      // Reverse so newest is at top
      setSerialEntries([...entries].reverse());
    }
  }, [status?.serial]);

  return (
    <Card>
      <CardHeader className="pb-2 px-4 pt-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Radio className="h-4 w-4 text-muted-foreground" />
          Communications
          <div className="ml-auto flex gap-1">
            <Tab label="Serial" active={tab === "serial"} count={serialEntries.length} onClick={() => setTab("serial")} />
            <Tab label="HTTP" active={tab === "http"} count={commLog.length} onClick={() => setTab("http")} />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-background">
          {tab === "serial" ? (
            serialEntries.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                No serial packets yet
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {serialEntries.map((e, i) => (
                  <SerialRow key={`${e.t}-${i}`} entry={e} />
                ))}
              </div>
            )
          ) : (
            commLog.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                No HTTP packets yet
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {commLog.map((p) => (
                  <HttpRow key={p.id} packet={p} />
                ))}
              </div>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
