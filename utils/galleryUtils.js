import path from "path";
import { fileURLToPath } from "url";
import { ensureDir } from "./fsUtils.js";

// Compute __filename and __dirname relative to this file.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");

// Define key directories.
export const galleriesDir = path.join(rootDir, "public", "galleries");
export const baseImagesDir = path.join(rootDir, "public", "base_images");
export const imagesCompressedDir = path.join(rootDir, "public", "images_compressed");

export function getGalleryDirs(baseId) {
  const baseGalleryDir = path.join(galleriesDir, baseId);
  const imagesDir = path.join(baseGalleryDir, "images");
  const captionsDir = path.join(baseGalleryDir, "captions");
  ensureDir(baseGalleryDir);
  ensureDir(imagesDir);
  ensureDir(captionsDir);
  return { imagesDir, captionsDir };
}

export function getCompressedDir(baseId) {
  const baseCompressedDir = path.join(imagesCompressedDir, baseId);
  ensureDir(baseCompressedDir);
  return baseCompressedDir;
}
