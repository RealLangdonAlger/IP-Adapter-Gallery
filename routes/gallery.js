import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";
import { getGalleryDirs, getCompressedDir } from "../utils/galleryUtils.js";
import { getCachedFingerprint } from "../utils/imageProcessing.js";

const router = express.Router();
const fsPromises = fs.promises;

// Define __filename and __dirname.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use memory storage for multer uploads.
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Helper function to find the IPA image for a given reference.
async function findRefImage(baseId, refNumber) {
  const { imagesDir } = getGalleryDirs(baseId);
  const files = await fsPromises.readdir(imagesDir);
  for (const file of files) {
    if (file.startsWith(`${refNumber}.`)) {
      return file;
    }
  }
  return null;
}

// GET /references/:baseId – paginated gallery entries for a base.
router.get("/references/:baseId", async (req, res) => {
  const baseId = req.params.baseId;
  console.log(`[DEBUG] GET /references/${baseId} called. Query: ${JSON.stringify(req.query)}`);
  try {
    const { imagesDir } = getGalleryDirs(baseId);
    const offset = parseInt(req.query.offset) || 0;
    const limit = parseInt(req.query.limit) || 20;
    const files = await fsPromises.readdir(imagesDir);
    const references = [];
    files.forEach((file) => {
      const match = file.match(/^(\d+)\.\w+$/);
      if (match && !references.includes(match[1])) {
        references.push(match[1]);
      }
    });
    references.sort((a, b) => a - b);
    const paginated = references.slice(offset, offset + limit);
    res.json({ references: paginated, total: references.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to read gallery images" });
  }
});

// GET /captions/:baseId/:id – get caption for a gallery entry.
router.get("/captions/:baseId/:id", async (req, res) => {
  const baseId = req.params.baseId;
  console.log(`[DEBUG] GET /captions/${baseId}/${req.params.id} called.`);
  const { captionsDir } = getGalleryDirs(baseId);
  const captionPath = path.join(captionsDir, `${req.params.id}.txt`);
  try {
    await fsPromises.access(captionPath);
    const data = await fsPromises.readFile(captionPath, "utf8");
    res.send(data.trim());
  } catch (err) {
    res.status(404).send("No caption available");
  }
});

// GET /get-image/:baseId/:refNumber/:type – dynamically serve images.
router.get("/get-image/:baseId/:refNumber/:type", async (req, res) => {
  const { baseId, refNumber, type } = req.params;
  console.log(`[DEBUG] GET /get-image/${baseId}/${refNumber}/${type} called.`);
  try {
    const { imagesDir } = getGalleryDirs(baseId);
    const compDir = getCompressedDir(baseId);
    if (type === "ipa") {
      const ipaFile = await findRefImage(baseId, refNumber);
      if (!ipaFile) {
        return res.status(404).json({ error: "IPA image not found" });
      }
      return res.sendFile(path.join(imagesDir, ipaFile));
    } else if (["style", "comp", "both"].includes(type)) {
      const compressedFileName = `${refNumber}-${type}.jpg`;
      const compressedPath = path.join(compDir, compressedFileName);
      if (fs.existsSync(compressedPath)) {
        return res.sendFile(compressedPath);
      } else {
        const originalFileName = `${refNumber}-${type}.png`;
        const originalPath = path.join(imagesDir, originalFileName);
        if (!fs.existsSync(originalPath)) {
          return res.status(404).json({ error: "Original image not found" });
        }
        const image = sharp(originalPath);
        const metadata = await image.metadata();
        const newWidth = Math.round(metadata.width * 0.5);
        const newHeight = Math.round(metadata.height * 0.5);
        await image.resize(newWidth, newHeight).jpeg().toFile(compressedPath);
        console.log(`[DEBUG] Created compressed image: ${compressedFileName}`);
        return res.sendFile(compressedPath);
      }
    } else {
      return res.status(400).json({ error: "Invalid image type" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /upload/:baseId – handle new gallery entry uploads.
router.post(
  "/upload/:baseId",
  upload.fields([
    { name: "ipa", maxCount: 1 },
    { name: "style", maxCount: 1 },
    { name: "comp", maxCount: 1 },
    { name: "both", maxCount: 1 },
  ]),
  async (req, res) => {
    const baseId = req.params.baseId;
    console.log(`[DEBUG] POST /upload/${baseId} called. Files: ${Object.keys(req.files).join(", ")}; Body: ${JSON.stringify(req.body)}`);
    try {
      const { imagesDir } = getGalleryDirs(baseId);
      let maxId = 0;
      const files = await fsPromises.readdir(imagesDir);
      files.forEach((file) => {
        const match = file.match(/^(\d+)\.\w+$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxId) maxId = num;
        }
      });
      const newId = maxId + 1;
      // Save IPA image.
      if (req.files.ipa && req.files.ipa[0]) {
        const ipaFile = req.files.ipa[0];
        if (!ipaFile.mimetype.startsWith("image/")) {
          return res.status(400).json({ error: "Invalid file type for IPA image." });
        }
        const ext = path.extname(ipaFile.originalname) || ".jpg";
        const ipaFilename = `${newId}${ext}`;
        await fsPromises.writeFile(path.join(imagesDir, ipaFilename), ipaFile.buffer);
      } else {
        return res.status(400).json({ error: "IPA reference image is required." });
      }
      // Helper to save additional files.
      async function saveOriginal(file, suffix) {
        if (!file.mimetype.startsWith("image/")) {
          throw new Error(`Invalid file type for ${suffix} image.`);
        }
        const filename = `${newId}-${suffix}.png`;
        await fsPromises.writeFile(path.join(imagesDir, filename), file.buffer);
      }
      if (req.files.style && req.files.style[0]) {
        await saveOriginal(req.files.style[0], "style");
      } else {
        return res.status(400).json({ error: "Style image is required." });
      }
      if (req.files.comp && req.files.comp[0]) {
        await saveOriginal(req.files.comp[0], "comp");
      } else {
        return res.status(400).json({ error: "Comp image is required." });
      }
      if (req.files.both && req.files.both[0]) {
        await saveOriginal(req.files.both[0], "both");
      } else {
        return res.status(400).json({ error: "Both image is required." });
      }
      // Save caption.
      const { captionsDir } = getGalleryDirs(baseId);
      const captionText = req.body.caption || "";
      await fsPromises.writeFile(path.join(captionsDir, `${newId}.txt`), captionText);
      console.log(`[DEBUG] Upload successful. New entry id: ${newId} in base ${baseId}`);
      res.json({ message: "Upload successful", id: newId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

// DELETE /delete/:baseId/:id – delete an entry from a base gallery.
router.delete("/delete/:baseId/:id", async (req, res) => {
  const baseId = req.params.baseId;
  const refId = req.params.id;
  console.log(`[DEBUG] DELETE /delete/${baseId}/${refId} called.`);
  try {
    const { imagesDir, captionsDir } = getGalleryDirs(baseId);
    const compDir = getCompressedDir(baseId);
    const ipaFileName = await findRefImage(baseId, refId);
    if (!ipaFileName) {
      return res.status(404).json({ error: "Entry not found" });
    }
    await fsPromises.unlink(path.join(imagesDir, ipaFileName));
    console.log(`[DEBUG] Deleted IPA file: ${ipaFileName}`);
    const originals = [`${refId}-style.png`, `${refId}-comp.png`, `${refId}-both.png`];
    for (const fileName of originals) {
      await fsPromises.unlink(path.join(imagesDir, fileName)).catch(() => {});
      console.log(`[DEBUG] Deleted original file: ${fileName}`);
    }
    const compressedFiles = [`${refId}-ipa.png`, `${refId}-style.jpg`, `${refId}-comp.jpg`, `${refId}-both.jpg`];
    for (const fileName of compressedFiles) {
      await fsPromises.unlink(path.join(compDir, fileName)).catch(() => {});
      console.log(`[DEBUG] Deleted compressed file: ${fileName}`);
    }
    const captionPath = path.join(captionsDir, `${refId}.txt`);
    await fsPromises.unlink(captionPath).catch(() => {});
    console.log(`[DEBUG] Deleted caption file for entry ${refId}`);
    res.json({ message: "Deletion successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Deletion failed" });
  }
});

export default router;
