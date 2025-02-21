// Global variable for the selected base gallery
let selectedBase = "";
let offset = 0;
const limit = 40;
let totalReferences = 0;
let loading = false;

// Load base images from the server and populate the baseSelector container
async function loadBaseImages() {
  try {
    const response = await fetch("/baseImages");
    const baseList = await response.json();
    const baseSelector = document.getElementById("baseSelector");
    baseSelector.innerHTML = "";
    if (baseList.length === 0) {
      selectedBase = "";
      document.getElementById("floatingBaseImage").src = "";
      document.getElementById("floatingBaseTitle").textContent = "No Base Available";
      return;
    }
    // When a base thumbnail is clicked, update the selected base and reset infinite scroll
	baseList.forEach(base => {
	  const thumb = document.createElement("img");
	  thumb.src = base.url;
	  thumb.alt = base.baseId;
	  thumb.classList.add("base-thumb");
	  thumb.dataset.baseId = base.baseId;
	  thumb.addEventListener("click", () => {
		// Update selected base
		selectedBase = base.baseId;
		document.getElementById("floatingBaseImage").src = base.url;
		document.getElementById("floatingBaseTitle").textContent = "Base Generation: " + base.baseId;
		// Reset gallery and infinite scroll state
		offset = 0;
		totalReferences = 0;
		document.getElementById("gallery").innerHTML = "";
		initObserver(); // Reinitialize observer for new base
		loadGallery();
	  });
	  baseSelector.appendChild(thumb);
	});
    // Select the first base if none is selected
    if (!selectedBase) {
      selectedBase = baseList[0].baseId;
      document.getElementById("floatingBaseImage").src = baseList[0].url;
      document.getElementById("floatingBaseTitle").textContent = "Base Generation: " + baseList[0].baseId;
    }
  } catch (err) {
    console.error("Error loading base images:", err);
  }
}

// New Base Gallery button inside floating container
document.getElementById("newBaseButton").addEventListener("click", function () {
  document.getElementById("baseUploadModal").style.display = "flex";
});

// Close base upload modal logic
document.getElementById("baseUploadModal").addEventListener("click", function (e) {
  if (e.target === this) {
    document.getElementById("baseUploadModal").style.display = "none";
  }
});

// Handle new base gallery creation form submission
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
      loadBaseImages(); // refresh the base selector
    } else {
      document.getElementById("baseUploadStatus").innerText = "Error: " + result.error;
    }
  } catch (err) {
    document.getElementById("baseUploadStatus").innerText = "An error occurred";
  }
});

// Floating base image toggle
function toggleFloatingBaseImage() {
  const container = document.querySelector(".floating-base-image");
  const toggleButton = container.querySelector(".toggle-button");
  container.classList.toggle("expanded");
  if (container.classList.contains("expanded")) {
    toggleButton.textContent = "Hide";
  } else {
    toggleButton.textContent = "Show";
  }
}

// Image preview for upload items
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
    }
  });
});

// Modal open/close for upload modal
document.querySelector(".open-upload-modal").addEventListener("click", function () {
  document.getElementById("uploadModal").style.display = "flex";
});
document.querySelector(".close-upload-modal").addEventListener("click", function () {
  document.getElementById("uploadModal").style.display = "none";
});
document.getElementById("uploadModal").addEventListener("click", function (e) {
  if (e.target === this) {
    document.getElementById("uploadModal").style.display = "none";
  }
});

async function fetchCaption(refNumber) {
  const response = await fetch(`/captions/${selectedBase}/${refNumber}`);
  if (!response.ok) return `Reference #${refNumber}`;
  return await response.text();
}

function openLightbox(src) {
  const lightbox = document.getElementById("lightbox");
  const img = document.getElementById("lightboxImg");
  img.src = src;
  lightbox.style.display = "flex";
}

function closeLightbox() {
  document.getElementById("lightbox").style.display = "none";
}

async function deleteEntry(button, refId) {
  if (!confirm("Are you sure you want to delete this entry?")) {
    return;
  }
  try {
    const response = await fetch(`/delete/${selectedBase}/${refId}`, { method: "DELETE" });
    if (response.ok) {
      const entry = button.closest(".entry");
      if (entry) {
        entry.remove();
      }
      alert("Entry deleted successfully.");
    } else {
      const result = await response.json();
      alert("Deletion failed: " + result.error);
    }
  } catch (error) {
    alert("An error occurred during deletion.");
  }
}

document.getElementById("uploadForm").addEventListener("submit", async function (event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  try {
    const response = await fetch(`/upload/${selectedBase}`, {
      method: "POST",
      body: formData,
    });
    const result = await response.json();
    if (response.ok) {
      document.getElementById("uploadStatus").innerText =
        "Upload successful! New entry ID: " + result.id;
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
      offset = 0;
      document.getElementById("gallery").innerHTML = "";
      loadGallery();
    } else {
      document.getElementById("uploadStatus").innerText =
        "Upload failed: " + result.error;
    }
  } catch (error) {
    document.getElementById("uploadStatus").innerText =
      "An error occurred during upload.";
  }
});

// Base image preview for the new base gallery modal
document.getElementById("baseImage").addEventListener("change", function (event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      let preview = document.querySelector("#base-dropzone img.preview");
      if (!preview) {
        preview = document.createElement("img");
        preview.classList.add("preview");
        document.getElementById("base-dropzone").appendChild(preview);
      }
      preview.src = e.target.result;
      preview.style.display = "block";
      const label = document.querySelector("#base-dropzone label");
      if (label) {
        label.style.display = "none";
      }
    };
    reader.readAsDataURL(file);
  }
});

async function loadGallery() {
  if (loading || selectedBase === "") return;
  loading = true;
  const gallery = document.getElementById("gallery");
  try {
    const response = await fetch(`/references/${selectedBase}?offset=${offset}&limit=${limit}`);
    const data = await response.json();
    totalReferences = data.total;
    const references = data.references;
    for (const refNumber of references) {
      const caption = await fetchCaption(refNumber);
      const truncatedCaption =
        caption.split(" ").slice(0, 4).join(" ") +
        (caption.split(" ").length > 4 ? "..." : "");
      const entry = document.createElement("div");
      entry.classList.add("entry");
      entry.innerHTML = `
        <button class="delete-button" onclick="deleteEntry(this, '${refNumber}')" title="Delete">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M3 6h18v2H3zm2 3h14v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9zm3 2v8h2v-8H8zm4 0v8h2v-8h-2z"/>
          </svg>
        </button>
        <div class="entry-title" title="${caption}">${truncatedCaption}</div>
        <div class="grid">
          <div style="position:relative;">
            <span class="overlay">IPA</span>
            <img src="/get-image/${selectedBase}/${refNumber}/ipa" loading="lazy" onclick="openLightbox(this.src)">
          </div>
          <div style="position:relative;">
            <span class="overlay">Style</span>
            <img src="/get-image/${selectedBase}/${refNumber}/style" loading="lazy" onclick="openLightbox(this.src)">
          </div>
          <div style="position:relative;">
            <span class="overlay">Comp</span>
            <img src="/get-image/${selectedBase}/${refNumber}/comp" loading="lazy" onclick="openLightbox(this.src)">
          </div>
          <div style="position:relative;">
            <span class="overlay">Both</span>
            <img src="/get-image/${selectedBase}/${refNumber}/both" loading="lazy" onclick="openLightbox(this.src)">
          </div>
        </div>
      `;
      gallery.appendChild(entry);
    }
    offset += limit;
  } catch (error) {
    console.error("Error loading gallery:", error);
  }
  loading = false;
  if (offset < totalReferences && document.documentElement.scrollHeight <= window.innerHeight) {
    loadGallery();
  }
  if (offset >= totalReferences && observer) {
    observer.disconnect();
  }
}

// Global observer variable (will be reinitialized on base change)
let observer;

// Function to initialize the observer
function initObserver() {
  // If an observer exists, disconnect it first
  if (observer) {
    observer.disconnect();
  }
  const sentinel = document.getElementById("scrollSentinel");
  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        loadGallery();
      }
    });
  });
  observer.observe(sentinel);
}

loadBaseImages().then(() => {
  if (selectedBase !== "") {
    loadGallery();
	initObserver();
  }
});