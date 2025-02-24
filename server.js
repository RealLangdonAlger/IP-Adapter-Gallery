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
  .then((files) =>
    Promise.all(
      files.map((file) => fsPromises.unlink(path.join(tempDir, file)))
    )
  )
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
  console.log(
    `[DEBUG] GET /references/${baseId} called. Query: ${JSON.stringify(
      req.query
    )}`
  );
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
    console.log(
      `[DEBUG] POST /upload/${baseId} called. Files: ${Object.keys(
        req.files
      ).join(", ")}; Body: ${JSON.stringify(req.body)}`
    );
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
          return res
            .status(400)
            .json({ error: "Invalid file type for IPA image." });
        }
        const ext = path.extname(ipaFile.originalname) || ".jpg";
        const ipaFilename = `${newId}${ext}`;
        await fsPromises.writeFile(
          path.join(imagesDir, ipaFilename),
          ipaFile.buffer
        );

        // Update the fingerprint cache for this base
        if (!fingerprintCache[baseId]) {
          fingerprintCache[baseId] = {};
        }
        const savedBuffer = await fsPromises.readFile(
          path.join(imagesDir, ipaFilename)
        );
        const newFileHash = await computeImageHash(savedBuffer);
        fingerprintCache[baseId][ipaFilename] = newFileHash;
        console.debug(
          `[DEBUG] New IPA fingerprint cached for file ${ipaFilename}: ${newFileHash}`
        );
        await saveFingerprintCache();
      } else {
        return res
          .status(400)
          .json({ error: "IPA reference image is required." });
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
      await fsPromises.writeFile(
        path.join(captionsDir, `${newId}.txt`),
        captionText
      );
      console.log(
        `[DEBUG] Upload successful. New entry id: ${newId} in base ${baseId}`
      );
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
    const originals = [
      `${refId}-style.png`,
      `${refId}-comp.png`,
      `${refId}-both.png`,
    ];
    for (const fileName of originals) {
      const filePath = path.join(imagesDir, fileName);
      try {
        await fsPromises.unlink(filePath);
        console.log(`[DEBUG] Deleted original file: ${fileName}`);
      } catch (e) {}
    }
    const compressedFiles = [
      `${refId}-ipa.png`,
      `${refId}-style.jpg`,
      `${refId}-comp.jpg`,
      `${refId}-both.jpg`,
    ];
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
    const filesToDelete = [
      `${refId}-style.png`,
      `${refId}-comp.png`,
      `${refId}-both.png`,
    ];
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
    const compressedFiles = [
      `${refId}-ipa.png`,
      `${refId}-style.jpg`,
      `${refId}-comp.jpg`,
      `${refId}-both.jpg`,
    ];
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
const FINGERPRINT_SIZE = 8;
async function computeImageHash(buffer) {
  const { data } = await sharp(buffer)
    .resize(FINGERPRINT_SIZE, FINGERPRINT_SIZE, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
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

// Compute a simple color hash for an image buffer
// This function preserves color information by not converting to grayscale.
const COLOR_HASH_SIZE = 4;
async function computeColorHash(buffer) {
  const { data, info } = await sharp(buffer)
    .resize(COLOR_HASH_SIZE, COLOR_HASH_SIZE, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const numPixels = info.width * info.height;
  let totalR = 0,
    totalG = 0,
    totalB = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    totalR += data[i];
    totalG += data[i + 1];
    totalB += data[i + 2];
  }
  const avgR = totalR / numPixels;
  const avgG = totalG / numPixels;
  const avgB = totalB / numPixels;
  let hash = "";
  for (let i = 0; i < data.length; i += info.channels) {
    hash += data[i] > avgR ? "1" : "0";
    hash += data[i + 1] > avgG ? "1" : "0";
    hash += data[i + 2] > avgB ? "1" : "0";
  }
  return hash;
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

const cacheFilePath = path.join(__dirname, "fingerprintCache.json");

// Global in-memory cache for image fingerprints.
// Structure: { [baseId]: { [fileName]: fingerprint } }
let fingerprintCache = {};

// Load fingerprint cache from disk if available.
fsPromises
  .readFile(cacheFilePath, "utf8")
  .then((data) => {
    fingerprintCache = JSON.parse(data);
    console.log(
      "[DEBUG] Fingerprint cache loaded from disk:",
      fingerprintCache
    );
  })
  .catch((err) => {
    console.log("[DEBUG] No fingerprint cache found, starting fresh");
    fingerprintCache = {};
  });

// Function to save the fingerprint cache to disk.
async function saveFingerprintCache() {
  try {
    await fsPromises.writeFile(
      cacheFilePath,
      JSON.stringify(fingerprintCache, null, 2)
    );
  } catch (err) {
    console.error("Failed to save fingerprint cache:", err);
  }
}

// POST /check-similarity/:baseId – Check if an uploaded IPA image is similar to existing ones in the gallery.
app.post(
  "/check-similarity/:baseId",
  upload.single("ipa"),
  async (req, res) => {
    const baseId = req.params.baseId;
    try {
      if (!req.file || !req.file.mimetype.startsWith("image/")) {
        return res
          .status(400)
          .json({ error: "Invalid file or no file provided" });
      }

      // Downscale the image for efficient hashing
      const downscaledBuffer = await sharp(req.file.buffer)
        .resize(256, 256, { fit: "inside" })
        .toBuffer();

      // Optionally, save the downscaled image into a temporary directory
      const tempFileName = path.join(tempDir, `temp-${Date.now()}.png`);
      await fsPromises.writeFile(tempFileName, downscaledBuffer);

      // Compute hash of the new IPA image
      const newHash = await computeImageHash(downscaledBuffer);

      // Check against existing IPA images in the gallery for this base
      const { imagesDir } = getGalleryDirs(baseId);
      if (!fingerprintCache[baseId]) {
        fingerprintCache[baseId] = {};
      }
      const files = await fsPromises.readdir(imagesDir);
      let minDistance = Infinity;
      let updated = false;
      for (const file of files) {
        if (/^\d+\.(png|jpe?g|gif|webm)$/i.test(file)) {
          // Assuming IPA images follow this naming
          if (!fingerprintCache[baseId][file]) {
            console.debug(
              `[DEBUG] Cache miss for file ${file} in base ${baseId}. Computing fingerprint.`
            );

            const existingBuffer = await fsPromises.readFile(
              path.join(imagesDir, file)
            );
            const existingHash = await computeImageHash(existingBuffer);
            fingerprintCache[baseId][file] = existingHash;
            updated = true;
            console.debug(
              `[DEBUG] Cached fingerprint for file ${file}: ${existingHash}`
            );
          } else {
            console.debug(
              `[DEBUG] Cache hit for file ${file} in base ${baseId}.`
            );
          }
          const distance = hammingDistance(
            newHash,
            fingerprintCache[baseId][file]
          );
          console.debug(
            `[DEBUG] Hamming distance for new image vs ${file}: ${distance}`
          );

          if (distance < minDistance) {
            minDistance = distance;
          }
        }
      }
      if (updated) {
        console.debug(
          `[DEBUG] Fingerprint cache updated for base ${baseId}. Saving cache to disk.`
        );
        await saveFingerprintCache();
      }
      const threshold = (FINGERPRINT_SIZE * FINGERPRINT_SIZE) / 10; // 10% of the total fingerprint size
      const isSimilar = minDistance <= threshold;
      return res.json({ similar: isSimilar, minDistance });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Similarity check failed" });
    }
  }
);

// GET /similarity/:baseId/:refNumber – compute similarity between base and style/comp images
app.get("/similarity/:baseId/:refNumber", async (req, res) => {
  const { baseId, refNumber } = req.params;
  try {
    // Load the base image with caching
    const baseImagePath = path.join(baseImagesDir, `${baseId}.png`);
    if (!fs.existsSync(baseImagePath)) {
      return res.status(404).json({ error: "Base image not found" });
    }
    if (!fingerprintCache[baseId]) {
      fingerprintCache[baseId] = {};
    }
    let updated = false;
    async function getFingerprint(filePath, key) {
      if (fingerprintCache[baseId][key]) {
        return fingerprintCache[baseId][key];
      } else {
        const buffer = await fsPromises.readFile(filePath);
        const hash = await computeImageHash(buffer);
        fingerprintCache[baseId][key] = hash;
        updated = true;
        return hash;
      }
    }
    const baseKey = `${baseId}.png`;
    const baseHash = await getFingerprint(baseImagePath, baseKey);

    // Get gallery images directory for this base
    const { imagesDir } = getGalleryDirs(baseId);

    // Load and cache the Style image
    const styleImagePath = path.join(imagesDir, `${refNumber}-style.png`);
    if (!fs.existsSync(styleImagePath)) {
      return res.status(404).json({ error: "Style image not found" });
    }
    const styleKey = `${refNumber}-style.png`;
    const styleHash = await getFingerprint(styleImagePath, styleKey);
    const styleDistance = hammingDistance(baseHash, styleHash);

    // Load and cache the Comp image
    const compImagePath = path.join(imagesDir, `${refNumber}-comp.png`);
    if (!fs.existsSync(compImagePath)) {
      return res.status(404).json({ error: "Comp image not found" });
    }
    const compKey = `${refNumber}-comp.png`;
    const compHash = await getFingerprint(compImagePath, compKey);
    const compDistance = hammingDistance(baseHash, compHash);

    // Load and cache the Both image
    const bothImagePath = path.join(imagesDir, `${refNumber}-both.png`);
    if (!fs.existsSync(bothImagePath)) {
      return res.status(404).json({ error: "Both image not found" });
    }
    const bothKey = `${refNumber}-both.png`;
    const bothHash = await getFingerprint(bothImagePath, bothKey);

    // Compute distances between the Both image and the Style/Comp images
    const bothDistanceStyle = hammingDistance(bothHash, styleHash);
    const bothDistanceComp = hammingDistance(bothHash, compHash);

    // If any new fingerprints were computed, save the cache to disk
    if (updated) {
      await saveFingerprintCache();
    }
    // Return the similarity scores to the client for further client-side processing
    return res.json({
      styleDistance,
      compDistance,
      bothDistanceStyle,
      bothDistanceComp,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Similarity computation failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
