import { useAS120 } from "@/hooks/useAS120";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ListOrdered, ChevronRight, X } from "lucide-react";
import type { QueuedAction } from "@/transport/types";

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

function ActionCard({ action }: { action: QueuedAction }) {
  const bg = MOTOR_BG[action.motor] ?? "bg-muted border-border";
  const accent = MOTOR_ACCENT[action.motor] ?? "bg-primary";
  const text = MOTOR_TEXT[action.motor] ?? "text-foreground";

  // Progress for active action
  let progressPct = 0;
  if (action.active && action.position != null) {
    const dist = Math.abs(action.target - action.position);
    // We don't know the origin, but we can show remaining distance
    // Use target as reference: if position === target, 100%
    if (action.target === action.position) {
      progressPct = 100;
    } else {
      // Estimate: clamp to reasonable range
      const maxTravel = 2000;
      progressPct = Math.max(2, Math.min(98, 100 - (dist / maxTravel) * 100));
    }
  }

  const label =
    action.type === "absolute"
      ? `\u2192 ${action.target}`
      : action.type === "increment"
        ? `+${action.target}`
        : `\u2212${action.target}`;

  return (
    <div
      className={`relative overflow-hidden rounded-lg border px-3 py-2 shrink-0 ${bg} ${
        action.active ? "min-w-36" : "min-w-24"
      }`}
    >
      {/* Progress bar for active action */}
      {action.active && (
        <div
          className={`absolute inset-y-0 left-0 ${accent} opacity-15 transition-all duration-200`}
          style={{ width: `${progressPct}%` }}
        />
      )}
      <div className="relative flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-bold ${text}`}>{action.motor}</span>
          {action.active && (
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
              active
            </span>
          )}
        </div>
        <div className="font-mono text-sm font-semibold tabular-nums">
          {label}
        </div>
        {action.active && action.position != null && (
          <div className="font-mono text-[10px] text-muted-foreground tabular-nums">
            pos {action.position}
          </div>
        )}
      </div>
    </div>
  );
}

export function MotionQueue() {
  const { status, clearQueue } = useAS120();
  if (!status) return null;

  const queue = status.queue ?? [];

  return (
    <Card>
      <CardHeader className="pb-2 px-4 pt-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <ListOrdered className="h-4 w-4 text-muted-foreground" />
          Motion Queue
          {queue.length > 0 && (
            <span className="text-[10px] font-normal text-muted-foreground tabular-nums">
              {queue.length} action{queue.length !== 1 ? "s" : ""}
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
      <CardContent className="px-4 pb-3">
        <div className="h-[72px] flex items-center overflow-hidden">
        {queue.length === 0 ? (
          <div className="flex items-center justify-center w-full text-xs text-muted-foreground">
            Queue empty — all motors idle
          </div>
        ) : (
          <div className="flex items-center gap-1.5 overflow-x-auto w-full">
            {queue.map((action, i) => (
              <div key={i} className="flex items-center gap-1.5 shrink-0">
                {i > 0 && (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                )}
                <ActionCard action={action} />
              </div>
            ))}
          </div>
        )}
        </div>
      </CardContent>
    </Card>
  );
}
