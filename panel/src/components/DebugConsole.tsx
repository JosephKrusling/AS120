import { useState, useEffect, useRef, useCallback } from "react";
import { debugLog, type DebugEntry } from "@/transport/debug";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Terminal, Trash2, ChevronDown, ChevronUp, Pause, Play } from "lucide-react";

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}.${d.getMilliseconds().toString().padStart(3, "0")}`;
}

function EntryRow({ entry, expanded, onToggle }: { entry: DebugEntry; expanded: boolean; onToggle: () => void }) {
  const dirColor = entry.direction === "tx" ? "text-blue-400" : "text-green-400";
  const dirLabel = entry.direction === "tx" ? "TX" : "RX";
  const channelColors: Record<string, string> = {
    status: "border-purple-500/40 text-purple-400",
    command: "border-blue-500/40 text-blue-400",
    response: "border-amber-500/40 text-amber-400",
    system: "border-zinc-500/40 text-zinc-400",
  };

  return (
    <div className="border-b border-border/30 font-mono text-[11px] leading-relaxed">
      <button
        className="flex w-full items-start gap-2 px-2 py-1 text-left hover:bg-accent/30"
        onClick={onToggle}
      >
        <span className="shrink-0 text-muted-foreground">{formatTime(entry.timestamp)}</span>
        <span className={`shrink-0 font-bold ${dirColor}`}>{dirLabel}</span>
        <Badge variant="outline" className={`shrink-0 px-1 py-0 text-[10px] ${channelColors[entry.channel] ?? ""}`}>
          {entry.channel}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-foreground">{entry.label}</span>
        {entry.rawHex && (
          <span className="shrink-0 text-muted-foreground">
            {entry.rawBytes?.length}B
          </span>
        )}
      </button>
      {expanded && (
        <div className="space-y-1 bg-black/20 px-3 py-2">
          {entry.rawHex && (
            <div>
              <span className="text-muted-foreground">hex: </span>
              <span className="break-all text-orange-300">{entry.rawHex}</span>
            </div>
          )}
          {entry.decoded && (
            <div>
              <span className="text-muted-foreground">str: </span>
              <span className="break-all text-emerald-300">{entry.decoded}</span>
            </div>
          )}
          {entry.meta && (
            <div>
              <span className="text-muted-foreground">meta: </span>
              <span className="break-all text-sky-300">{JSON.stringify(entry.meta)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DebugConsole() {
  const [entries, setEntries] = useState<DebugEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    setEntries([...debugLog.entries]);
    if (paused) return;
    return debugLog.subscribe(() => {
      setEntries([...debugLog.entries]);
    });
  }, [paused]);

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40;
  }, []);

  const handleClear = useCallback(() => {
    debugLog.clear();
    setEntries([]);
    setExpandedIdx(null);
  }, []);

  const filtered = filter
    ? entries.filter((e) => e.channel === filter)
    : entries;

  const channels = ["status", "command", "response", "system"] as const;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <button
            className="flex items-center gap-2"
            onClick={() => setOpen(!open)}
          >
            <Terminal className="h-4 w-4" />
            <CardTitle className="text-base">Debug Console</CardTitle>
            <Badge variant="outline" className="text-[10px]">
              {entries.length}
            </Badge>
            {open ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
          {open && (
            <div className="flex items-center gap-1">
              {channels.map((ch) => (
                <Button
                  key={ch}
                  variant={filter === ch ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setFilter(filter === ch ? null : ch)}
                >
                  {ch}
                </Button>
              ))}
              <div className="mx-1 h-4 w-px bg-border" />
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setPaused(!paused)}
                title={paused ? "Resume" : "Pause"}
              >
                {paused ? (
                  <Play className="h-3 w-3" />
                ) : (
                  <Pause className="h-3 w-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={handleClear}
                title="Clear"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      {open && (
        <CardContent className="p-0">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="max-h-80 overflow-y-auto border-t border-border bg-black/30"
          >
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No debug entries{filter ? ` for "${filter}"` : ""}. Connect to start capturing BLE traffic.
              </div>
            ) : (
              filtered.map((entry, i) => (
                <EntryRow
                  key={`${entry.timestamp}-${i}`}
                  entry={entry}
                  expanded={expandedIdx === i}
                  onToggle={() =>
                    setExpandedIdx(expandedIdx === i ? null : i)
                  }
                />
              ))
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
