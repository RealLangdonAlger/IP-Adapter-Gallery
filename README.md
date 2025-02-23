# IP Adapter Gallery

The IP Adapter Gallery is a reference and comparison tool designed for users of the IP Adapter ControlNet. 

It showcases how different [reForge](https://github.com/Panchovix/stable-diffusion-webui-reForge) IP-A Block Weight presets—**Style**, **Composition**, and **Style & Composition** (referred to as **Both**)—affect the generated image. Users can compare the impact of these presets against the original (base) generation images, helping fine-tune and visualize desired results.

Populating the gallery is done manually for now.

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
  - **Base Gallery Creation:** Create a new base gallery by simply uploading a base image. The new gallery is automatically set up and added to the floating base image selector.

- **Interactive Base Selection:**  
  A floating panel displays a row of base image thumbnails (with an integrated “+” button for adding new bases) that lets you switch between galleries at a glance.

## Usage

1. **Viewing Galleries:**  
   On page load, the floating base image panel auto-detects available base images. Click on any base thumbnail to view its gallery. The gallery displays IPA images alongside their corresponding Style, Composition, and Both variants.

   ![image](https://github.com/user-attachments/assets/18b5a08a-61ce-4ad3-b7e5-c445e09ed219)

   The **IPA** image can be dragged directly into WebUI's ControlNet for ease-of-use. Likewise, the **base** image can also be dragged into WebUI's prompt area to read all its parameters.

3. **Uploading New Gallery Entries:**  
   Click the upload button (next to the header) to open the upload modal. Drop in your *IPA*, *Style*, *Composition*, and '*Both*' aka *Style & Composition* images along with a caption. The drop-zones support drag & drop of WebUI image outputs directly into the upload fields for convenience.

   The new entry is added to the currently selected base gallery.

   ![image](https://github.com/user-attachments/assets/739c1383-c047-4c70-ada3-f12f00e7916b)

   The entries refer to these ControlNet presets: ![image](https://github.com/user-attachments/assets/3709cfe8-ecb1-42a6-89f6-511ec3bdd84b)


5. **Creating a New Base Gallery:**  
   In the floating base image panel, click the “+” thumbnail to open the “Create New Base Gallery” modal. Upload a base image to create a new gallery. The new base will automatically appear in the base selector.

   ![image](https://github.com/user-attachments/assets/b29dd317-4112-407f-8c3d-bf3267429a71)


6. **Image Processing:**  
   When an image is requested:
   - IPA images are delivered in their original form to maintain reproducibility. 
   - Other images (Style, Composition, Both) are downscaled by 50% if a compressed version does not already exist.

7. **Deleting Entries:**  
   Each gallery entry includes a delete button. Upon confirmation, the entry is removed immediately from the view.

## Setup
**Requires [node.js](https://nodejs.org/)**

Recommended to just launch the **run.bat** file to install all requirements, start the server and open the page in a browser.

Alternatively:

1. **Clone this repo:**
    ```bash
    git clone https://github.com/RealLangdonAlger/IP-Adapter-Gallery
    cd IP-Adapter-Gallery
    ```

3. **Install Dependencies:**
    ```bash
    npm install express multer sharp
    ```

2. **Run:**
    ```bash
    node server.js
    ```

  Then open your browser to http://localhost:3000.

## Thanks to ChatGPT for the assistance! 🎉

![Thanks, ChatGPT](https://img.shields.io/badge/Thanks%2C%20ChatGPT-%40OpenAI-blue)
