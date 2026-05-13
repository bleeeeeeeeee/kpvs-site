const path = require("path");
const crypto = require("crypto");
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const JPEG = Buffer.from([255, 216, 255]);
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const WEBP_RIFF = Buffer.from("RIFF");
const WEBP_MAGIC = Buffer.from("WEBP");
const AVIF_FTYP = Buffer.from("ftyp");
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_BYTES = 10 * 1024 * 1024;
function getS3Config() {
  const endpoint = String(process.env.STORAGE_ENDPOINT || "").trim();
  const key = String(process.env.STORAGE_KEY || "").trim();
  const secret = String(process.env.STORAGE_SECRET || "").trim();
  const bucket = String(process.env.STORAGE_BUCKET || "").trim();
  const publicUrl = String(process.env.STORAGE_PUBLIC_URL || "").trim().replace(/\/$/, "");
  if (!endpoint || !key || !secret || !bucket || !publicUrl) return null;
  return { endpoint, key, secret, bucket, publicUrl };
}
function createClient(cfg) {
  return new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.key, secretAccessKey: cfg.secret },
    forcePathStyle: true
  });
}
function detectImageMime(buffer) {
  if (!buffer || buffer.length < 12) return "";
  if (buffer.subarray(0, 3).equals(JPEG.subarray(0, 3))) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(PNG)) return "image/png";
  if (buffer.length >= 12 && buffer.subarray(0, 4).equals(WEBP_RIFF) && buffer.subarray(8, 12).equals(WEBP_MAGIC)) {
    return "image/webp";
  }
  const ftyp = buffer.indexOf(AVIF_FTYP);
  if (ftyp >= 4 && ftyp < 32) return "image/avif";
  return "";
}
function buildObjectKey(folder, originalName) {
  const safeFolder = String(folder || "uploads").replace(/[^a-z0-9/_-]/gi, "").replace(/^\/+/, "") || "uploads";
  const ext = path.extname(String(originalName || "")).toLowerCase().replace(/[^a-z0-9.]/g, "") || ".bin";
  const rand = crypto.randomBytes(16).toString("hex");
  return `${safeFolder}/${Date.now()}-${rand}${ext}`;
}
async function uploadBuffer(buffer, opts) {
  const cfg = getS3Config();
  if (!cfg) throw new Error("storage_not_configured");
  if (!buffer || buffer.length > MAX_BYTES) throw new Error("file_too_large");
  const mimeFromBytes = detectImageMime(buffer);
  const declared = String(opts && opts.mime || "").trim();
  const mime = mimeFromBytes || declared;
  if (!ALLOWED_MIME.has(mime)) throw new Error("invalid_image_type");
  const client = createClient(cfg);
  const key = buildObjectKey(opts && opts.folder, opts && opts.originalName);
  await client.send(new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    Body: buffer,
    ContentType: mime
  }));
  const url = `${cfg.publicUrl}/${key.replace(/^\/+/, "")}`;
  return { url, key };
}
async function deleteByPublicUrl(url) {
  const cfg = getS3Config();
  if (!cfg || !url) return;
  const prefix = `${cfg.publicUrl}/`;
  if (!String(url).startsWith(prefix)) return;
  const key = String(url).slice(prefix.length);
  const client = createClient(cfg);
  await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}
function getPublicUrlForKey(key) {
  const cfg = getS3Config();
  if (!cfg) return "";
  return `${cfg.publicUrl}/${String(key || "").replace(/^\/+/, "")}`;
}
function isConfigured() {
  return getS3Config() !== null;
}
module.exports = {
  uploadBuffer,
  deleteByPublicUrl,
  getPublicUrlForKey,
  isConfigured,
  MAX_BYTES,
  ALLOWED_MIME,
  detectImageMime
};
