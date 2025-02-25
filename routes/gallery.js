import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";
import { getGalleryDirs, getCompressedDir, galleriesDir } from "../utils/galleryUtils.js";
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

    // Load gallery metadata to determine gallery type
    let galleryType = "ipa";
    try {
      const metadataPath = path.join(galleriesDir, baseId, "metadata.json");
      const metaRaw = await fsPromises.readFile(metadataPath, "utf8");
      const meta = JSON.parse(metaRaw);
      galleryType = meta.galleryType || "ipa";
    } catch (err) {
      console.log("Metadata not found, defaulting to IPA mode");
    }
    res.json({ references: paginated, total: references.length, galleryType });
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
    console.log(`[DEBUG] GET /captions/${baseId}/${req.params.id} returned ${data.trim()}.`);
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
    if (type === "ipa" || type === "character") {
      const file = await findRefImage(baseId, refNumber);
      if (!file) {
        return res.status(404).json({ error: `${type} image not found` });
      }
      return res.sendFile(path.join(imagesDir, file));
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
    { name: "character", maxCount: 1 },
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

      // Load gallery metadata to determine gallery type
      let galleryType = "ipa";
      const metadataPath = path.join(galleriesDir, baseId, "metadata.json");
      try {
        const metaRaw = await fsPromises.readFile(metadataPath, "utf8");
        const meta = JSON.parse(metaRaw);
        galleryType = meta.galleryType || "ipa";
      } catch (err) {
        console.log("Metadata not found, defaulting to IPA mode");
      }

      if (galleryType === "character") {
        // Process character upload (expecting field "character")
        if (req.files.character && req.files.character[0]) {
          const charFile = req.files.character[0];
          if (!charFile.mimetype.startsWith("image/")) {
            return res.status(400).json({ error: "Invalid file type for character image." });
          }
          const ext = path.extname(charFile.originalname) || ".jpg";
          const charFilename = `${newId}${ext}`;
          await fsPromises.writeFile(path.join(imagesDir, charFilename), charFile.buffer);
        } else {
          return res.status(400).json({ error: "Character image is required." });
        }
      } else {
        // IPA mode: process IPA, style, comp, both images.
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

router.get("/filterColor/:baseId", async (req, res) => {
  const baseId = req.params.baseId;
  const hexColor = req.query.color;
  const offset = parseInt(req.query.offset) || 0;
  const limit = parseInt(req.query.limit) || 20;

  if (!hexColor) {
    return res.status(400).json({ error: "Color parameter is required" });
  }

  console.log(`[DEBUG] GET /filterColor/${baseId}/${hexColor} called.`);
  // Convert hex (e.g. "#RRGGBB") to RGB array
  let targetRGB;
  try {
    const hex = hexColor.replace("#", "");
    if (hex.length !== 6) throw new Error("Invalid hex length");
    targetRGB = [parseInt(hex.substring(0, 2), 16), parseInt(hex.substring(2, 4), 16), parseInt(hex.substring(4, 6), 16)];
  } catch (err) {
    return res.status(400).json({ error: "Invalid color format" });
  }

  const { imagesDir } = getGalleryDirs(baseId);
  let files;
  try {
    files = await fsPromises.readdir(imagesDir);
  } catch (err) {
    return res.status(500).json({ error: "Unable to read gallery images" });
  }

  // Only consider style images (filenames like "123-style.png")
  const styleFiles = files.filter((file) => /^(\d+)-style\.(png|jpe?g)$/i.test(file));
  const results = [];

  for (const file of styleFiles) {
    try {
      const match = file.match(/^(\d+)-style\./);
      if (match) {
        const refNumber = match[1];

        // Get Style image's fingerprint and compute its average color.
        const styleCached = await getCachedFingerprint(baseId, file, imagesDir);
        const stylePixels = styleCached.color;
        let sumR = 0,
          sumG = 0,
          sumB = 0;
        for (const pixel of stylePixels) {
          sumR += pixel[0];
          sumG += pixel[1];
          sumB += pixel[2];
        }
        const count = stylePixels.length;
        const styleAvg = [sumR / count, sumG / count, sumB / count];

        // Compute average color for the corresponding Both image.
        const bothFileName = `${refNumber}-both.png`;
        let bothAvg;
        if (files.includes(bothFileName)) {
          const bothCached = await getCachedFingerprint(baseId, bothFileName, imagesDir);
          const bothPixels = bothCached.color;
          let bothSumR = 0,
            bothSumG = 0,
            bothSumB = 0;
          for (const pixel of bothPixels) {
            bothSumR += pixel[0];
            bothSumG += pixel[1];
            bothSumB += pixel[2];
          }
          const bothCount = bothPixels.length;
          bothAvg = [bothSumR / bothCount, bothSumG / bothCount, bothSumB / bothCount];
        } else {
          // If no Both image, fall back to Style average.
          bothAvg = styleAvg;
        }

        // Compute weighted average: 70% Style, 30% Both.
        const weightedAvg = [0.7 * styleAvg[0] + 0.3 * bothAvg[0], 0.7 * styleAvg[1] + 0.3 * bothAvg[1], 0.7 * styleAvg[2] + 0.3 * bothAvg[2]];

        // Compute Euclidean distance from the target color.
        const distance = Math.sqrt(Math.pow(weightedAvg[0] - targetRGB[0], 2) + Math.pow(weightedAvg[1] - targetRGB[1], 2) + Math.pow(weightedAvg[2] - targetRGB[2], 2));

        results.push({ refNumber, distance });
      }
    } catch (err) {
      console.error("Error processing file", file, err);
    }
  }

  // Sort results by increasing distance.
  results.sort((a, b) => a.distance - b.distance);
  const total = results.length;
  const paginated = results.slice(offset, offset + limit).map((r) => r.refNumber);
  return res.json({ references: paginated, total });
});

export default router;
