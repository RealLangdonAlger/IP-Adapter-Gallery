import { state } from "./state.js";
import { loadGallery, initObserver } from "./gallery.js";

export async function loadBaseImages() {
  try {
    const response = await fetch("/baseImages");
    const baseList = await response.json();
    const baseSelector = document.getElementById("baseSelector");
    baseSelector.innerHTML = "";
    const toolboxThumbnail = document.getElementById("toolboxThumbnail");
    const toolboxBaseImage = document.getElementById("toolboxBaseImage");
    const deleteBaseButton = document.getElementById("deleteBaseButton");
    const uploadButton = document.querySelector(".open-upload-modal");

    if (baseList.length === 0) {
      baseSelector.innerHTML = "";
      toolboxThumbnail.style.display = "none";
      toolboxBaseImage.style.display = "none";
      deleteBaseButton.style.display = "none";
      uploadButton.style.display = "none";
      return;
    } else {
      uploadButton.style.display = "block";
      toolboxThumbnail.style.display = "block";
      toolboxBaseImage.style.display = "block";
      deleteBaseButton.style.display = "block";
    }

    baseList.forEach((base) => {
      const thumb = document.createElement("img");
      thumb.src = base.url;
      thumb.alt = base.baseId;
      thumb.classList.add("base-thumb");
      thumb.dataset.baseId = base.baseId;
      thumb.addEventListener("click", () => {
        state.selectedBase = base.baseId;
        toolboxThumbnail.src = base.url;
        toolboxBaseImage.src = base.url;
        state.offset = 0;
        document.getElementById("gallery").innerHTML = "";
        initObserver();
        loadGallery();
      });
      baseSelector.appendChild(thumb);
    });
    const addNewThumb = document.createElement("div");
    addNewThumb.classList.add("base-thumb", "new-base-thumb");
    addNewThumb.innerHTML = "<span>+</span>";
    addNewThumb.addEventListener("click", () => {
      document.getElementById("baseUploadModal").style.display = "flex";
    });
    baseSelector.appendChild(addNewThumb);
    if (!state.selectedBase) {
      state.selectedBase = baseList[0].baseId;
      toolboxThumbnail.src = baseList[0].url;
      toolboxBaseImage.src = baseList[0].url;
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
