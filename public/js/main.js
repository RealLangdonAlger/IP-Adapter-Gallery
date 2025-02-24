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
