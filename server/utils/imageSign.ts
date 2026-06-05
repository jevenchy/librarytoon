import crypto from "node:crypto";
import { LOGGER } from "./logger.js";

// HMAC-signs each scraped URL so /api/img cannot proxy arbitrary CDNs (open-proxy prevention).
// Set IMAGE_SECRET env var for cross-instance and rolling-deploy signature consistency.
const SECRET = process.env.IMAGE_SECRET
  ? crypto.createHash("sha256").update(process.env.IMAGE_SECRET).digest()
  : crypto.randomBytes(32);

if (process.env.IMAGE_SECRET && process.env.IMAGE_SECRET.length < 32) {
  LOGGER.warn("server_config", "IMAGE_SECRET is shorter than 32 characters - use a stronger value for production deployments.");
}

export function signImageUrl(url: string): string {
  return crypto.createHmac("sha256", SECRET).update(url).digest("hex");
}

export function verifyImageSig(url: string, sig: string | undefined): boolean {
  if (!sig) return false;
  const expected = signImageUrl(url);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch { return false; }
}
