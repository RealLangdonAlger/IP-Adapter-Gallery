import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// Import route modules
import proxyRouter from "./routes/proxy.js";
import baseGalleryRouter from "./routes/baseGallery.js";
import galleryRouter from "./routes/gallery.js";
import similarityRouter from "./routes/similarity.js";

const app = express();
const PORT = 3000;

// Define __filename and __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from "public"
app.use(express.static("public"));

// Use the extracted routers
app.use("/", proxyRouter);
app.use("/", baseGalleryRouter);
app.use("/", galleryRouter);
app.use("/", similarityRouter);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
