import { state } from "./state.js";
import { loadGallery, initObserver } from "./gallery.js";

export async function loadBaseImages() {
  try {
    const response = await fetch("/baseImages");
    const baseList = await response.json();
    const baseSelector = document.getElementById("baseSelector");
    baseSelector.innerHTML = "";

    for (const base of baseList) {
      // Fetch metadata for each base
      const metadataResponse = await fetch(`/galleries/${base.baseId}/metadata.json`);
      let galleryType = "ipa"; // Default to IPA
      if (metadataResponse.ok) {
        const metadata = await metadataResponse.json();
        galleryType = metadata.galleryType || "ipa";
      }

      // Create thumbnail container
      const thumbContainer = document.createElement("div");
      thumbContainer.classList.add("base-thumb-container");

      // Thumbnail Image
      const thumb = document.createElement("img");
      thumb.src = base.url;
      thumb.alt = base.baseId;
      thumb.classList.add("base-thumb");
      thumb.dataset.baseId = base.baseId;

      // Gallery Type Label
      const typeLabel = document.createElement("div");
      typeLabel.classList.add("gallery-type-label");
      typeLabel.textContent = galleryType === "character" ? "CHR" : "IPA";

      // Append thumbnail and label to container
      thumbContainer.appendChild(thumb);
      thumbContainer.appendChild(typeLabel);
      baseSelector.appendChild(thumbContainer);

      // Add click handler
      thumb.addEventListener("click", () => {
        state.selectedBase = base.baseId;
        document.getElementById("toolboxThumbnail").src = base.url;
        document.getElementById("toolboxBaseImage").src = base.url;
        state.offset = 0;
        document.getElementById("gallery").innerHTML = "";
        initObserver();
        loadGallery();
      });
    }

    // Add "New Base" button inside a container for consistency
    const newBaseContainer = document.createElement("div");
    newBaseContainer.classList.add("base-thumb-container");

    const addNewThumb = document.createElement("div");
    addNewThumb.classList.add("base-thumb", "new-base-thumb");
    addNewThumb.innerHTML = "<span>+</span>";

    addNewThumb.addEventListener("click", () => {
      document.getElementById("baseUploadModal").style.display = "flex";
    });

    newBaseContainer.appendChild(addNewThumb);
    baseSelector.appendChild(newBaseContainer);

    if (!state.selectedBase && baseList.length > 0) {
      state.selectedBase = baseList[0].baseId;
      document.getElementById("toolboxThumbnail").src = baseList[0].url;
      document.getElementById("toolboxBaseImage").src = baseList[0].url;
    }
  } catch (err) {
    console.error("Error loading base images:", err);
  }
}

export function toggleFloatingBaseImage() {
  const container = document.querySelector(".floating-base-image");
  const toggleButton = container.querySelector(".toggle-button");
  container.classList.toggle("expanded");
  toggleButton.textContent = container.classList.contains("expanded") ? "Hide" : "Show";
}

export function initBaseGallery() {
  const deleteBaseButton = document.getElementById("deleteBaseButton");
  deleteBaseButton.addEventListener("click", async function () {
    if (confirm("Are you sure you want to delete this base gallery? This will delete every entry (images and captions) associated with it.")) {
      try {
        const response = await fetch(`/deleteGallery/${state.selectedBase}`, { method: "DELETE" });
        const result = await response.json();
        if (response.ok) {
          alert("Gallery deleted successfully!");
          state.selectedBase = "";
          const toolboxBaseImage = document.getElementById("toolboxBaseImage");
          const toolboxThumbnail = document.getElementById("toolboxThumbnail");
          if (toolboxBaseImage) toolboxBaseImage.src = "";
          if (toolboxThumbnail) toolboxThumbnail.src = "";
          document.getElementById("gallery").innerHTML = "";
          loadBaseImages();
        } else {
          alert("Failed to delete gallery: " + result.error);
        }
      } catch (err) {
        alert("An error occurred while deleting the gallery.");
        console.error("Delete gallery error:", err);
      }
    }
  });

  document.getElementById("baseUploadModal").addEventListener("click", function (e) {
    if (e.target === this) {
      this.style.display = "none";
    }
  });

  document.getElementById("baseUploadForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    // Determine gallery type from toggle
    const galleryTypeToggle = document.getElementById("galleryTypeToggle");
    const galleryType = galleryTypeToggle.checked ? "character" : "ipa";
    formData.set("galleryType", galleryType); // Use set() to overwrite any unintended values

    try {
      const response = await fetch("/uploadBase", { method: "POST", body: formData });
      const result = await response.json();
      if (response.ok) {
        document.getElementById("baseUploadStatus").innerText = "New base created: " + result.baseId;
        form.reset();
        document.getElementById("baseUploadModal").style.display = "none";
        loadBaseImages();
      } else {
        document.getElementById("baseUploadStatus").innerText = "Error: " + result.error;
      }
    } catch (err) {
      document.getElementById("baseUploadStatus").innerText = "An error occurred";
    }
  });

  const toolboxHeader = document.querySelector(".toolbox-header");
  toolboxHeader.addEventListener("click", () => {
    const container = document.querySelector(".toolbox");
    container.classList.toggle("expanded");
  });
}
