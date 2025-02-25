export function openLightbox(src) {
  const lightbox = document.getElementById("lightbox");
  const img = document.getElementById("lightboxImg");
  img.src = src;
  removeEditingCanvas();
  lightbox.style.display = "flex";
  const editUI = document.getElementById("editUI");
  if (src.includes("/ipa") || src.includes("/character")) {
    editUI.style.display = "flex";
  } else {
    editUI.style.display = "none";
  }
}

export function closeLightbox() {
  if (document.getElementById("editingCanvas")) return;
  document.getElementById("lightbox").style.display = "none";
  const editUI = document.getElementById("editUI");
  if (editUI) editUI.style.display = "none";
}

export function removeEditingCanvas() {
  const existingCanvas = document.getElementById("editingCanvas");
  if (existingCanvas) {
    existingCanvas.remove();
  }
}

export function toggleEditMode(event) {
  event.stopPropagation();
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
    canvas.onmousedown = (e) => {
      drawing = true;
      draw(e);
    };
    canvas.onmousemove = (e) => {
      if (drawing) draw(e);
    };
    canvas.onmouseup = () => {
      drawing = false;
    };
    canvas.onmouseout = () => {
      drawing = false;
    };
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
    document.getElementById("editImageButton").innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
          <path d="M9 16.17L4.83 12 3.41 13.41 9 19 21 7 19.59 5.59z" fill="#00aa00"/>
        </svg>
      `;
  } else {
    const dataURL = canvas.toDataURL();
    img.src = dataURL;
    canvas.remove();
    document.getElementById("editImageButton").innerHTML = `
        <svg id="editIcon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
        </svg>
      `;
  }
}

export function initLightbox() {
  document.getElementById("lightbox").addEventListener("click", closeLightbox);
  document.getElementById("editImageButton").addEventListener("click", toggleEditMode);
}
