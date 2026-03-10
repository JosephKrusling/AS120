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

const MOTOR_LABELS: Record<string, string> = {
  FB: "Forward / Back",
  UD: "Up / Down",
  PL: "Plunger",
  LR: "Left / Right",
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

  const jogButtons = [-100, -10, -1, 1, 10, 100];

  return (
    <Card>
      <CardContent className="space-y-2 px-3 py-2">
        {/* Label, position, input, go, home — all one row */}
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold shrink-0 w-6">{motor.name}</span>
          <span className="text-[11px] text-muted-foreground shrink-0">=</span>
          <span className="font-mono text-lg font-bold tabular-nums shrink-0 w-16">
            {motor.position}
          </span>
          <span className="ml-auto" />
          <Input
            type="number"
            placeholder="Go to position"
            value={targetPosition}
            onChange={(e) => setTargetPosition(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGo()}
            className="font-mono h-7 text-xs w-36 shrink-0"
          />
          <Button
            variant="secondary"
            size="sm"
            className="h-7 text-xs px-2 shrink-0"
            onClick={handleGo}
            disabled={targetPosition === ""}
          >
            <ArrowRight className="mr-1 h-3 w-3" />
            Go
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setSettingsOpen(!settingsOpen)}
            title="Settings"
          >
            <Settings className="h-3 w-3" />
          </Button>
        </div>

        {/* Jog buttons with home button between -1 and +1 */}
        <div className="grid grid-cols-7 gap-1">
          {[-100, -10, -1].map((steps) => (
            <Button
              key={steps}
              variant="outline"
              size="sm"
              className="font-mono text-[10px] h-6 px-1"
              onClick={() => handleJog(steps)}
            >
              {steps}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className={`h-6 px-1 ${motor.is_home ? "text-green-400 border-green-500/30" : "text-yellow-400 border-yellow-500/30"}`}
            onClick={handleHome}
            title="Home"
          >
            <Home className="h-3 w-3" />
          </Button>
          {[1, 10, 100].map((steps) => (
            <Button
              key={steps}
              variant="outline"
              size="sm"
              className="font-mono text-[10px] h-6 px-1"
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
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSettingsOpen(false)}>
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
              <div className="flex items-center justify-between">
                <Label className="text-xs">Step Size</Label>
                <span className="font-mono text-xs text-muted-foreground">{config.step_size}</span>
              </div>
              <Slider min={1} max={32} step={1} value={config.step_size}
                onValueChange={(v) => handleConfigChange("step_size", v)} />
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
