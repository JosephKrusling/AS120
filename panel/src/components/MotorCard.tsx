import { useState, useCallback } from "react";
import { useAS120 } from "@/hooks/useAS120";
import type { MotorStatus } from "@/transport/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Home,
  ChevronDown,
  ChevronUp,
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
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">
              {motor.name}
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {MOTOR_LABELS[motor.name] ?? `Motor ${motor.index}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {motor.is_home ? (
              <Badge
                variant="outline"
                className="border-green-500/30 text-green-400 text-xs"
              >
                Homed
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-yellow-500/30 text-yellow-400 text-xs"
              >
                Not Homed
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Position display */}
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl font-bold tabular-nums">
            {motor.position}
          </span>
          <span className="text-sm text-muted-foreground">steps</span>
        </div>

        {/* Absolute position + Go */}
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Position"
            value={targetPosition}
            onChange={(e) => setTargetPosition(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGo()}
            className="font-mono"
          />
          <Button
            variant="secondary"
            onClick={handleGo}
            disabled={targetPosition === ""}
          >
            <ArrowRight className="mr-1 h-4 w-4" />
            Go
          </Button>
          <Button variant="outline" size="icon" onClick={handleHome} title="Home">
            <Home className="h-4 w-4" />
          </Button>
        </div>

        {/* Jog buttons */}
        <div className="grid grid-cols-6 gap-1">
          {jogButtons.map((steps) => (
            <Button
              key={steps}
              variant="outline"
              size="sm"
              className="font-mono text-xs"
              onClick={() => handleJog(steps)}
            >
              {steps > 0 ? `+${steps}` : steps}
            </Button>
          ))}
        </div>

        {/* Settings toggle */}
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="flex w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Settings className="h-3 w-3" />
          Settings
          {settingsOpen ? (
            <ChevronUp className="ml-auto h-3 w-3" />
          ) : (
            <ChevronDown className="ml-auto h-3 w-3" />
          )}
        </button>

        {/* Settings panel */}
        {settingsOpen && (
          <div className="space-y-4 rounded-lg border border-border bg-background p-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Speed Min</Label>
                <span className="font-mono text-xs text-muted-foreground">
                  {config.speed_min}
                </span>
              </div>
              <Slider
                min={0}
                max={10000}
                step={100}
                value={config.speed_min}
                onValueChange={(v) => handleConfigChange("speed_min", v)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Speed Max</Label>
                <span className="font-mono text-xs text-muted-foreground">
                  {config.speed_max}
                </span>
              </div>
              <Slider
                min={0}
                max={20000}
                step={100}
                value={config.speed_max}
                onValueChange={(v) => handleConfigChange("speed_max", v)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Max Acceleration</Label>
                <span className="font-mono text-xs text-muted-foreground">
                  {config.max_acceleration}
                </span>
              </div>
              <Slider
                min={0}
                max={50000}
                step={500}
                value={config.max_acceleration}
                onValueChange={(v) =>
                  handleConfigChange("max_acceleration", v)
                }
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Step Size</Label>
                <span className="font-mono text-xs text-muted-foreground">
                  {config.step_size}
                </span>
              </div>
              <Slider
                min={1}
                max={32}
                step={1}
                value={config.step_size}
                onValueChange={(v) => handleConfigChange("step_size", v)}
              />
            </div>

            {pendingConfig && (
              <Button size="sm" className="w-full" onClick={applyConfig}>
                Apply Settings
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
