import { supabaseAdmin } from "./supabase";
import { logRequestSignal } from "./observability";

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "fleetops-files";

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

async function ensureBucket() {
  const { error } = await supabaseAdmin.storage.createBucket(STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: "50MB",
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    logRequestSignal({ event: "storage_error", requestId: "storage", path: "createBucket", message: error.message });
    throw new Error(`Supabase Storage bucket setup failed: ${error.message}`);
  }
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  await ensureBucket();
  const key = appendHashSuffix(normalizeKey(relKey));
  const payload = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  const { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(key, payload, {
    contentType,
    upsert: false,
    cacheControl: "3600",
  });
  if (error) { logRequestSignal({ event: "storage_error", requestId: "storage", path: "upload", message: error.message }); throw new Error(`Supabase Storage upload failed: ${error.message}`); }

  const url = await storageGetSignedUrl(key);
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: await storageGetSignedUrl(key) };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  const { data, error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).createSignedUrl(key, 900);
  if (error || !data?.signedUrl) {
    logRequestSignal({ event: "storage_error", requestId: "storage", path: "createSignedUrl", message: error?.message ?? "empty signed URL" });
    throw new Error(`Supabase Storage signed URL failed: ${error?.message ?? "empty signed URL"}`);
  }
  return data.signedUrl;
}
