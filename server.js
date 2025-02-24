/* eslint-disable no-empty */
/* eslint-disable no-unused-vars */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import express from "express";
import multer from "multer";
import sharp from "sharp";
import fetch from "node-fetch";
const app = express();
const PORT = 3000;
const fsPromises = fs.promises;
// Define __filename and __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Directories for base galleries, base images, and compressed images
const galleriesDir = path.join(__dirname, "public", "galleries");
const baseImagesDir = path.join(__dirname, "public", "base_images");
const imagesCompressedDir = path.join(__dirname, "public", "images_compressed");
// Ensure a directory exists
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, {
      recursive: true,
    });
  }
}
ensureDir(galleriesDir);
ensureDir(baseImagesDir);
ensureDir(imagesCompressedDir);
// Temporary directory for similarity check uploads
const tempDir = path.join(__dirname, "temp");
ensureDir(tempDir);

// Clear out the temporary folder on server startup
fsPromises
  .readdir(tempDir)
  .then((files) => Promise.all(files.map((file) => fsPromises.unlink(path.join(tempDir, file)))))
  .then(() => {
    console.log("[DEBUG] Temporary folder cleared on startup");
  })
  .catch((err) => {
    console.error("[DEBUG] Error clearing temporary folder:", err);
  });

// Get directories for a given base gallery
function getGalleryDirs(baseId) {
  const baseGalleryDir = path.join(galleriesDir, baseId);
  const imagesDir = path.join(baseGalleryDir, "images");
  const captionsDir = path.join(baseGalleryDir, "captions");
  ensureDir(baseGalleryDir);
  ensureDir(imagesDir);
  ensureDir(captionsDir);
  return {
    imagesDir,
    captionsDir,
  };
}
// Get compressed images directory for a given base
function getCompressedDir(baseId) {
  const baseCompressedDir = path.join(imagesCompressedDir, baseId);
  ensureDir(baseCompressedDir);
  return baseCompressedDir;
}
// Use memory storage for multer uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
});
// Serve static files from "public"
app.use(express.static("public"));
/* ===== Proxy to bypass CORS nonsense ===== */
app.get("/proxy", async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).send("Missing URL");
  }
  try {
    // Optional: Validate the URL here to ensure only allowed origins are fetched.
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(500).send("Error fetching the image");
    }
    // Set the appropriate content-type header and pipe the image data
    res.set("Content-Type", response.headers.get("content-type"));
    response.body.pipe(res);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).send("Server error while fetching image");
  }
});
/* ===== New Endpoints for Base Galleries ===== */
// GET /baseImages – auto-detect all base images
app.get("/baseImages", async (req, res) => {
  try {
    const files = await fsPromises.readdir(baseImagesDir);
    const baseList = files
      .filter((file) => /\.(png|jpe?g)$/i.test(file))
      .map((file) => {
        const baseId = file.split(".")[0]; // e.g. "base1"
        return {
          baseId,
          url: `/base_images/${file}`,
        };
      });
    res.json(baseList);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Unable to read base images",
    });
  }
});
// POST /uploadBase – create a new base gallery by uploading a base image
app.post("/uploadBase", upload.single("baseImage"), async (req, res) => {
  try {
    if (!req.file || !req.file.mimetype.startsWith("image/")) {
      return res.status(400).json({
        error: "Invalid file or no file provided",
      });
    }
    // Determine new base id by scanning baseImagesDir for names like base<number>.png
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
    // Convert uploaded base image to PNG and save it
    await sharp(req.file.buffer).png().toFile(newBasePath);
    // Create empty gallery folders for the new base
    getGalleryDirs(newBaseId);
    getCompressedDir(newBaseId);
    console.log(`[DEBUG] New base gallery created: ${newBaseId}`);
    res.json({
      message: "Base gallery created",
      baseId: newBaseId,
      url: `/base_images/${newBaseId}.png`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Base gallery creation failed",
    });
  }
});
/* ===== Existing Gallery Endpoints (now parameterized by baseId) ===== */
// GET /references/:baseId – paginated gallery entries for a base
app.get("/references/:baseId", async (req, res) => {
  const baseId = req.params.baseId;
  console.log(`[DEBUG] GET /references/${baseId} called. Query: ${JSON.stringify(req.query)}`);
  try {
    const { imagesDir } = getGalleryDirs(baseId);
    const offset = parseInt(req.query.offset) || 0;
    const limit = parseInt(req.query.limit) || 20;
    const files = await fsPromises.readdir(imagesDir);
    const references = [];
    // Assume IPA images are stored as <refId>.<ext>
    files.forEach((file) => {
      const match = file.match(/^(\d+)\.\w+$/);
      if (match && !references.includes(match[1])) {
        references.push(match[1]);
      }
    });
    references.sort((a, b) => a - b);
    const paginated = references.slice(offset, offset + limit);
    res.json({
      references: paginated,
      total: references.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Unable to read gallery images",
    });
  }
});
// GET /captions/:baseId/:id – get caption for a gallery entry
app.get("/captions/:baseId/:id", async (req, res) => {
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
// Helper to find the IPA image for a given reference in a base gallery
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
// GET /get-image/:baseId/:refNumber/:type – dynamically serve images
// For type "ipa": resize so that shortest edge becomes 512 and center crop to 512×512
// For "style", "comp", "both": if not compressed, downscale original by 50%
app.get("/get-image/:baseId/:refNumber/:type", async (req, res) => {
  const { baseId, refNumber, type } = req.params;
  console.log(`[DEBUG] GET /get-image/${baseId}/${refNumber}/${type} called.`);
  try {
    const { imagesDir } = getGalleryDirs(baseId);
    const compDir = getCompressedDir(baseId);
    if (type === "ipa") {
      const ipaFile = await findRefImage(baseId, refNumber);
      if (!ipaFile) {
        return res.status(404).json({
          error: "IPA image not found",
        });
      }
      const originalPath = path.join(imagesDir, ipaFile);
      return res.sendFile(originalPath);
    } else if (["style", "comp", "both"].includes(type)) {
      const compressedFileName = `${refNumber}-${type}.jpg`;
      const compressedPath = path.join(compDir, compressedFileName);
      if (fs.existsSync(compressedPath)) {
        return res.sendFile(compressedPath);
      } else {
        const originalFileName = `${refNumber}-${type}.png`;
        const originalPath = path.join(imagesDir, originalFileName);
        if (!fs.existsSync(originalPath)) {
          return res.status(404).json({
            error: "Original image not found",
          });
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
      return res.status(400).json({
        error: "Invalid image type",
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Server error",
    });
  }
});
// POST /upload/:baseId – handle new gallery entry uploads for a base
app.post(
  "/upload/:baseId",
  upload.fields([
    {
      name: "ipa",
      maxCount: 1,
    },
    {
      name: "style",
      maxCount: 1,
    },
    {
      name: "comp",
      maxCount: 1,
    },
    {
      name: "both",
      maxCount: 1,
    },
  ]),
  async (req, res) => {
    const baseId = req.params.baseId;
    console.log(`[DEBUG] POST /upload/${baseId} called. Files: ${Object.keys(req.files).join(", ")}; Body: ${JSON.stringify(req.body)}`);
    try {
      const { imagesDir } = getGalleryDirs(baseId);
      // Determine new reference ID by scanning gallery images (IPA files)
      const files = await fsPromises.readdir(imagesDir);
      let maxId = 0;
      files.forEach((file) => {
        const match = file.match(/^(\d+)\.\w+$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxId) maxId = num;
        }
      });
      const newId = maxId + 1;
      // Save IPA image (original stored; processing is on demand)
      if (req.files.ipa && req.files.ipa[0]) {
        const ipaFile = req.files.ipa[0];
        if (!ipaFile.mimetype.startsWith("image/")) {
          return res.status(400).json({ error: "Invalid file type for IPA image." });
        }
        const ext = path.extname(ipaFile.originalname) || ".jpg";
        const ipaFilename = `${newId}${ext}`;
        await fsPromises.writeFile(path.join(imagesDir, ipaFilename), ipaFile.buffer);

        // Update the fingerprint cache for this base
        if (!fingerprintCache[baseId]) {
          fingerprintCache[baseId] = {};
        }
        const savedBuffer = await fsPromises.readFile(path.join(imagesDir, ipaFilename));
        const newFileHash = await computeImageHash(savedBuffer);
        fingerprintCache[baseId][ipaFilename] = newFileHash;
        console.debug(`[DEBUG] New IPA fingerprint cached for file ${ipaFilename}: ${newFileHash}`);
        await saveFingerprintCache();
      } else {
        return res.status(400).json({ error: "IPA reference image is required." });
      }
      // Save originals for style, comp, and both
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
        return res.status(400).json({
          error: "Style image is required.",
        });
      }
      if (req.files.comp && req.files.comp[0]) {
        await saveOriginal(req.files.comp[0], "comp");
      } else {
        return res.status(400).json({
          error: "Comp image is required.",
        });
      }
      if (req.files.both && req.files.both[0]) {
        await saveOriginal(req.files.both[0], "both");
      } else {
        return res.status(400).json({
          error: "Both image is required.",
        });
      }
      // Save caption
      const { captionsDir } = getGalleryDirs(baseId);
      const captionText = req.body.caption || "";
      await fsPromises.writeFile(path.join(captionsDir, `${newId}.txt`), captionText);
      console.log(`[DEBUG] Upload successful. New entry id: ${newId} in base ${baseId}`);
      res.json({
        message: "Upload successful",
        id: newId,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: "Upload failed",
      });
    }
  }
);
// DELETE /delete/:baseId/:id – delete an entry from a base gallery
app.delete("/delete/:baseId/:id", async (req, res) => {
  const baseId = req.params.baseId;
  const refId = req.params.id;
  console.log(`[DEBUG] DELETE /delete/${baseId}/${refId} called.`);
  try {
    const { imagesDir, captionsDir } = getGalleryDirs(baseId);
    const compDir = getCompressedDir(baseId);
    const ipaFileName = await findRefImage(baseId, refId);
    if (!ipaFileName) {
      return res.status(404).json({
        error: "Entry not found",
      });
    }
    await fsPromises.unlink(path.join(imagesDir, ipaFileName));
    console.log(`[DEBUG] Deleted IPA file: ${ipaFileName}`);
    const originals = [`${refId}-style.png`, `${refId}-comp.png`, `${refId}-both.png`];
    for (const fileName of originals) {
      const filePath = path.join(imagesDir, fileName);
      try {
        await fsPromises.unlink(filePath);
        console.log(`[DEBUG] Deleted original file: ${fileName}`);
      } catch (e) {}
    }
    const compressedFiles = [`${refId}-ipa.png`, `${refId}-style.jpg`, `${refId}-comp.jpg`, `${refId}-both.jpg`];
    for (const fileName of compressedFiles) {
      const filePath = path.join(compDir, fileName);
      try {
        await fsPromises.unlink(filePath);
        console.log(`[DEBUG] Deleted compressed file: ${fileName}`);
      } catch (e) {}
    }
    const captionPath = path.join(captionsDir, `${refId}.txt`);
    try {
      await fsPromises.unlink(captionPath);
      console.log(`[DEBUG] Deleted caption file for entry ${refId}`);
    } catch (e) {}
    res.json({
      message: "Deletion successful",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Deletion failed",
    });
  }
});
// DELETE /deleteGallery/:baseId – delete an entire base gallery
app.delete("/deleteGallery/:baseId", async (req, res) => {
  const baseId = req.params.baseId;
  console.log(`[DEBUG] DELETE /deleteGallery/${baseId} called.`);
  try {
    // Get directories for base images, gallery, and compressed images
    const { imagesDir, captionsDir } = getGalleryDirs(baseId);
    const compDir = getCompressedDir(baseId);
    // Delete the base image file
    const baseImagePath = path.join(baseImagesDir, `${baseId}.png`);
    if (fs.existsSync(baseImagePath)) {
      await fsPromises.unlink(baseImagePath);
      console.log(`[DEBUG] Deleted base image: ${baseImagePath}`);
    }
    // Delete all gallery entries (images and captions)
    const imageFiles = await fsPromises.readdir(imagesDir);
    imageFiles.forEach(async (file) => {
      const match = file.match(/^(\d+)\.\w+$/);
      if (match) {
        const refId = match[1];
        await deleteGalleryEntry(baseId, refId);
      }
    });
    // Delete the gallery directories themselves
    await fsPromises.rmdir(imagesDir, {
      recursive: true,
    });
    await fsPromises.rmdir(captionsDir, {
      recursive: true,
    });
    await fsPromises.rmdir(compDir, {
      recursive: true,
    });
    console.log(`[DEBUG] Deleted gallery directories for base ${baseId}`);
    res.json({
      message: `Gallery for base ${baseId} deleted successfully.`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to delete the gallery",
    });
  }
});
// Helper function to delete all files associated with a specific gallery entry
async function deleteGalleryEntry(baseId, refId) {
  try {
    const { imagesDir, captionsDir } = getGalleryDirs(baseId);
    const compDir = getCompressedDir(baseId);
    // Delete IPA file
    const ipaFilePath = path.join(imagesDir, `${refId}.png`);
    await fsPromises.unlink(ipaFilePath);
    console.log(`[DEBUG] Deleted IPA file: ${ipaFilePath}`);
    // Delete Style, Comp, Both files
    const filesToDelete = [`${refId}-style.png`, `${refId}-comp.png`, `${refId}-both.png`];
    filesToDelete.forEach(async (fileName) => {
      const filePath = path.join(imagesDir, fileName);
      try {
        await fsPromises.unlink(filePath);
        console.log(`[DEBUG] Deleted file: ${filePath}`);
      } catch (e) {
        console.log(`[DEBUG] File not found: ${filePath}`);
      }
    });
    // Delete compressed images
    const compressedFiles = [`${refId}-ipa.png`, `${refId}-style.jpg`, `${refId}-comp.jpg`, `${refId}-both.jpg`];
    compressedFiles.forEach(async (fileName) => {
      const filePath = path.join(compDir, fileName);
      try {
        await fsPromises.unlink(filePath);
        console.log(`[DEBUG] Deleted compressed file: ${filePath}`);
      } catch (e) {
        console.log(`[DEBUG] Compressed file not found: ${filePath}`);
      }
    });
    // Delete caption file
    const captionFilePath = path.join(captionsDir, `${refId}.txt`);
    try {
      await fsPromises.unlink(captionFilePath);
      console.log(`[DEBUG] Deleted caption file: ${captionFilePath}`);
    } catch (e) {
      console.log(`[DEBUG] Caption file not found: ${captionFilePath}`);
    }
  } catch (err) {
    console.error(`[DEBUG] Failed to delete gallery entry ${refId}: ${err}`);
  }
}

// Compute a simple average hash (aHash) for an image buffer
const SHAPE_FINGERPRINT = 8;
async function computeImageHash(buffer) {
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

const COLOR_FINGERPRINT = 2;
async function computeColorFingerprint(buffer) {
  // Resize image to COLOR_FINGERPRINT x COLOR_FINGERPRINT and get raw RGB data.
  const { data, info } = await sharp(buffer).resize(COLOR_FINGERPRINT, COLOR_FINGERPRINT, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });

  // Assume info.channels >= 3 (ignore alpha if present)
  const pixels = [];
  for (let i = 0; i < data.length; i += info.channels) {
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  return pixels; // Array of length COLOR_FINGERPRINT*COLOR_FINGERPRINT, each element is [R, G, B]
}

// Compute the Hamming distance between two binary hash strings
function hammingDistance(hash1, hash2) {
  if (hash1.length !== hash2.length) {
    throw new Error("Hashes must be of equal length");
  }
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) distance++;
  }
  return distance;
}

function weightedColorDistance(color1, color2, lumWeight = 0.7) {
  // Both color1 and color2 are arrays of [R, G, B] for each pixel.
  if (color1.length !== color2.length) {
    throw new Error("Color fingerprints must be of equal length");
  }
  let totalLumDiff = 0;
  let totalColorDiff = 0;
  for (let i = 0; i < color1.length; i++) {
    const [R1, G1, B1] = color1[i];
    const [R2, G2, B2] = color2[i];
    // Compute luminance for each pixel (Rec. 709)
    const L1 = 0.2126 * R1 + 0.7152 * G1 + 0.0722 * B1;
    const L2 = 0.2126 * R2 + 0.7152 * G2 + 0.0722 * B2;
    const lumDiff = Math.abs(L1 - L2);
    // Compute average per-channel absolute difference for color
    const colorDiff = (Math.abs(R1 - R2) + Math.abs(G1 - G2) + Math.abs(B1 - B2)) / 3;
    totalLumDiff += lumDiff;
    totalColorDiff += colorDiff;
  }
  // Average differences over all pixels
  const avgLumDiff = totalLumDiff / color1.length;
  const avgColorDiff = totalColorDiff / color1.length;
  // Normalize differences (maximum difference per channel is 255)
  const normLumDiff = avgLumDiff / 255;
  const normColorDiff = avgColorDiff / 255;
  // Weight luminance difference more heavily
  return lumWeight * normLumDiff + (1 - lumWeight) * normColorDiff;
}

const cacheFilePath = path.join(__dirname, "fingerprintCache.json");

// Global in-memory cache for image fingerprints.
// Structure: { [baseId]: { [fileName]: fingerprint } }
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

// Function to save the fingerprint cache to disk.
async function saveFingerprintCache() {
  try {
    await fsPromises.writeFile(cacheFilePath, JSON.stringify(fingerprintCache, null, 2));
  } catch (err) {
    console.error("Failed to save fingerprint cache:", err);
  }
}

async function getCachedFingerprint(baseId, fileName) {
  const { imagesDir } = getGalleryDirs(baseId);
  if (!fingerprintCache[baseId]) {
    fingerprintCache[baseId] = {};
  }
  if (!fingerprintCache[baseId][fileName]) {
    const filePath = path.join(imagesDir, fileName);
    const buffer = await fsPromises.readFile(filePath);
    const shape = await computeImageHash(buffer);
    // Use the new function to compute the raw color fingerprint
    const color = await computeColorFingerprint(buffer);
    fingerprintCache[baseId][fileName] = { shape, color };
    await saveFingerprintCache();
  }
  return fingerprintCache[baseId][fileName];
}

// POST /check-similarity/:baseId – Check if an uploaded IPA image is similar to existing ones in the gallery.
app.post("/check-similarity/:baseId", upload.single("ipa"), async (req, res) => {
  const baseId = req.params.baseId;
  console.log(`[DEBUG] POST /check-similarity/${baseId} called.`);
  try {
    if (!req.file || !req.file.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "Invalid file or no file provided" });
    }

    const downscaledBuffer = await sharp(req.file.buffer).resize(256, 256, { fit: "inside" }).toBuffer();

    const tempFileName = path.join(tempDir, `temp-${Date.now()}.png`);
    await fsPromises.writeFile(tempFileName, downscaledBuffer);

    const newShapeHash = await computeImageHash(downscaledBuffer);
    // Use new color fingerprint function
    const newColorFingerprint = await computeColorFingerprint(downscaledBuffer);

    const { imagesDir } = getGalleryDirs(baseId);
    if (!fingerprintCache[baseId]) {
      fingerprintCache[baseId] = {};
    }
    const files = await fsPromises.readdir(imagesDir);
    let minShapeDistance = Infinity;
    let minColorDistance = Infinity;
    let minCombinedDistance = Infinity;
    const shapeWeight = 0.4;
    const lumWeight = 0.6;
    const maxShape = SHAPE_FINGERPRINT * SHAPE_FINGERPRINT;

    for (const file of files) {
      if (/^\d+\.(png|jpe?g|gif|webm)$/i.test(file)) {
        const cached = await getCachedFingerprint(baseId, file);
        const shapeDistance = hammingDistance(newShapeHash, cached.shape) / maxShape;
        const colorDistance = weightedColorDistance(newColorFingerprint, cached.color, lumWeight);
        const combinedDistance = shapeWeight * shapeDistance + (1 - shapeWeight) * colorDistance;
        if (shapeDistance < minShapeDistance) minShapeDistance = shapeDistance;
        if (colorDistance < minColorDistance) minColorDistance = colorDistance;
        if (combinedDistance < minCombinedDistance) minCombinedDistance = combinedDistance;
      }
    }
    const threshold = (SHAPE_FINGERPRINT * SHAPE_FINGERPRINT + COLOR_FINGERPRINT * COLOR_FINGERPRINT * 3) / 20;
    const isSimilar = minCombinedDistance <= threshold;
    return res.json({
      similar: isSimilar,
      minCombinedDistance,
      minShapeDistance,
      minColorDistance,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Similarity check failed" });
  }
});

// GET /similarity/:baseId/:refNumber – compute similarity between base and style/comp images
app.get("/similarity/:baseId/:refNumber", async (req, res) => {
  const { baseId, refNumber } = req.params;
  console.log(`[DEBUG] POST /similarity/${baseId}/${refNumber} called.`);
  try {
    // Load the base image (assumed to be stored as baseId.png in baseImagesDir)
    const baseImagePath = path.join(baseImagesDir, `${baseId}.png`);
    if (!fs.existsSync(baseImagePath)) {
      return res.status(404).json({ error: "Base image not found" });
    }
    const baseBuffer = await fsPromises.readFile(baseImagePath);
    const baseShapeHash = await computeImageHash(baseBuffer);
    const baseColorFingerprint = await computeColorFingerprint(baseBuffer);

    // Define weighting factors
    const shapeWeight = 0.4; // Equal weight for shape and color
    const lumWeight = 0.6; // Weight luminance differences more heavily in color comparison

    const maxShape = SHAPE_FINGERPRINT * SHAPE_FINGERPRINT;

    const { imagesDir } = getGalleryDirs(baseId);

    // For Style image:
    const styleFile = `${refNumber}-style.png`;
    const styleFingerprint = await getCachedFingerprint(baseId, styleFile);
    const styleShapeDistance = hammingDistance(baseShapeHash, styleFingerprint.shape) / maxShape;
    const styleColorDistance = weightedColorDistance(baseColorFingerprint, styleFingerprint.color, lumWeight);
    const styleCombinedDistance = shapeWeight * styleShapeDistance + (1 - shapeWeight) * styleColorDistance;

    // For Comp image:
    const compFile = `${refNumber}-comp.png`;
    const compFingerprint = await getCachedFingerprint(baseId, compFile);
    const compShapeDistance = hammingDistance(baseShapeHash, compFingerprint.shape) / maxShape;
    const compColorDistance = weightedColorDistance(baseColorFingerprint, compFingerprint.color, lumWeight);
    const compCombinedDistance = shapeWeight * compShapeDistance + (1 - shapeWeight) * compColorDistance;

    // For Both image:
    const bothFile = `${refNumber}-both.png`;
    if (!fs.existsSync(path.join(imagesDir, bothFile))) {
      return res.status(404).json({ error: "Both image not found" });
    }

    return res.json({
      style: {
        shapeDistance: styleShapeDistance,
        colorDistance: styleColorDistance,
        combinedDistance: styleCombinedDistance,
      },
      comp: {
        shapeDistance: compShapeDistance,
        colorDistance: compColorDistance,
        combinedDistance: compCombinedDistance,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Similarity computation failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
