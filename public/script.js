function toggleFloatingBaseImage() {
  const container = document.querySelector('.floating-base-image');
  const toggleButton = container.querySelector('.toggle-button');
  container.classList.toggle('expanded');
  // Update button text based on state
  if (container.classList.contains('expanded')) {
    toggleButton.textContent = 'Hide';
  } else {
    toggleButton.textContent = 'Show';
  }
}

// Image preview functionality for upload items
document
  .querySelectorAll('.upload-item input[type="file"]')
  .forEach((input) => {
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
          // Hide the label once an image is loaded
          const label = input.parentElement.querySelector("label");
          if (label) {
            label.style.display = "none";
          }
        };
        reader.readAsDataURL(file);
      }
    });
  });

// Open modal when the upload button is clicked
document
  .querySelector(".open-upload-modal")
  .addEventListener("click", function () {
    document.getElementById("uploadModal").style.display = "flex";
  });

// Close modal when the close button is clicked or clicking outside the modal content
document
  .querySelector(".close-upload-modal")
  .addEventListener("click", function () {
    document.getElementById("uploadModal").style.display = "none";
  });
document.getElementById("uploadModal").addEventListener("click", function (e) {
  if (e.target === this) {
    document.getElementById("uploadModal").style.display = "none";
  }
});

async function fetchCaption(refNumber) {
  const response = await fetch(`/captions/${refNumber}`);
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
    const response = await fetch(`/delete/${refId}`, { method: "DELETE" });
    if (response.ok) {
      // Remove the parent entry element from the DOM.
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

document
  .getElementById("uploadForm")
  .addEventListener("submit", async function (event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);

    try {
      const response = await fetch("/upload", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (response.ok) {
        document.getElementById("uploadStatus").innerText =
          "Upload successful! New entry ID: " + result.id;
        form.reset();
        // Reset preview images and show labels again
        document.querySelectorAll(".upload-item").forEach((item) => {
          const label = item.querySelector("label");
          if (label) label.style.display = "block";
          const preview = item.querySelector("img.preview");
          if (preview) {
            preview.src = "";
            preview.style.display = "none";
          }
        });
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

let offset = 0;
const limit = 40;
let totalReferences = 0;
let loading = false;

// Fetch a batch of gallery entries
async function loadGallery() {
  if (loading) return;
  loading = true;

  const gallery = document.getElementById("gallery");
  try {
    const response = await fetch(`/references?offset=${offset}&limit=${limit}`);
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
		  <img src="/get-image/${refNumber}/ipa" loading="lazy" onclick="openLightbox(this.src)">
		</div>
		<div style="position:relative;">
		  <span class="overlay">Style</span>
		  <img src="/get-image/${refNumber}/style" loading="lazy" onclick="openLightbox(this.src)">
		</div>
		<div style="position:relative;">
		  <span class="overlay">Comp</span>
		  <img src="/get-image/${refNumber}/comp" loading="lazy" onclick="openLightbox(this.src)">
		</div>
		<div style="position:relative;">
		  <span class="overlay">Both</span>
		  <img src="/get-image/${refNumber}/both" loading="lazy" onclick="openLightbox(this.src)">
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

  // If we haven't filled the viewport yet, load more entries immediately.
  if (
    offset < totalReferences &&
    document.documentElement.scrollHeight <= window.innerHeight
  ) {
    loadGallery();
  }

  // If we've loaded all entries, disconnect the observer.
  if (offset >= totalReferences && observer) {
    observer.disconnect();
  }
}

// IntersectionObserver to load more when the sentinel is visible
const sentinel = document.getElementById("scrollSentinel");
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      loadGallery();
    }
  });
});
observer.observe(sentinel);

loadGallery();
