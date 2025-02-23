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

    const floatingBaseImage = document.getElementById("floatingBaseImage");
    const floatingBaseTitle = document.getElementById("floatingBaseTitle");
    const deleteBaseButton = document.getElementById("deleteBaseButton");
    const uploadButton = document.querySelector(".open-upload-modal");

    if (baseList.length === 0) {
      // No base images available: show only the "Add New Base" thumbnail.
      const addNewThumb = document.createElement("div");
      addNewThumb.classList.add("base-thumb", "new-base-thumb");
      addNewThumb.innerHTML = "<span>+</span>";
      addNewThumb.addEventListener("click", () => {
        document.getElementById("baseUploadModal").style.display = "flex";
      });
      baseSelector.appendChild(addNewThumb);
      
      selectedBase = "";
      floatingBaseImage.style.display = "none";
      deleteBaseButton.style.display = "none";
      floatingBaseTitle.textContent = "No Base Available";
      // Hide the upload new entry button because no base is available.
      uploadButton.style.display = "none";
      return;
    } else {
      // Bases exist: show the upload button.
      uploadButton.style.display = "block";
      floatingBaseImage.style.display = "block";
      deleteBaseButton.style.display = "block";
    }
    
    // Populate thumbnails for each base image.
    baseList.forEach(base => {
      const thumb = document.createElement("img");
      thumb.src = base.url;
      thumb.alt = base.baseId;
      thumb.classList.add("base-thumb");
      thumb.dataset.baseId = base.baseId;
      thumb.addEventListener("click", () => {
        selectedBase = base.baseId;
        floatingBaseImage.src = base.url;
        floatingBaseTitle.textContent = "Base Generation: " + base.baseId;
        offset = 0;
        document.getElementById("gallery").innerHTML = "";
        initObserver();
        loadGallery();
      });
      baseSelector.appendChild(thumb);
    });
    // Append "Add New Base" thumbnail as the last item.
    const addNewThumb = document.createElement("div");
    addNewThumb.classList.add("base-thumb", "new-base-thumb");
    addNewThumb.innerHTML = "<span>+</span>";
    addNewThumb.addEventListener("click", () => {
      document.getElementById("baseUploadModal").style.display = "flex";
    });
    baseSelector.appendChild(addNewThumb);
    
    // If no base was previously selected, select the first one.
    if (!selectedBase) {
      selectedBase = baseList[0].baseId;
      floatingBaseImage.src = baseList[0].url;
      floatingBaseTitle.textContent = "Base Generation: " + baseList[0].baseId;
    }
  } catch (err) {
    console.error("Error loading base images:", err);
  }
}

// Function to handle the deletion of a base gallery
document.getElementById("deleteBaseButton").addEventListener("click", async function () {
  if (confirm("Are you sure you want to delete this base gallery? This will delete every entry (images and captions) associated with it.")) {
    try {
      // Send DELETE request to server to delete the selected base gallery
      const response = await fetch(`/deleteGallery/${selectedBase}`, { method: "DELETE" });
      const result = await response.json();
      if (response.ok) {
        alert("Gallery deleted successfully!");
        // Reset to the default state if deletion was successful
        selectedBase = "";
        document.getElementById("floatingBaseImage").src = "";
        document.getElementById("floatingBaseTitle").textContent = "No Base Available";
        document.getElementById("gallery").innerHTML = "";
        loadBaseImages();  // Refresh the base image selector
      } else {
        alert("Failed to delete gallery: " + result.error);
      }
    } catch (err) {
      alert("An error occurred while deleting the gallery.");
      console.error("Delete gallery error:", err);
    }
  }
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

// Extend drop-zone handler to support URL drops
document.querySelectorAll('.upload-item').forEach(dropZone => {
  dropZone.addEventListener('dragover', event => {
    event.preventDefault();
  });

  dropZone.addEventListener('drop', async event => {
    event.preventDefault();

    // Try to get a URL from the dropped data
    let url = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text');
    const input = dropZone.querySelector('input[type="file"]');

    if (url && url.startsWith("http")) {
      try {
        // Fetch the image data from the URL
        //const response = await fetch(url);
		const proxyUrl = `/proxy?url=` + encodeURIComponent(url);
		const response = await fetch(proxyUrl);

        const blob = await response.blob();

        // Create a File object from the blob. The name can be generic or parsed from the URL.
        const file = new File([blob], "dropped-image.png", { type: blob.type });

        // Create a new DataTransfer object and add the file
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;

        // Trigger the change event to update the preview
        input.dispatchEvent(new Event('change'));
      } catch (err) {
        console.error("Failed to load image from dropped URL:", err);
      }
    } else if (event.dataTransfer.files.length > 0) {
      // If files were dropped normally, let the normal change event handler process them.
      input.files = event.dataTransfer.files;
      input.dispatchEvent(new Event('change'));
    }
  });
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
  // Reset any previous edit state
  removeEditingCanvas();
  lightbox.style.display = "flex";
  
  // Show edit UI only for IPA images (check if URL contains "/ipa")
  const editUI = document.getElementById("editUI");
  if (src.includes("/ipa")) {
    editUI.style.display = "flex";
  } else {
    editUI.style.display = "none";
  }
}

function closeLightbox() {
  // Prevent closing the lightbox while in edit mode
  if (document.getElementById("editingCanvas")) {
    return;
  }
  document.getElementById("lightbox").style.display = "none";
  
  const editUI = document.getElementById("editUI");
  if (editUI) {
    editUI.style.display = "none";
  }
}

// Function to remove the editing canvas if it exists
function removeEditingCanvas() {
  const existingCanvas = document.getElementById("editingCanvas");
  if (existingCanvas) {
    existingCanvas.remove();
  }
}

// Toggle edit mode: overlay a canvas on top of the image for temporary edits
function toggleEditMode(event) {
  event.stopPropagation(); // Prevent closing the lightbox
  const img = document.getElementById("lightboxImg");
  let canvas = document.getElementById("editingCanvas");
  if (!canvas) {
    const overlayContainer = document.getElementById("overlayContainer");
    if (!overlayContainer) {
      console.error("Overlay container not found.");
      return;
    }
    canvas = document.createElement("canvas");
    canvas.id = "editingCanvas";
    canvas.style.display = "none";
    canvas.style.position = "absolute";
    canvas.style.top = "0px";
    canvas.style.left = "0px";
    overlayContainer.appendChild(canvas);
  }

  if (canvas.style.display === "none" || canvas.style.display === "") {
    // Enter edit mode: show canvas and set up drawing
    canvas.style.display = "block";
    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    canvas.style.top = "0px";
    canvas.style.left = "0px";

    const ctx = canvas.getContext("2d");
    const baseImage = new Image();
    baseImage.src = img.src;
    baseImage.onload = () => {
      ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
    };

    let drawing = false;
    canvas.onmousedown = (e) => { drawing = true; draw(e); };
    canvas.onmousemove = (e) => { if (drawing) draw(e); };
    canvas.onmouseup = () => { drawing = false; };
    canvas.onmouseout = () => { drawing = false; };

    function draw(e) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const brushColor = document.getElementById("brushColor").value;
      const brushSize = document.getElementById("brushSize").value;
      ctx.fillStyle = brushColor;
      ctx.beginPath();
      ctx.arc(x, y, brushSize, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Change the edit button icon to a green checkmark to indicate confirmation is needed
    document.getElementById("editImageButton").innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
        <path d="M9 16.17L4.83 12 3.41 13.41 9 19 21 7 19.59 5.59z" fill="#00aa00"/>
      </svg>
    `;
  } else {
    // Exit edit mode: update image with canvas content and remove canvas
    const dataURL = canvas.toDataURL();
    img.src = dataURL;
    canvas.remove();
    // Revert the edit button icon back to the pencil icon
    document.getElementById("editImageButton").innerHTML = `
      <svg id="editIcon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
      </svg>
    `;
  }
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