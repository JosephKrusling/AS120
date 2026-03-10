import { useAS120 } from "@/hooks/useAS120";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, ListOrdered, X } from "lucide-react";
import type { QueuedAction, CompletedAction } from "@/transport/types";

/** Max completed items to keep rendered (older ones fall off the right) */
const MAX_HISTORY = 5;

const MOTOR_BG: Record<string, string> = {
  FB: "bg-blue-500/15 border-blue-500/30",
  UD: "bg-emerald-500/15 border-emerald-500/30",
  PL: "bg-amber-500/15 border-amber-500/30",
  LR: "bg-purple-500/15 border-purple-500/30",
};

const MOTOR_ACCENT: Record<string, string> = {
  FB: "bg-blue-500",
  UD: "bg-emerald-500",
  PL: "bg-amber-500",
  LR: "bg-purple-500",
};

const MOTOR_TEXT: Record<string, string> = {
  FB: "text-blue-400",
  UD: "text-emerald-400",
  PL: "text-amber-400",
  LR: "text-purple-400",
};

/** Map full motor name to short key */
function motorKey(name: string): string {
  if (name.includes("Forward") || name.includes("Back")) return "FB";
  if (name.includes("Up") || name.includes("Down")) return "UD";
  if (name.includes("Plunger")) return "PL";
  if (name.includes("Right") || name.includes("Left")) return "LR";
  return name.slice(0, 2).toUpperCase();
}

function formatLabel(type: string, target: number): string {
  if (type === "absolute") return `\u2192 ${target}`;
  if (type === "increment") return `+${target}`;
  return `\u2212${target}`;
}

function ActiveCard({ action }: { action: QueuedAction }) {
  const key = motorKey(action.motor);
  const bg = MOTOR_BG[key] ?? "bg-muted border-border";
  const accent = MOTOR_ACCENT[key] ?? "bg-primary";
  const text = MOTOR_TEXT[key] ?? "text-foreground";

  let progressPct = 0;
  if (action.position != null) {
    const dist = Math.abs(action.target - action.position);
    if (action.target === action.position) {
      progressPct = 100;
    } else {
      const maxTravel = 2000;
      progressPct = Math.max(2, Math.min(98, 100 - (dist / maxTravel) * 100));
    }
  }

  return (
    <div
      className={`relative overflow-hidden rounded-lg border-2 px-3 py-2 w-full ${bg} ring-1 ring-white/10`}
    >
      <div
        className={`absolute inset-y-0 left-0 ${accent} opacity-15 transition-all duration-200`}
        style={{ width: `${progressPct}%` }}
      />
      <div className="relative flex flex-col gap-0.5">
        <span className={`text-xs font-bold ${text}`}>{key}</span>
        <div className="font-mono text-sm font-semibold tabular-nums">
          {formatLabel(action.type, action.target)}
          {action.position != null && (
            <span className="text-[10px] text-muted-foreground ml-1">
              @{action.position}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SmallCard({
  motor,
  type,
  target,
  dimmed,
}: {
  motor: string;
  type: string;
  target: number;
  dimmed?: boolean;
}) {
  const key = motorKey(motor);
  const bg = MOTOR_BG[key] ?? "bg-muted border-border";
  const text = MOTOR_TEXT[key] ?? "text-foreground";

  return (
    <div
      className={`rounded-lg border px-2.5 py-1.5 shrink-0 min-w-20 ${bg} ${
        dimmed ? "opacity-40" : ""
      }`}
    >
      <div className="flex flex-col gap-0.5">
        <span className={`text-xs font-bold ${text}`}>{key}</span>
        <div className="font-mono text-sm font-semibold tabular-nums">
          {formatLabel(type, target)}
        </div>
      </div>
    </div>
  );
}

export function MotionQueue() {
  const { status, clearQueue } = useAS120();

  if (!status) return null;

  const fullHistory: CompletedAction[] = status.history ?? [];
  const history = fullHistory.slice(-MAX_HISTORY);
  const queue: QueuedAction[] = status.queue ?? [];

  const activeAction = queue.find((a) => a.active);
  const pendingActions = queue.filter((a) => !a.active);

  const totalItems = fullHistory.length + (activeAction ? 1 : 0) + pendingActions.length;

  return (
    <Card>
      <CardHeader className="pb-2 px-4 pt-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold h-6">
          <ListOrdered className="h-4 w-4 text-muted-foreground" />
          Motion Queue
          {totalItems > 0 && (
            <span className="text-[10px] font-normal text-muted-foreground tabular-nums">
              {pendingActions.length} queued
              {fullHistory.length > 0 && ` / ${fullHistory.length} done`}
            </span>
          )}
          {queue.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive"
              onClick={clearQueue}
            >
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 h-[88px]">
        {/* 3-column grid: queued | current | complete */}
        <div className="grid grid-cols-[1fr_auto_11rem_auto_1fr] items-center h-full overflow-hidden">
          {/* Left: queued */}
          <div className="flex flex-col overflow-hidden h-full">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold text-right mb-1">
              {pendingActions.length > 0 ? "Queued" : "\u00A0"}
            </span>
            <div className="flex items-center gap-1.5 justify-end overflow-hidden flex-1">
              {[...pendingActions].reverse().map((a, i) => (
                <SmallCard
                  key={`p-${pendingActions.length - 1 - i}`}
                  motor={a.motor}
                  type={a.type}
                  target={a.target}
                />
              ))}
            </div>
          </div>

          {/* Arrow: queued → current */}
          <ChevronRight className="h-4 w-4 text-muted-foreground mx-1 mt-4" />

          {/* Center: current action or idle */}
          <div className="flex flex-col min-w-0 overflow-hidden h-full">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold text-center mb-1">
              Current
            </span>
            <div className="flex-1 flex items-center">
              {activeAction ? (
                <ActiveCard action={activeAction} />
              ) : (
                <div className="rounded-lg border-2 border-dashed border-border px-3 py-2 w-full">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs font-semibold text-muted-foreground">Idle</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Arrow: current → complete */}
          <ChevronRight className="h-4 w-4 text-muted-foreground mx-1 mt-4" />

          {/* Right: complete */}
          <div className="flex flex-col overflow-hidden h-full">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold text-left mb-1">
              {history.length > 0 ? "Completed" : "\u00A0"}
            </span>
            <div className="flex items-center gap-1.5 justify-start overflow-hidden flex-1">
              {[...history].reverse().map((h, i) => (
                <SmallCard
                  key={`h-${fullHistory.length - 1 - i}`}
                  motor={h.motor}
                  type={h.type}
                  target={h.target}
                  dimmed
                />
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
