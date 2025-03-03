import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";
import { baseImagesDir, getGalleryDirs, getCompressedDir, galleriesDir } from "../utils/galleryUtils.js";
import { ensureDir } from "../utils/fsUtils.js";

const router = express.Router();
const fsPromises = fs.promises;

// Define __filename and __dirname for this module.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set up multer with memory storage for file uploads.
const storage = multer.memoryStorage();
const upload = multer({ storage });

ensureDir(baseImagesDir);
ensureDir(galleriesDir);

// GET /baseImages – auto-detect all base images.
router.get("/baseImages", async (req, res) => {
  try {
    const files = await fsPromises.readdir(baseImagesDir);
    const baseList = files
      .filter((file) => /\.(png|jpe?g)$/i.test(file))
      .map((file) => {
        const baseId = file.split(".")[0];
        return { baseId, url: `/base_images/${file}` };
      });
    res.json(baseList);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to read base images" });
  }
});

// POST /uploadBase – create a new base gallery by uploading a base image.
router.post("/uploadBase", upload.single("baseImage"), async (req, res) => {
  try {
    if (!req.file || !req.file.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "Invalid file or no file provided" });
    }
    // Determine new base id by scanning baseImagesDir.
    const files = await fsPromises.readdir(baseImagesDir);
    let maxNum = 0;
    files.forEach((file) => {
      const match = file.match(/^base(\d+)\./);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    const newBaseNum = maxNum + 1;
    const newBaseId = `base${newBaseNum}`;
    const newBasePath = path.join(baseImagesDir, `${newBaseId}.png`);
    await sharp(req.file.buffer).png().toFile(newBasePath);
    // Create empty gallery folders for the new base.
    getGalleryDirs(newBaseId);
    getCompressedDir(newBaseId);

    // NEW: Save gallery metadata (galleryType)
    const galleryType = req.body.galleryType || "ipa";
    const metadata = { galleryType };
    await fsPromises.writeFile(path.join(galleriesDir, newBaseId, "metadata.json"), JSON.stringify(metadata, null, 2));
    console.log(`[DEBUG] New base gallery created: ${newBaseId} with type ${galleryType}`);
    res.json({
      message: "Base gallery created",
      baseId: newBaseId,
      url: `/base_images/${newBaseId}.png`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Base gallery creation failed" });
  }
});

// DELETE /deleteGallery/:baseId – delete an entire base gallery.
router.delete("/deleteGallery/:baseId", async (req, res) => {
  const baseId = req.params.baseId;
  console.log(`[DEBUG] DELETE /deleteGallery/${baseId} called.`);

  try {
    const compDir = getCompressedDir(baseId); // Compressed images directory
    const baseGalleryDir = path.join(galleriesDir, baseId); // Main gallery folder

    // Delete the base image file.
    const baseImagePath = path.join(baseImagesDir, `${baseId}.png`);
    if (fs.existsSync(baseImagePath)) {
      await fs.promises.unlink(baseImagePath);
      console.log(`[DEBUG] Deleted base image: ${baseImagePath}`);
    }

    // ✅ Delete the entire gallery folder (images, captions, metadata.json)
    if (fs.existsSync(baseGalleryDir)) {
      await fs.promises.rm(baseGalleryDir, { recursive: true, force: true });
      console.log(`[DEBUG] Deleted gallery folder: ${baseGalleryDir}`);
    } else {
      console.log(`[DEBUG] Gallery folder not found: ${baseGalleryDir}`);
    }

    // ✅ Delete the compressed images directory
    if (fs.existsSync(compDir)) {
      await fs.promises.rm(compDir, { recursive: true, force: true });
      console.log(`[DEBUG] Deleted compressed images: ${compDir}`);
    } else {
      console.log(`[DEBUG] Compressed images folder not found: ${compDir}`);
    }

    res.json({ message: `Gallery for base ${baseId} deleted successfully.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete the gallery" });
  }
});

export default router;
