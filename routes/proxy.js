import express from "express";
import fetch from "node-fetch";

const router = express.Router();

router.get("/proxy", async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).send("Missing URL");
  }
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(500).send("Error fetching the image");
    }
    res.set("Content-Type", response.headers.get("content-type"));
    response.body.pipe(res);
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).send("Server error while fetching image");
  }
});

export default router;
