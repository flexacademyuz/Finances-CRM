/**
 * Homework file upload/download helpers shared by the staff and student
 * routes. Uploads arrive as a raw body (one file per request, name in
 * X-File-Name); the type is decided by the file's own bytes, never by the
 * client's Content-Type, so only real JPEG/PNG/WebP/PDF files get stored.
 */
import type { Request, Response } from "express";
import { MAX_FILE_BYTES } from "@shared/homework";
import { httpError } from "./helpers";

/** Detect the file type from its first bytes. */
export function sniffMime(b: Buffer): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (b.length >= 5 && b.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export function readUpload(req: Request): { data: Buffer; mime: string; name: string | null } {
  const data = Buffer.isBuffer(req.body) ? (req.body as Buffer) : null;
  if (!data || data.length === 0) throw httpError(400, "no_file", "No file received.");
  if (data.length > MAX_FILE_BYTES) throw httpError(413, "file_too_large", "The file is too large (max 5 MB).");
  const mime = sniffMime(data);
  if (!mime) throw httpError(415, "bad_file_type", "Only photos (JPG, PNG, WebP) and PDF files are allowed.");
  let name: string | null = null;
  const raw = req.header("x-file-name");
  if (raw) {
    try {
      name = decodeURIComponent(raw).replace(/[\\/\r\n"]/g, "_").slice(0, 120) || null;
    } catch {
      name = null;
    }
  }
  return { data, mime, name };
}

export function sendFile(res: Response, f: { data: Buffer; mime: string; name: string | null; id: string }) {
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[f.mime] ?? "bin";
  const filename = (f.name || `file-${f.id.slice(0, 8)}.${ext}`).replace(/[^\w.\- ]/g, "_");
  res.setHeader("Content-Type", f.mime);
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(f.data);
}
