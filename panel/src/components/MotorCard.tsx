import { useState, useCallback } from "react";
import { useAS120 } from "@/hooks/useAS120";
import type { MotorStatus } from "@/transport/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Home,
  ArrowRight,
  Settings,
} from "lucide-react";

const FULL_STEP_RANGE: Record<string, number> = { LR: 2250, FB: 500, UD: 500, PL: 500 };

const MOTOR_LABELS: Record<string, string> = {
  FB: "Forward / Back",
  UD: "Up / Down",
  PL: "Plunger",
  LR: "Left / Right",
};

const MOTOR_ACCENT: Record<string, string> = {
  LR: "text-amber-400",
  FB: "text-blue-400",
  UD: "text-emerald-400",
  PL: "text-purple-400",
};

const MOTOR_BORDER: Record<string, string> = {
  LR: "border-l-amber-500/50",
  FB: "border-l-blue-500/50",
  UD: "border-l-emerald-500/50",
  PL: "border-l-purple-500/50",
};

interface MotorCardProps {
  motor: MotorStatus;
}

export function MotorCard({ motor }: MotorCardProps) {
  const { moveMotor, jogMotor, homeMotor, setMotorConfig } = useAS120();
  const [targetPosition, setTargetPosition] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<{
    speed_min: number;
    speed_max: number;
    max_acceleration: number;
    step_size: number;
  } | null>(null);

  const config = pendingConfig ?? {
    speed_min: motor.speed_min,
    speed_max: motor.speed_max,
    max_acceleration: motor.max_acceleration,
    step_size: motor.step_size,
  };

  const handleGo = useCallback(() => {
    const pos = parseInt(targetPosition, 10);
    if (!isNaN(pos)) {
      moveMotor(motor.index, pos);
      setTargetPosition("");
    }
  }, [targetPosition, motor.index, moveMotor]);

  const handleJog = useCallback(
    (steps: number) => {
      jogMotor(motor.index, steps);
    },
    [motor.index, jogMotor]
  );

  const handleHome = useCallback(() => {
    homeMotor(motor.index);
  }, [motor.index, homeMotor]);

  const handleConfigChange = useCallback(
    (key: string, value: number) => {
      const next = { ...config, [key]: value };
      setPendingConfig(next);
    },
    [config]
  );

  const applyConfig = useCallback(() => {
    if (!pendingConfig) return;
    setMotorConfig(motor.index, pendingConfig);
    setPendingConfig(null);
  }, [pendingConfig, motor.index, setMotorConfig]);

  return (
    <Card className={`border-l-2 ${MOTOR_BORDER[motor.name] ?? ""}`}>
      <CardContent className="space-y-2 px-3 py-2">
        {/* Label, position, input, go, home — all one row */}
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-bold shrink-0 w-6 ${MOTOR_ACCENT[motor.name] ?? ""}`}>{motor.name}</span>
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              motor.is_home
                ? "bg-green-400 shadow-[0_0_4px_theme(colors.green.400)]"
                : motor.home_switch
                  ? "bg-yellow-400 shadow-[0_0_4px_theme(colors.yellow.400)]"
                  : "bg-zinc-600"
            }`}
            title={motor.is_home ? "Homed" : motor.home_switch ? "Switch triggered" : "Not homed"}
          />
          <span className="text-[11px] text-muted-foreground shrink-0">=</span>
          <span className="font-mono text-lg font-bold tabular-nums shrink-0 w-16">
            {motor.position}
          </span>
          <span className="ml-auto" />
          <Input
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Go to position"
            value={targetPosition}
            onChange={(e) => setTargetPosition(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGo()}
            className="font-mono h-10 text-sm w-40 shrink-0"
          />
          <Button
            variant="secondary"
            size="sm"
            className="h-10 text-sm px-3 shrink-0"
            onClick={handleGo}
            disabled={targetPosition === ""}
          >
            <ArrowRight className="mr-1 h-4 w-4" />
            Go
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => setSettingsOpen(!settingsOpen)}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {/* Jog buttons with home button between -1 and +1 */}
        <div className="grid grid-cols-9 gap-1.5">
          {[-1000, -100, -10, -1].map((steps) => (
            <Button
              key={steps}
              variant="outline"
              size="sm"
              className="font-mono text-xs h-10 px-1"
              onClick={() => handleJog(steps)}
            >
              {steps}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className={`h-10 px-1 ${motor.is_home ? "text-green-400 border-green-500/30" : "text-yellow-400 border-yellow-500/30"}`}
            onClick={handleHome}
            title="Home"
          >
            <Home className="h-4 w-4" />
          </Button>
          {[1, 10, 100, 1000].map((steps) => (
            <Button
              key={steps}
              variant="outline"
              size="sm"
              className="font-mono text-xs h-10 px-1"
              onClick={() => handleJog(steps)}
            >
              +{steps}
            </Button>
          ))}
        </div>

      </CardContent>

      {/* Settings modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSettingsOpen(false)} />
          <div className="relative z-10 w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{motor.name} Settings</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSettingsOpen(false)}>
                &times;
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Speed Min</Label>
                <span className="font-mono text-xs text-muted-foreground">{config.speed_min}</span>
              </div>
              <Slider min={0} max={10000} step={100} value={config.speed_min}
                onValueChange={(v) => handleConfigChange("speed_min", v)} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Speed Max</Label>
                <span className="font-mono text-xs text-muted-foreground">{config.speed_max}</span>
              </div>
              <Slider min={0} max={20000} step={100} value={config.speed_max}
                onValueChange={(v) => handleConfigChange("speed_max", v)} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Max Acceleration</Label>
                <span className="font-mono text-xs text-muted-foreground">{config.max_acceleration}</span>
              </div>
              <Slider min={0} max={50000} step={500} value={config.max_acceleration}
                onValueChange={(v) => handleConfigChange("max_acceleration", v)} />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Microstepping</Label>
              <div className="grid grid-cols-5 gap-1">
                {([
                  [1, "Full"],
                  [2, "1/2"],
                  [3, "1/4"],
                  [4, "1/8"],
                  [5, "1/16"],
                ] as [number, string][]).map(([val, label]) => (
                  <Button
                    key={val}
                    variant={config.step_size === val ? "default" : "outline"}
                    size="sm"
                    className="h-9 text-xs px-2"
                    onClick={() => handleConfigChange("step_size", val)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground leading-tight">
                <span>Fastest<br/>Most Torque</span>
                <span className="text-center">0 – {((FULL_STEP_RANGE[motor.name] ?? 500) * (1 << (config.step_size - 1))).toLocaleString()} steps</span>
                <span className="text-right">Smoothest<br/>Least Torque</span>
              </div>
            </div>

            {pendingConfig && (
              <Button size="sm" className="w-full" onClick={applyConfig}>
                Apply Settings
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
