/**
 * Homework attachments, shared by the staff app and the student app: shrink
 * photos before upload, show authenticated thumbnails, and open a full-size
 * viewer. Files are fetched with the caller's auth headers (never public URLs).
 */
import { useEffect, useState } from "react";
import { FileText, X, Loader2, Plus } from "lucide-react";
import { apiBlobUrl } from "../lib/api";

export type HwFile = { id: string; name: string | null; mime: string; size: number };

/** Shrink a phone photo to ≤1600 px JPEG (a 4 MB photo becomes ~300 KB). PDFs pass through. */
export async function prepareUpload(file: File): Promise<{ blob: Blob; name: string }> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return { blob: file, name: file.name };
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 900_000 && file.type !== "image/heic") return { blob: file, name: file.name };
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob) return { blob: file, name: file.name };
    return { blob, name: file.name.replace(/\.\w+$/, "") + ".jpg" };
  } catch {
    return { blob: file, name: file.name };
  }
}

/** One attachment: thumbnail for photos, a document tile for PDFs. */
export function FileThumb({
  file,
  src,
  headers,
  onRemove,
  size = 76,
}: {
  file: HwFile;
  src: string;
  headers?: Record<string, string>;
  onRemove?: () => void;
  size?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const isImage = file.mime.startsWith("image/");
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    apiBlobUrl(src, headers)
      .then((u) => {
        made = u;
        if (alive) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const openIt = () => {
    if (!url) return;
    if (isImage) setOpen(true);
    else window.open(url, "_blank");
  };

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <button
        type="button"
        onClick={openIt}
        className="grid h-full w-full place-items-center overflow-hidden rounded-xl bg-bg ring-1 ring-border"
        title={file.name ?? undefined}
      >
        {!url && !failed ? (
          <Loader2 size={18} className="animate-spin text-muted" />
        ) : isImage && url ? (
          <img src={url} alt={file.name ?? ""} className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 px-1 text-muted">
            <FileText size={22} />
            <span className="w-full truncate text-[9px]">{file.name ?? "PDF"}</span>
          </span>
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-dark text-white shadow-card"
        >
          <X size={13} />
        </button>
      )}
      {open && url && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-3" onClick={() => setOpen(false)}>
          <img src={url} alt={file.name ?? ""} className="max-h-full max-w-full rounded-lg object-contain" />
          <button type="button" aria-label="Close" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white">
            <X size={22} />
          </button>
        </div>
      )}
    </div>
  );
}

/** "Add photo" tile that opens the camera/gallery picker. */
export function AddFileTile({ onFiles, busy, label, size = 76 }: { onFiles: (files: File[]) => void; busy?: boolean; label: string; size?: number }) {
  return (
    <label
      className="grid shrink-0 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-border text-muted"
      style={{ width: size, height: size }}
    >
      {busy ? (
        <Loader2 size={20} className="animate-spin" />
      ) : (
        <span className="flex flex-col items-center gap-0.5 text-[10px] font-bold">
          <Plus size={20} />
          {label}
        </span>
      )}
      <input
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (list.length) onFiles(list);
        }}
      />
    </label>
  );
}
