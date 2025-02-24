import { loadBaseImages, initBaseGallery } from "./baseGallery.js";
import { loadGallery, initObserver } from "./gallery.js";
import { initUpload } from "./upload.js";
import { initLightbox } from "./lightbox.js";
import { state } from "./state.js";

document.addEventListener("DOMContentLoaded", () => {
  initBaseGallery();
  initUpload();
  initLightbox();
  loadBaseImages().then(() => {
    if (state.selectedBase) {
      loadGallery();
      initObserver();
    }
  });
});

document.getElementById("filterColorButton").addEventListener("click", () => {
  const filterColor = document.getElementById("filterColorPicker").value;
  // Dynamically import and call the new filtered gallery loader
  import("./gallery.js").then((module) => {
    module.loadFilteredGallery(filterColor);
  });
});
