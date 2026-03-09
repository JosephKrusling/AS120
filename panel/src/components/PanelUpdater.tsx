import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, Check, AlertCircle } from "lucide-react";

type UploadState = "idle" | "uploading" | "success" | "error";

export function PanelUpdater() {
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (file: File) => {
    setState("uploading");
    setProgress(0);
    setError(null);

    try {
      const data = await file.arrayBuffer();

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/ota/spiffs");

      await new Promise<void>((resolve, reject) => {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            try {
              const body = JSON.parse(xhr.responseText);
              reject(new Error(body.error || `HTTP ${xhr.status}`));
            } catch {
              reject(new Error(`HTTP ${xhr.status}`));
            }
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(data);
      });

      setState("success");
      // Device reboots — wait then reload the page
      setTimeout(() => {
        window.location.reload();
      }, 5000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setState("error");
    }
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
      // Reset so same file can be selected again
      e.target.value = "";
    },
    [handleUpload]
  );

  return (
    <div className="flex items-center gap-3">
      <input
        ref={fileRef}
        type="file"
        accept=".bin"
        className="hidden"
        onChange={handleFileChange}
      />

      {state === "idle" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          Update Panel
        </Button>
      )}

      {state === "uploading" && (
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-muted-foreground">Uploading... {progress}%</span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {state === "success" && (
        <div className="flex items-center gap-2 text-sm text-emerald-400">
          <Check className="h-4 w-4" />
          Updated — rebooting...
        </div>
      )}

      {state === "error" && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setState("idle"); setError(null); }}
          >
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
