import { state } from "./state.js";
import { showUploadWarning } from "./utils.js";

export function initUpload() {
  // Set up drag-and-drop for upload items.
  document.querySelectorAll(".upload-item").forEach((dropZone) => {
    dropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
    });
    dropZone.addEventListener("drop", async (event) => {
      event.preventDefault();
      let url = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text");
      const input = dropZone.querySelector('input[type="file"]');
      if (url && url.startsWith("http")) {
        try {
          const proxyUrl = `/proxy?url=` + encodeURIComponent(url);
          const response = await fetch(proxyUrl);
          const blob = await response.blob();
          const file = new File([blob], "dropped-image.png", { type: blob.type });
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          input.dispatchEvent(new Event("change"));
        } catch (err) {
          console.error("Failed to load image from dropped URL:", err);
        }
      } else if (event.dataTransfer.files.length > 0) {
        input.files = event.dataTransfer.files;
        input.dispatchEvent(new Event("change"));
      }
    });
  });

  // Handle file input change events for preview and similarity checking.
  document.querySelectorAll(".upload-item input[type='file']").forEach((input) => {
    input.addEventListener("change", function (event) {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
          let preview = input.parentElement.querySelector("img.preview");
          if (!preview) {
            preview = document.createElement("img");
            preview.classList.add("preview");
            input.parentElement.appendChild(preview);
          }
          preview.src = e.target.result;
          preview.style.display = "block";
          const label = input.parentElement.querySelector("label");
          if (label) {
            label.style.display = "none";
          }
        };
        reader.readAsDataURL(file);

        // If this is the IPA dropzone, trigger a similarity check.
        if (input.parentElement.id === "ipa-dropzone" && state.selectedBase) {
          const formData = new FormData();
          formData.append("ipa", file);
          fetch(`/check-similarity/${state.selectedBase}`, {
            method: "POST",
            body: formData,
          })
            .then((response) => response.json())
            .then((data) => {
              if (data.similar) {
                showUploadWarning(`Warning: This image is very similar to an existing entry (distance: ${data.minCombinedDistance.toFixed(2)}).`);
              }
            })
            .catch((err) => {
              console.error("Similarity check error:", err);
            });
        }
      }
    });
  });

  // NEW: Toggle upload fields based on gallery type
  function updateUploadModalFields() {
    const isCharacterGallery = state.galleryType === "character";

    // Toggle visibility
    document.getElementById("ipaUploadFields").style.display = isCharacterGallery ? "none" : "block";
    document.getElementById("characterUploadField").style.display = isCharacterGallery ? "block" : "none";

    // Handle required attributes for IPA fields
    const ipaFields = ["ipa", "style", "comp", "both"];
    ipaFields.forEach((name) => {
      const input = document.querySelector(`input[name="${name}"]`);
      if (input) input.required = !isCharacterGallery;
    });

    // Handle required attribute for character upload field
    const characterInput = document.querySelector('input[name="character"]');
    if (characterInput) characterInput.required = isCharacterGallery;
  }

  updateUploadModalFields();

  // When handling file input change events, only run similarity check in IPA mode.
  document.querySelectorAll(".upload-item input[type='file']").forEach((input) => {
    input.addEventListener("change", function (event) {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
          let preview = input.parentElement.querySelector("img.preview");
          if (!preview) {
            preview = document.createElement("img");
            preview.classList.add("preview");
            input.parentElement.appendChild(preview);
          }
          preview.src = e.target.result;
          preview.style.display = "block";
          const label = input.parentElement.querySelector("label");
          if (label) {
            label.style.display = "none";
          }
        };
        reader.readAsDataURL(file);

        // Only trigger similarity check for IPA dropzone in IPA mode.
        if (input.parentElement.id === "ipa-dropzone" && state.selectedBase && state.galleryType === "ipa") {
          const formData = new FormData();
          formData.append("ipa", file);
          fetch(`/check-similarity/${state.selectedBase}`, {
            method: "POST",
            body: formData,
          })
            .then((response) => response.json())
            .then((data) => {
              if (data.similar) {
                showUploadWarning(`Warning: This image is very similar to an existing entry (distance: ${data.minCombinedDistance.toFixed(2)}).`);
              }
            })
            .catch((err) => {
              console.error("Similarity check error:", err);
            });
        }
      }
    });
  });

  // Upload modal open/close handlers.
  document.querySelector(".open-upload-modal").addEventListener("click", function () {
    updateUploadModalFields(); // Apply correct required fields
    document.getElementById("uploadModal").style.display = "flex";
  });
  document.querySelector(".close-upload-modal").addEventListener("click", function () {
    document.getElementById("uploadModal").style.display = "none";
  });
  document.getElementById("uploadModal").addEventListener("click", function (e) {
    if (e.target === this) {
      this.style.display = "none";
    }
  });

  // Handle gallery entry upload form submission.
  document.getElementById("uploadForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);

    try {
      const response = await fetch(`/upload/${state.selectedBase}`, {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (response.ok) {
        document.getElementById("uploadStatus").innerText = "Upload successful! New entry ID: " + result.id;

        // Reset form and previews
        form.reset();
        document.querySelectorAll(".upload-item").forEach((item) => {
          const label = item.querySelector("label");
          if (label) label.style.display = "block";
          const preview = item.querySelector("img.preview");
          if (preview) {
            preview.src = "";
            preview.style.display = "none";
          }
        });

        state.offset = 0;
        document.getElementById("gallery").innerHTML = "";

        // Reload gallery after upload
        import("./gallery.js").then((module) => {
          module.loadGallery();
        });
      } else {
        document.getElementById("uploadStatus").innerText = "Upload failed: " + result.error;
      }
    } catch (error) {
      document.getElementById("uploadStatus").innerText = "An error occurred during upload.";
    }
  });
}
