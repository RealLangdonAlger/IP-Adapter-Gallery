const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const sharp = require("sharp");

const app = express();
const PORT = 3000;
const fsPromises = fs.promises;

// Directories for originals, captions, and compressed images
const imagesDir = path.join(__dirname, "public", "images");
const captionsDir = path.join(__dirname, "public", "captions");
const imagesCompressedDir = path.join(__dirname, "public", "images_compressed");

// Ensure necessary directories exist
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
ensureDir(imagesDir);
ensureDir(captionsDir);
ensureDir(imagesCompressedDir);

// Use memory storage for multer; we'll write files asynchronously on upload
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Serve static files from the "public" directory
app.use(express.static("public"));

// GET /references – paginated endpoint
app.get("/references", async (req, res) => {
  console.log(`[DEBUG] GET /references called. Query: ${JSON.stringify(req.query)}`);
  try {
    const offset = parseInt(req.query.offset) || 0;
    const limit = parseInt(req.query.limit) || 20;
    const files = await fsPromises.readdir(imagesDir);
    const references = [];
    files.forEach(file => {
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
    res.status(500).json({ error: "Unable to read images directory" });
  }
});

// GET /captions/:id – asynchronously read caption file
app.get("/captions/:id", async (req, res) => {
  console.log(`[DEBUG] GET /captions/${req.params.id} called.`);
  const captionPath = path.join(captionsDir, `${req.params.id}.txt`);
  try {
    await fsPromises.access(captionPath);
    const data = await fsPromises.readFile(captionPath, "utf8");
    res.send(data.trim());
  } catch (err) {
    res.status(404).send("No caption available");
  }
});

// Helper to find the IPA file for a given reference ID (stored as <refId>.<ext>)
async function findRefImage(refNumber) {
  try {
    const files = await fsPromises.readdir(imagesDir);
    for (const file of files) {
      if (file.startsWith(`${refNumber}.`)) {
        return file;
      }
    }
    return null;
  } catch (err) {
    throw err;
  }
}

// GET /get-image/:refNumber/:type – dynamically serve images.
// • For type "ipa": returns the original IPA file.
// • For types "style", "comp", or "both": checks for a downscaled version in images_compressed,
//   and if not found, processes the original image (from images/<refNumber>-type.jpg),
//   saves the downscaled version, then serves it.
app.get("/get-image/:refNumber/:type", async (req, res) => {
  const refNumber = req.params.refNumber;
  const type = req.params.type; // expected: "ipa", "style", "comp", or "both"
  console.log(`[DEBUG] GET /get-image/${refNumber}/${type} called.`);
  try {
    if (type === "ipa") {
      const ipaFile = await findRefImage(refNumber);
      if (ipaFile) {
        return res.sendFile(path.join(imagesDir, ipaFile));
      } else {
        return res.status(404).json({ error: "IPA image not found" });
      }
    } else if (["style", "comp", "both"].includes(type)) {
      const compressedFileName = `${refNumber}-${type}.jpg`;
      const compressedPath = path.join(imagesCompressedDir, compressedFileName);
      if (fs.existsSync(compressedPath)) {
        return res.sendFile(compressedPath);
      } else {
        // Process the original image (expected at images/<refNumber>-type.png)
        const originalFileName = `${refNumber}-${type}.png`;
        const originalPath = path.join(imagesDir, originalFileName);
        if (!fs.existsSync(originalPath)) {
          return res.status(404).json({ error: "Original image not found" });
        }
        // Downscale by 50%
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

// POST /upload – handle new entry uploads asynchronously.
// Saves IPA image as received and stores originals for style, comp, and both.
// (These originals remain untouched; compression is done on-demand.)
app.post(
  "/upload",
  upload.fields([
    { name: "ipa", maxCount: 1 },
    { name: "style", maxCount: 1 },
    { name: "comp", maxCount: 1 },
    { name: "both", maxCount: 1 }
  ]),
  async (req, res) => {
    console.log(`[DEBUG] POST /upload called. Files: ${Object.keys(req.files).join(", ")}; Body: ${JSON.stringify(req.body)}`);
    try {
      // Determine new reference ID by scanning the images directory
      const files = await fsPromises.readdir(imagesDir);
      let maxId = 0;
      files.forEach(file => {
        const match = file.match(/^(\d+)\./);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxId) maxId = num;
        }
      });
      const newId = maxId + 1;

      // Save IPA image losslessly in its original size
      if (req.files.ipa && req.files.ipa[0]) {
        const ipaFile = req.files.ipa[0];
        if (!ipaFile.mimetype.startsWith("image/")) {
          return res.status(400).json({ error: "Invalid file type for IP-A image." });
        }
        const ext = path.extname(ipaFile.originalname) || ".jpg";
        const ipaFilename = `${newId}${ext}`;
        await fsPromises.writeFile(path.join(imagesDir, ipaFilename), ipaFile.buffer);
      } else {
        return res.status(400).json({ error: "IP-A reference image is required." });
      }

      // Save originals for style, comp, and both (compression happens on demand)
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

      // Save caption to the captions directory
      const captionText = req.body.caption || "";
      await fsPromises.writeFile(path.join(captionsDir, `${newId}.txt`), captionText);

      console.log(`[DEBUG] Upload successful. New entry id: ${newId}`);
      res.json({ message: "Upload successful", id: newId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

// DELETE /delete/:id – asynchronously delete an entry’s files
app.delete("/delete/:id", async (req, res) => {
  console.log(`[DEBUG] DELETE /delete/${req.params.id} called.`);
  const refId = req.params.id;
  try {
    const ipaFileName = await findRefImage(refId);
    if (!ipaFileName) {
      return res.status(404).json({ error: "Entry not found" });
    }
    // Delete IPA file
    await fsPromises.unlink(path.join(imagesDir, ipaFileName));
    console.log(`[DEBUG] Deleted IPA file: ${ipaFileName}`);

    // Delete originals for style, comp, and both (if they exist)
    const originals = [
      `${refId}-style.png`,
      `${refId}-comp.png`,
      `${refId}-both.png`
    ];
    for (const fileName of originals) {
      const filePath = path.join(imagesDir, fileName);
      try {
        await fsPromises.unlink(filePath);
        console.log(`[DEBUG] Deleted original file: ${fileName}`);
      } catch (e) {
        // Ignore if file doesn't exist
      }
    }
    // Delete any compressed images if they exist
    const compressedFiles = [
      `${refId}-style.jpg`,
      `${refId}-comp.jpg`,
      `${refId}-both.jpg`
    ];
    for (const fileName of compressedFiles) {
      const filePath = path.join(imagesCompressedDir, fileName);
      try {
        await fsPromises.unlink(filePath);
        console.log(`[DEBUG] Deleted compressed file: ${fileName}`);
      } catch (e) {
        // Ignore if file doesn't exist
      }
    }
    // Delete caption file if it exists
    const captionPath = path.join(captionsDir, `${refId}.txt`);
    try {
      await fsPromises.unlink(captionPath);
      console.log(`[DEBUG] Deleted caption file for entry ${refId}`);
    } catch (e) {
      // Ignore if caption file doesn't exist
    }

    res.json({ message: "Deletion successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Deletion failed" });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
