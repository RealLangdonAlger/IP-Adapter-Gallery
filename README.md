# IP Adapter Gallery / Reference

The IP Adapter Gallery is a reference and comparison tool designed for users of the IP Adapter ControlNet.

It showcases how different [reForge](https://github.com/Panchovix/stable-diffusion-webui-reForge) IP-A Block Weight presets—**Style**, **Composition**, and **Style & Composition** (referred to as **Both**)—affect the generated image. Users can compare the impact of these presets against the original (base) generation images, helping fine-tune and visualize desired results.

Populating the gallery is done manually for now.

## What's New

- **Automatic Similarity Detection:**  
  Uploading a new IPA image now triggers an advanced similarity check using both average hash and color fingerprinting. If an image is too similar to an existing entry, a warning alerts you—helping to avoid duplicate uploads.

- **Dynamic Similarity Tags:**  
  Each gallery entry now displays a dynamic tag (Style, Comp, or Flex) based on computed image fingerprints, providing real-time insights into the image’s impact on style versus composition.

- **Drag-and-Drop URL Support:**  
  Enjoy enhanced upload flexibility by simply dragging and dropping image URLs into the upload fields. The system fetches and previews the image automatically.

- **Enhanced Base Gallery Management:**  
  Easily create new base galleries and, when needed, delete an entire base gallery (with all its entries) directly from the Toolbox.

- **Improved Canvas Editing:**  
  The in-browser canvas editing tool now features an enhanced UI with a stylish overlay and live drawing controls, making temporary image tweaks even more intuitive.

- **Color Filtering:**  
  Use the new color filtering feature to find IPA images with a particular color tone. Simply select a color from the integrated color picker in the Toolbox and click "Apply" to update the gallery with entries whose style image fingerprints best match the chosen color.

## Features

- **Multi-Base Galleries:**  
  Organize and compare multiple base images (original generations) alongside their respective IPA outputs.

- **Dynamic Image Processing:**  
  On-demand image compression and resizing:

  - **Style, Composition, and Both images:** Downscaled (compressed) for optimized bandwidth.

- **Infinite Scrolling Gallery:**  
  Gallery entries load dynamically as you scroll, ensuring smooth performance.

- **User-Friendly Upload Interfaces:**

  - **Gallery Entry Upload:** Easily add new IPA reference entries (including the associated Style, Composition, and Both images) to a selected base gallery.
  - **Base Gallery Creation:** Create a new base gallery by simply uploading a base image. The new gallery is automatically set up and added to the Toolbox.

- **Interactive Base Selection & Management:**  
  A Toolbox displays a small thumbnail of the selected base image with a cog icon that expands to reveal additional options, including the base selector, full-sized base image (300px wide for easy drag-and-drop), and deletion controls.

- **Canvas Editing:**  
  Activate a canvas overlay on IPA images for quick in-browser edits. Adjust brush color and size with intuitive controls to tweak images directly within the gallery view. These changes are temporary and perfect for making on-the-fly adjustments.

- **Automatic Similarity & Duplicate Checks:**  
  Prevent duplicate entries with an automatic similarity detection system that compares new uploads against existing images using advanced fingerprinting techniques.

- **Color Filtering:**  
  Filter gallery entries by a selected color. The integrated color picker in the Toolbox lets you choose a target color, and the system will display images whose style fingerprints are closest to that color—all while preserving infinite scroll functionality.

## Usage

1. **Viewing Galleries:**  
   On page load, the Toolbox auto-detects available base images. Click on any base thumbnail to view its gallery. The gallery displays IPA images alongside their corresponding Style, Composition, and Both variants.

2. **Uploading New Gallery Entries:**  
   Click the upload button (next to the header) to open the upload modal. Drop in your _IPA_, _Style_, _Composition_, and _Both_ images along with a caption. The drop zones now support drag & drop of image URLs, making uploads even more convenient.

3. **Creating a New Base Gallery:**  
   In the Toolbox, click the “+” thumbnail to open the “Create New Base Gallery” modal. Upload a base image to create a new gallery. The new base will automatically appear in the base selector.

4. **Filtering by Color:**  
   Within the Toolbox, use the color picker and "Apply" button to filter gallery entries by a chosen color. The gallery will update to display only the images whose style image fingerprints most closely match your selected color, and infinite scrolling will load additional matching entries.

5. **Image Processing:**  
   When an image is requested:

   - IPA images are delivered in their original form to maintain reproducibility.
   - Other images (Style, Composition, Both) are downscaled by 50% if a compressed version does not already exist.

6. **Deleting Entries & Galleries:**  
   Each gallery entry includes a delete button to remove individual entries. Additionally, the Toolbox now features an option to delete an entire base gallery, removing all associated images and captions.

## Setup

**Requires [node.js](https://nodejs.org/)**

1. **Clone this repo:**

   ```bash
   git clone https://github.com/RealLangdonAlger/IP-Adapter-Gallery
   cd IP-Adapter-Gallery
   ```

   Recommended to just launch the **run.bat** file to install all requirements, start the server and open the page in a browser.

   Alternatively:

2. **Install Dependencies:**

   ```bash
   npm install express multer sharp
   ```

3. **Run:**

   ```bash
   node server.js
   ```

   Then open your browser to http://localhost:3000.

## Thanks to ChatGPT for the assistance! 🎉

![Thanks, ChatGPT](https://img.shields.io/badge/Thanks%2C%20ChatGPT-%40OpenAI-blue)
