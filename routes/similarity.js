import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";
import { getGalleryDirs, baseImagesDir } from "../utils/galleryUtils.js";
import { computeImageHash, computeColorFingerprint, hammingDistance, weightedColorDistance, getCachedFingerprint, SHAPE_FINGERPRINT } from "../utils/imageProcessing.js";

const router = express.Router();
const fsPromises = fs.promises;

// Define __filename and __dirname.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use memory storage for multer uploads.
const storage = multer.memoryStorage();
const upload = multer({ storage });

// POST /check-similarity/:baseId – Check if an uploaded IPA image is similar to existing ones.
router.post("/check-similarity/:baseId", upload.single("ipa"), async (req, res) => {
  const baseId = req.params.baseId;
  console.log(`[DEBUG] POST /check-similarity/${baseId} called.`);
  try {
    if (!req.file || !req.file.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "Invalid file or no file provided" });
    }
    const downscaledBuffer = await sharp(req.file.buffer).resize(256, 256, { fit: "inside" }).toBuffer();
    const newShapeHash = await computeImageHash(downscaledBuffer);
    const newColorFingerprint = await computeColorFingerprint(downscaledBuffer);
    const { imagesDir } = getGalleryDirs(baseId);
    const files = await fsPromises.readdir(imagesDir);
    let minShapeDistance = Infinity;
    let minColorDistance = Infinity;
    let minCombinedDistance = Infinity;
    const shapeWeight = 0.4;
    const lumWeight = 0.6;
    const maxShape = SHAPE_FINGERPRINT * SHAPE_FINGERPRINT;
    for (const file of files) {
      if (/^\d+\.(png|jpe?g|gif|webm)$/i.test(file)) {
        const cached = await getCachedFingerprint(baseId, file, imagesDir);
        const shapeDistance = hammingDistance(newShapeHash, cached.shape) / maxShape;
        const colorDistance = weightedColorDistance(newColorFingerprint, cached.color, lumWeight);
        const combinedDistance = shapeWeight * shapeDistance + (1 - shapeWeight) * colorDistance;
        if (shapeDistance < minShapeDistance) minShapeDistance = shapeDistance;
        if (colorDistance < minColorDistance) minColorDistance = colorDistance;
        if (combinedDistance < minCombinedDistance) minCombinedDistance = combinedDistance;
      }
    }
    const threshold = 0.1;
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

// GET /similarity/:baseId/:refNumber – compute similarity between base and style/comp images.
router.get("/similarity/:baseId/:refNumber", async (req, res) => {
  const { baseId, refNumber } = req.params;
  console.log(`[DEBUG] GET /similarity/${baseId}/${refNumber} called.`);
  try {
    const baseImagePath = path.join(baseImagesDir, `${baseId}.png`);
    if (!fs.existsSync(baseImagePath)) {
      return res.status(404).json({ error: "Base image not found" });
    }
    const baseBuffer = await fsPromises.readFile(baseImagePath);
    const baseShapeHash = await computeImageHash(baseBuffer);
    const baseColorFingerprint = await computeColorFingerprint(baseBuffer);
    const shapeWeight = 0.4;
    const lumWeight = 0.6;
    const maxShape = SHAPE_FINGERPRINT * SHAPE_FINGERPRINT;
    const { imagesDir } = getGalleryDirs(baseId);
    // For Style image:
    const styleFile = `${refNumber}-style.png`;
    const styleFingerprint = await getCachedFingerprint(baseId, styleFile, imagesDir);
    const styleShapeDistance = hammingDistance(baseShapeHash, styleFingerprint.shape) / maxShape;
    const styleColorDistance = weightedColorDistance(baseColorFingerprint, styleFingerprint.color, lumWeight);
    const styleCombinedDistance = shapeWeight * styleShapeDistance + (1 - shapeWeight) * styleColorDistance;
    // For Comp image:
    const compFile = `${refNumber}-comp.png`;
    const compFingerprint = await getCachedFingerprint(baseId, compFile, imagesDir);
    const compShapeDistance = hammingDistance(baseShapeHash, compFingerprint.shape) / maxShape;
    const compColorDistance = weightedColorDistance(baseColorFingerprint, compFingerprint.color, lumWeight);
    const compCombinedDistance = shapeWeight * compShapeDistance + (1 - shapeWeight) * compColorDistance;
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

export default router;
