import { useAS120 } from "@/hooks/useAS120";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";
import { PanelUpdater } from "./PanelUpdater";

export function SystemInfo() {
  const { homeAll, connected } = useAS120();

  if (!connected) return null;

  return (
    <div className="flex items-center justify-between">
      <PanelUpdater />
      <Button variant="outline" size="sm" onClick={homeAll}>
        <Home className="mr-1.5 h-3.5 w-3.5" />
        Home All Motors
      </Button>
    </div>
  );
}
