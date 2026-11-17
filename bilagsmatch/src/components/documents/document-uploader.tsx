"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, FileWarning, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";
const CONCURRENCY = 3;

type Item = {
  key: string;
  name: string;
  progress: number;
  state: "queued" | "uploading" | "done" | "duplicate" | "error";
  message?: string;
};

function uploadOne(url: string, file: File, onProgress: (p: number) => void): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new Error("Netværksfejl under upload."));
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}

function isDuplicate(body: unknown): body is { duplicate: true; message: string } {
  return typeof body === "object" && body !== null && "duplicate" in body && body.duplicate === true && "message" in body && typeof body.message === "string";
}

function errorText(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") return body.error;
  return `Upload fejlede (${status}).`;
}

export function DocumentUploader({ clientId, onUploaded }: { clientId: string; onUploaded?: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);

  const patch = (key: string, p: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...p } : it)));

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const batch: { item: Item; file: File }[] = files.map((file, i) => ({
        file,
        item: {
          key: `${Date.now()}-${i}-${file.name}`,
          name: file.name,
          progress: 0,
          state: file.size > MAX_BYTES ? "error" : "queued",
          message: file.size > MAX_BYTES ? "Filen er større end 20 MB og kan ikke uploades." : undefined,
        },
      }));
      setItems((prev) => [...batch.map((b) => b.item), ...prev].slice(0, 100));
      const queue = batch.filter((b) => b.item.state === "queued");
      let ok = 0;
      const worker = async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          const { item, file } = next;
          patch(item.key, { state: "uploading" });
          try {
            const res = await uploadOne(`/api/clients/${clientId}/documents`, file, (p) => patch(item.key, { progress: p }));
            if (res.status === 201) {
              ok++;
              patch(item.key, { state: "done", progress: 100 });
            } else if (res.status === 200 && isDuplicate(res.body)) {
              patch(item.key, { state: "duplicate", message: res.body.message });
            } else {
              patch(item.key, { state: "error", message: errorText(res.body, res.status) });
            }
          } catch (e) {
            patch(item.key, { state: "error", message: e instanceof Error ? e.message : "Upload fejlede." });
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      if (ok > 0) {
        toast.success(`${ok} ${ok === 1 ? "bilag" : "bilag"} uploadet – aflæsning er i gang.`);
        onUploaded?.();
        router.refresh();
      }
    },
    [clientId, onUploaded, router],
  );

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload bilag: træk filer hertil eller tryk for at vælge"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dragging ? "border-primary bg-accent" : "border-border bg-card hover:bg-muted/50",
        )}
      >
        <UploadCloud className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">Træk bilag hertil, eller klik for at vælge</p>
        <p className="text-sm text-muted-foreground">PDF, JPG eller PNG · maks. 20 MB pr. fil · gerne mange ad gangen</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          data-testid="document-input"
          onChange={(e) => {
            void handleFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      {items.length > 0 ? (
        <ul className="flex flex-col gap-1.5" aria-label="Uploads" aria-live="polite">
          {items.map((it) => (
            <li key={it.key} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
              {it.state === "done" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
              ) : it.state === "error" || it.state === "duplicate" ? (
                <FileWarning className="h-4 w-4 shrink-0 text-warning" aria-hidden />
              ) : (
                <UploadCloud className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate">{it.name}</span>
              {it.state === "uploading" || it.state === "queued" ? (
                <div className="h-1.5 w-32 overflow-hidden rounded bg-muted" role="progressbar" aria-valuenow={it.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Upload af ${it.name}`}>
                  <div className="h-full bg-primary transition-all" style={{ width: `${it.progress}%` }} />
                </div>
              ) : null}
              <span
                className={cn(
                  "shrink-0 text-xs",
                  it.state === "error" ? "text-danger" : it.state === "duplicate" ? "text-warning" : "text-muted-foreground",
                )}
              >
                {it.state === "done"
                  ? "Uploadet"
                  : it.state === "queued"
                    ? "Venter…"
                    : it.state === "uploading"
                      ? `${it.progress} %`
                      : it.message}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
