import { state } from "./state.js";
import { openLightbox } from "./lightbox.js";

async function fetchCaption(refNumber) {
  const response = await fetch(`/captions/${state.selectedBase}/${refNumber}`);
  if (!response.ok) return `Reference #${refNumber}`;
  return await response.text();
}

export async function loadGallery() {
  if (state.loading || state.selectedBase === "") return;
  state.loading = true;
  const gallery = document.getElementById("gallery");
  try {
    const response = await fetch(`/references/${state.selectedBase}?offset=${state.offset}&limit=${state.limit}`);
    const data = await response.json();
    if (data.galleryType) {
      state.galleryType = data.galleryType;
    } else {
      state.galleryType = "ipa";
    }

    // Disable "Lookup By Color" for Character Galleries
    if (state.galleryType === "character") {
      filterColorButton.disabled = true;
    } else {
      filterColorButton.disabled = false;
    }

    state.totalReferences = data.total;
    const references = data.references;
    for (const refNumber of references) {
      const caption = await fetchCaption(refNumber);
      const words = caption.split(" ");
      const truncatedCaption = words.slice(0, 4).join(" ") + (words.length > 4 ? "..." : "");
      const entry = document.createElement("div");
      entry.classList.add("entry");
      if (state.galleryType === "character") {
        entry.classList.add("character-entry");
        entry.innerHTML = `
               <button class="delete-button" data-ref="${refNumber}" title="Delete">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path d="M3 6h18v2H3zm2 3h14v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9zm3 2v8h2v-8H8zm4 0v8h2v-8h-2z"/>
                  </svg>
               </button>
               <div class="entry-title" title="${caption}">${truncatedCaption}</div>
               <div>
                 <img src="/get-image/${state.selectedBase}/${refNumber}/character" loading="lazy" class="grid-image">
               </div>
             `;
      } else {
        entry.innerHTML = `
        <button class="delete-button" data-ref="${refNumber}" title="Delete">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M3 6h18v2H3zm2 3h14v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9zm3 2v8h2v-8H8zm4 0v8h2v-8h-2z"/>
          </svg>
        </button>
        <div class="entry-title" title="${caption}">${truncatedCaption}</div>
        <div class="grid">
          <div style="position:relative;">
            <span class="overlay">IPA</span>
            <img src="/get-image/${state.selectedBase}/${refNumber}/ipa" loading="lazy" class="grid-image">
          </div>
          <div style="position:relative;">
            <span class="overlay">Style</span>
            <img src="/get-image/${state.selectedBase}/${refNumber}/style" loading="lazy" class="grid-image">
          </div>
          <div style="position:relative;">
            <span class="overlay">Comp</span>
            <img src="/get-image/${state.selectedBase}/${refNumber}/comp" loading="lazy" class="grid-image">
          </div>
          <div style="position:relative;">
            <span class="overlay">Both</span>
            <img src="/get-image/${state.selectedBase}/${refNumber}/both" loading="lazy" class="grid-image">
          </div>
        </div>
      `;
      }
      gallery.appendChild(entry);
      entry.querySelectorAll("img.grid-image").forEach((img) => {
        img.addEventListener("click", () => openLightbox(img.src));
      });
      const deleteButton = entry.querySelector(".delete-button");
      deleteButton.addEventListener("click", () => {
        deleteEntry(deleteButton, refNumber);
      });

      // Only add similarity tags in IPA mode.
      if (state.galleryType === "ipa") {
        fetch(`/similarity/${state.selectedBase}/${refNumber}`)
          .then((response) => response.json())
          .then((data) => {
            const tagLabel = document.createElement("div");
            tagLabel.className = "similarity-tag";
            const styleShape = data.style.shapeDistance;
            const styleColor = data.style.colorDistance;
            const compShape = data.comp.shapeDistance;
            const compColor = data.comp.colorDistance;
            const styleWeighted = styleShape / 2 + styleColor;
            const compWeighted = compShape + compColor / 2;
            const threshold = 0.1;
            let label;
            if (Math.abs(styleWeighted - compWeighted) < threshold) {
              label = "F";
            } else {
              label = styleWeighted > compWeighted ? "S" : "C";
            }
            const tooltip =
              `Impact on Style: Weighted ${styleWeighted.toFixed(2)} (Shape ${styleShape.toFixed(2)}, Color ${styleColor.toFixed(2)})\n` +
              `Impact on Composition: Weighted ${compWeighted.toFixed(2)} (Shape ${compShape.toFixed(2)}, Color ${compColor.toFixed(2)})\n`;
            tagLabel.innerHTML = `<button class="similarity-button ${label.toLowerCase()}-button" title="${tooltip}">${label}</button>`;
            entry.insertBefore(tagLabel, entry.firstChild);
          })
          .catch((err) => {
            console.error("Failed to fetch similarity scores:", err);
          });
      }
    }
    state.offset += state.limit;
  } catch (error) {
    console.error("Error loading gallery:", error);
  }
  state.loading = false;
  if (state.offset < state.totalReferences && document.documentElement.scrollHeight <= window.innerHeight) {
    loadGallery();
  }
  if (state.offset >= state.totalReferences && observer) {
    observer.disconnect();
  }
}

export async function loadFilteredGallery(filterColor) {
  if (state.loading || state.selectedBase === "") return;
  state.offset = 0; // Reset offset for new filter
  state.loading = true;
  const gallery = document.getElementById("gallery");
  gallery.innerHTML = ""; // Clear current gallery view
  try {
    const response = await fetch(`/filterColor/${state.selectedBase}?color=${encodeURIComponent(filterColor)}&offset=${state.offset}&limit=${state.limit}`);
    const data = await response.json();
    state.totalReferences = data.total;
    const references = data.references;
    for (const refNumber of references) {
      const caption = await fetchCaption(refNumber);
      const words = caption.split(" ");
      const truncatedCaption = words.slice(0, 4).join(" ") + (words.length > 4 ? "..." : "");
      const entry = document.createElement("div");
      entry.classList.add("entry");
      entry.innerHTML = `
        <button class="delete-button" data-ref="${refNumber}" title="Delete">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M3 6h18v2H3zm2 3h14v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9zm3 2v8h2v-8H8zm4 0v8h2v-8h-2z"/>
          </svg>
        </button>
        <div class="entry-title" title="${caption}">${truncatedCaption}</div>
        <div class="grid">
          <div style="position:relative;">
            <span class="overlay">IPA</span>
            <img src="/get-image/${state.selectedBase}/${refNumber}/ipa" loading="lazy" class="grid-image">
          </div>
          <div style="position:relative;">
            <span class="overlay">Style</span>
            <img src="/get-image/${state.selectedBase}/${refNumber}/style" loading="lazy" class="grid-image">
          </div>
          <div style="position:relative;">
            <span class="overlay">Comp</span>
            <img src="/get-image/${state.selectedBase}/${refNumber}/comp" loading="lazy" class="grid-image">
          </div>
          <div style="position:relative;">
            <span class="overlay">Both</span>
            <img src="/get-image/${state.selectedBase}/${refNumber}/both" loading="lazy" class="grid-image">
          </div>
        </div>
      `;
      gallery.appendChild(entry);
      entry.querySelectorAll("img.grid-image").forEach((img) => {
        img.addEventListener("click", () => openLightbox(img.src));
      });
      const deleteButton = entry.querySelector(".delete-button");
      deleteButton.addEventListener("click", () => {
        deleteEntry(deleteButton, refNumber);
      });
      // (Optional) Fetch and display similarity tags as in loadGallery...
      fetch(`/similarity/${state.selectedBase}/${refNumber}`)
        .then((response) => response.json())
        .then((data) => {
          const tagLabel = document.createElement("div");
          tagLabel.className = "similarity-tag";
          const styleShape = data.style.shapeDistance;
          const styleColor = data.style.colorDistance;
          const compShape = data.comp.shapeDistance;
          const compColor = data.comp.colorDistance;
          const styleWeighted = styleShape / 2 + styleColor;
          const compWeighted = compShape + compColor / 2;
          const threshold = 0.1;
          let label;
          if (Math.abs(styleWeighted - compWeighted) < threshold) {
            label = "F";
          } else {
            label = styleWeighted > compWeighted ? "S" : "C";
          }
          const tooltip =
            `Impact on Style: Weighted ${styleWeighted.toFixed(2)} (Shape ${styleShape.toFixed(2)}, Color ${styleColor.toFixed(2)})\n` +
            `Impact on Composition: Weighted ${compWeighted.toFixed(2)} (Shape ${compShape.toFixed(2)}, Color ${compColor.toFixed(2)})\n`;
          tagLabel.innerHTML = `<button class="similarity-button ${label.toLowerCase()}-button" title="${tooltip}">${label}</button>`;
          entry.insertBefore(tagLabel, entry.firstChild);
        })
        .catch((err) => {
          console.error("Failed to fetch similarity scores:", err);
        });
    }
  } catch (error) {
    console.error("Error loading filtered gallery:", error);
  }
  state.loading = false;
}

export let observer;
export function initObserver() {
  if (observer) observer.disconnect();
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

export async function deleteEntry(button, refId) {
  if (!confirm("Are you sure you want to delete this entry?")) {
    return;
  }
  try {
    const response = await fetch(`/delete/${state.selectedBase}/${refId}`, { method: "DELETE" });
    if (response.ok) {
      const entry = button.closest(".entry");
      if (entry) entry.remove();
      alert("Entry deleted successfully.");
    } else {
      const result = await response.json();
      alert("Deletion failed: " + result.error);
    }
  } catch (error) {
    alert("An error occurred during deletion.");
  }
}

// Expose deleteEntry for inline event handlers.
window.deleteEntry = deleteEntry;
