import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const fsPromises = fs.promises;

export const SHAPE_FINGERPRINT = 8;
export const COLOR_FINGERPRINT = 2;

// Compute __filename and __dirname for this module.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");
const cacheFilePath = path.join(rootDir, "fingerprintCache.json");

// Global in-memory cache for image fingerprints.
let fingerprintCache = {};

// Load fingerprint cache from disk if available.
fsPromises
  .readFile(cacheFilePath, "utf8")
  .then((data) => {
    fingerprintCache = JSON.parse(data);
    console.log("[DEBUG] Fingerprint cache loaded from disk");
  })
  .catch(() => {
    console.log("[DEBUG] No fingerprint cache found, starting fresh");
    fingerprintCache = {};
  });

export async function saveFingerprintCache() {
  try {
    await fsPromises.writeFile(cacheFilePath, JSON.stringify(fingerprintCache, null, 2));
  } catch (err) {
    console.error("Failed to save fingerprint cache:", err);
  }
}

export async function computeImageHash(buffer) {
  const { data } = await sharp(buffer).resize(SHAPE_FINGERPRINT, SHAPE_FINGERPRINT, { fit: "fill" }).grayscale().raw().toBuffer({ resolveWithObject: true });
  let total = 0;
  for (let i = 0; i < data.length; i++) {
    total += data[i];
  }
  const avg = total / data.length;
  let hash = "";
  for (let i = 0; i < data.length; i++) {
    hash += data[i] > avg ? "1" : "0";
  }
  return hash;
}

export async function computeColorFingerprint(buffer) {
  const { data, info } = await sharp(buffer).resize(COLOR_FINGERPRINT, COLOR_FINGERPRINT, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const pixels = [];
  for (let i = 0; i < data.length; i += info.channels) {
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  return pixels;
}

export function hammingDistance(hash1, hash2) {
  if (hash1.length !== hash2.length) {
    throw new Error("Hashes must be of equal length");
  }
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) distance++;
  }
  return distance;
}

export function weightedColorDistance(color1, color2, lumWeight = 0.7) {
  if (color1.length !== color2.length) {
    throw new Error("Color fingerprints must be of equal length");
  }
  let totalLumDiff = 0;
  let totalColorDiff = 0;
  for (let i = 0; i < color1.length; i++) {
    const [R1, G1, B1] = color1[i];
    const [R2, G2, B2] = color2[i];
    const L1 = 0.2126 * R1 + 0.7152 * G1 + 0.0722 * B1;
    const L2 = 0.2126 * R2 + 0.7152 * G2 + 0.0722 * B2;
    const lumDiff = Math.abs(L1 - L2);
    const colorDiff = (Math.abs(R1 - R2) + Math.abs(G1 - G2) + Math.abs(B1 - B2)) / 3;
    totalLumDiff += lumDiff;
    totalColorDiff += colorDiff;
  }
  const avgLumDiff = totalLumDiff / color1.length;
  const avgColorDiff = totalColorDiff / color1.length;
  const normLumDiff = avgLumDiff / 255;
  const normColorDiff = avgColorDiff / 255;
  return lumWeight * normLumDiff + (1 - lumWeight) * normColorDiff;
}

export async function getCachedFingerprint(baseId, fileName, imagesDir) {
  if (!fingerprintCache[baseId]) {
    fingerprintCache[baseId] = {};
  }
  if (!fingerprintCache[baseId][fileName]) {
    const filePath = path.join(imagesDir, fileName);
    const buffer = await fsPromises.readFile(filePath);
    const shape = await computeImageHash(buffer);
    const color = await computeColorFingerprint(buffer);
    fingerprintCache[baseId][fileName] = { shape, color };
    await saveFingerprintCache();
  }
  return fingerprintCache[baseId][fileName];
}
