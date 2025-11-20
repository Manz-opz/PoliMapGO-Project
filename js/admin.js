// admin.js - REWRITTEN FOR EDGE FUNCTIONS
// This file now uses secure Edge Functions instead of direct database access
// All sensitive operations are handled server-side

// === EDGE FUNCTION CONFIGURATION ===
const EDGE_FUNCTION_URLS = {
  buildings: "https://spmnhcxigezzjqabxpmg.supabase.co/functions/v1/buildings",
  levels: "https://spmnhcxigezzjqabxpmg.supabase.co/functions/v1/levels",
  rooms: "https://spmnhcxigezzjqabxpmg.supabase.co/functions/v1/rooms",
  staff: "https://spmnhcxigezzjqabxpmg.supabase.co/functions/v1/staffs",
  documents: "https://spmnhcxigezzjqabxpmg.supabase.co/functions/v1/documents",
  notifications: "https://spmnhcxigezzjqabxpmg.supabase.co/functions/v1/notifications",
};

const anonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwbW5oY3hpZ2V6empxYWJ4cG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3OTE2ODcsImV4cCI6MjA3MjM2NzY4N30.cghMxz__fkITUUzFSYaXxLi4kUj8jKDfNUGpQH35kr4";

// === NOTIFICATION SYSTEM ===
const messageTemplates = {
  newBuilding: {
    title: "New Building Added",
    body: (data) =>
      `A new building "${data.name}" has been added to the campus map.`,
    to: "all",
  },
  updatedBuilding: {
    title: "Building Updated",
    body: (data) =>
      `Building "${data.name}" has been updated with new information.`,
    to: "all",
  },
  deletedBuilding: {
    title: "Building Removed",
    body: (data) =>
      `Building "${data.name}" has been removed from the campus map.`,
    to: "all",
  },
  newLevel: {
    title: "New Floor Level Added",
    body: (data) =>
      `New floor level "${data.floor}" has been added to ${data.buildingName}.`,
    to: "all",
  },
  updatedLevel: {
    title: "Floor Level Updated",
    body: (data) =>
      `Floor level "${data.floor}" in ${data.buildingName} has been updated.`,
    to: "all",
  },
  deletedLevel: {
    title: "Floor Level Removed",
    body: (data) =>
      `Floor level "${data.floor}" has been removed from ${data.buildingName}.`,
    to: "all",
  },
  newRoom: {
    title: "New Room Added",
    body: (data) =>
      `New room "${data.name}" has been added to the ${data.buildingName}.`,
    to: "all",
  },
  updatedRoom: {
    title: "Room Information Updated",
    body: (data) => `Room "${data.name}" information has been updated.`,
    to: "all",
  },
  deletedRoom: {
    title: "Room Removed",
    body: (data) =>
      `Room "${data.name}" has been removed from ${data.buildingName}.`,
    to: "all",
  },
  newStaff: {
    title: "New Staff Member Added",
    body: (data) =>
      `New staff member ${data.name} (${data.role}) has been added.`,
    to: "all",
  },
  updatedStaff: {
    title: "Staff Information Updated",
    body: (data) => `Staff member ${data.name}'s information has been updated.`,
    to: "all",
  },
  deletedStaff: {
    title: "Staff Member Removed",
    body: (data) =>
      `Staff member ${data.name} has been removed from the system.`,
    to: "all",
  },
  newDocument: {
    title: "New Document Uploaded",
    body: (data) =>
      `New document "${data.title}" has been uploaded to ${data.category} category.`,
    to: "all",
  },
  deletedDocument: {
    title: "Document Removed",
    body: (data) =>
      `Document "${data.title}" has been removed from the system.`,
    to: "all",
  },
  systemMaintenance: {
    title: "System Maintenance",
    body: (data) => `System Update: ${data.message}`,
    to: "all",
  },
};

// Function untuk admin create messages
function createAdminMessage(templateKey, data = {}) {
  try {
    const template = messageTemplates[templateKey];
    if (!template) {
      console.error("Template not found:", templateKey);
      return;
    }

    const messages = JSON.parse(localStorage.getItem("messages") || "[]");

    const newMessage = {
      id: Date.now() + Math.random(),
      from: "Admin",
      to: template.to,
      title: template.title,
      body: template.body(data),
      timestamp: new Date().toISOString(),
      read: false,
    };

    messages.push(newMessage);
    localStorage.setItem("messages", JSON.stringify(messages));

    console.log("Admin notification created:", newMessage);
    return newMessage;
  } catch (error) {
    console.error("Failed to create admin message:", error);
  }
}

// === EDGE FUNCTION HELPER ===
async function callEdgeFunction(functionName, action, data = {}) {
  try {
    const functionUrl = EDGE_FUNCTION_URLS[functionName];
    if (!functionUrl) {
      throw new Error(`Unknown Edge Function: ${functionName}`);
    }

    console.log(`Calling ${functionName}.${action}...`, { functionUrl, data });

    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ action, data }),
    });

    console.log(`Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`HTTP Error ${response.status}:`, errorText);
      throw new Error(
        `Edge function failed: ${response.status} - ${errorText}`
      );
    }

    const result = await response.json();
    console.log(`Edge function response:`, result);

    if (result.error) {
      throw new Error(result.error);
    }

    return result;
  } catch (error) {
    console.error(`Edge function ${functionName}.${action} failed:`, error);
    throw error;
  }
}

// Global variables to store data
let buildingData = [];
let levelData = [];
let roomData = [];
let staffData = [];
let currentBuildingId = null;
let currentLevelId = null;
let currentRoomId = null;

// === Map setup ===

// 1. Definisi tile layer dengan maxNativeZoom supaya tak hilang bila zoom
const lightLayer = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 22,        // pengguna boleh zoom sampai tahap ni
    maxNativeZoom: 19,  // data sebenar OSM hanya sampai 19
    attribution: "&copy; OpenStreetMap contributors"
  }
);

// 2. Inisialisasi peta dengan had zoom
// Note: we allow a slightly higher maxZoom and fractional zoom steps so
// the admin can zoom in to ~50-100m. Tile servers may not provide tiles
// beyond their native max (OSM typically up to 19) — those will be upscaled.
const map = L.map("map", {
  center: [4.589, 101.125],
  zoom: 17,
  minZoom: 5,
  // increase maxZoom to a middle-ground value so it's closer than before but
  // not as extreme as 24. Tiles beyond native zoom will be upscaled by the
  // browser but the map view will be closer.
  maxZoom: 22,
  // allow moderate fractional zoom (half steps) for finer control without
  // being too sensitive.
  zoomSnap: 0.5,
  zoomDelta: 0.5,
  zoomAnimation: false, // kurangkan glitch semasa zoom
  fadeAnimation: false
});

lightLayer.addTo(map); // tambah tile layer ke peta

// 3. Group untuk polygon dan bangunan
const drawnItems = new L.FeatureGroup();
const buildingLayer = new L.FeatureGroup();
map.addLayer(drawnItems);
map.addLayer(buildingLayer);

// 4. Setup tool untuk draw polygon
const drawControl = new L.Control.Draw({
  edit: { featureGroup: drawnItems },
  draw: { marker: false, circle: false, circlemarker: false, polyline: false },
});
map.addControl(drawControl);

// 5. Simpan polygon semasa (supaya tak perlu clear semua)
let currentLayer = null;

map.on(L.Draw.Event.CREATED, (e) => {
  // Buang polygon lama kalau ada
  if (currentLayer) {
    drawnItems.removeLayer(currentLayer);
  }

  // Simpan polygon baru
  currentLayer = e.layer;
  drawnItems.addLayer(currentLayer);
});

// 6. Tangkap bila user edit polygon
map.on(L.Draw.Event.EDITED, (e) => {
  e.layers.eachLayer((layer) => {
    currentLayer = layer; // update layer yang baru diubah
  });
});


// === DOM helper ===
const el = (id) => document.getElementById(id);

// === Drawing Controls ===
function enableDrawing() {
  map.removeControl(drawControl);
  map.addControl(drawControl);
}

function disableDrawing() {
  map.removeControl(drawControl);
}

// ---------------------------------------------------
// BUILDINGS
// ---------------------------------------------------

async function loadBuildings() {
  try {
    const result = await callEdgeFunction("buildings", "load_buildings");
    const data = result.data;

    buildingData = data;
    buildingLayer.clearLayers();

    // Populate building dropdown
    el("buildingSelector").innerHTML =
      '<option value="">Select a building to edit... CHOOSE THIS IF YOU WANT TO CREATE A NEW POLYGON</option>';

    data.forEach((b) => {
      // Draw polygon on map
      if (b.coords) {
        const parsed =
          typeof b.coords === "string" ? JSON.parse(b.coords) : b.coords;
        if (Array.isArray(parsed) && parsed.length) {
          const buildingColor = b.color || "blue";

          const poly = L.polygon(parsed, {
            color: buildingColor,
            fillColor: buildingColor,
            fillOpacity: 0.4,
            className: "building-polygon",
          })
            .addTo(buildingLayer)
            .bindTooltip(b.name)
            .on("click", () => {
              loadBuildingIntoForm(b);
              el("buildingSelector").value = b.id;
            });
        }
      }

      // Add to dropdown
      const option = document.createElement("option");
      option.value = b.id;
      option.textContent = b.name;
      el("buildingSelector").appendChild(option);
    });

    // Clear dependent dropdowns and reset forms
    resetAllDependentForms();
  } catch (error) {
    alert("Load buildings failed: " + error.message);
  }
}

function selectBuildingFromList() {
  const buildingId = el("buildingSelector").value;
  currentBuildingId = buildingId;

  if (buildingId) {
    const building = buildingData.find((b) => b.id == buildingId);
    if (building) {
      loadBuildingIntoForm(building);
      loadLevels(buildingId);
    }
  } else {
    resetBuildingForm();
    resetAllDependentForms();
  }

  // Update delete button state
  el("deleteBuildingBtn").disabled = !buildingId;
}


function coordsFromDrawn() {
  let coords = null;
  drawnItems.eachLayer((layer) => {
    if (layer instanceof L.Polygon) {
      coords = layer.getLatLngs()[0].map((p) => [p.lat, p.lng]);
    }
  });
  return coords;
}


async function deleteBuilding() {
  const id = el("buildingId").value;
  if (!id) return alert("Select a building first");

  // TAMBAH: Dapatkan building data sebelum delete
  const building = buildingData.find((b) => b.id == id);
  if (!building) return alert("Building not found");

  if (!confirm("Delete this building and all its levels/rooms/staff?")) return;

  try {
    await callEdgeFunction("buildings", "delete_building", { id });

  // NOTIFICATION: Building deleted - GUNA building.name
    createAdminMessage("deletedBuilding", { name: building.name });

    alert("Building deleted");
    resetBuildingForm();
    resetAllDependentForms();
    await loadBuildings();
  } catch (error) {
    alert("Delete failed: " + error.message);
  }
}

// === PDF DOCUMENT MANAGEMENT ===

// Handle PDF form submission
async function handlePDFUpload(event) {
  if (event) event.preventDefault();

  const title = document.getElementById("pdfTitle").value.trim();
  const fileInput = document.getElementById("pdfFile");
  const category = document.getElementById("pdfCategory").value;
  const file = fileInput.files[0];

  // Validation
  if (!title) {
    alert("Please enter a document title");
    return;
  }

  if (!file) {
    alert("Please select a PDF file");
    return;
  }

  if (file.type !== "application/pdf") {
    alert("Please select a PDF file only");
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    alert("File size must be less than 10MB");
    return;
  }

  try {
    console.log("Starting PDF upload...", { title, category, file: file.name });

    // Convert file to base64 for Edge Function
    const fileBase64 = await fileToBase64(file);

    // Send to Edge Function with base64 data
    const result = await callEdgeFunction("documents", "upload_document", {
      title: title,
      filename: file.name,
      file_data: fileBase64,
      file_size: file.size,
      category: category,
    });

    if (result.error) throw new Error(result.error);

  // NOTIFICATION: New document
    createAdminMessage("newDocument", {
      title: title,
      category: category,
    });

    console.log("Document uploaded successfully:", result);
    alert("PDF uploaded successfully!");

    // Reset form
    document.getElementById("pdfUploadForm").reset();

    // Refresh documents list
    loadPDFDocuments();
  } catch (error) {
    console.error("PDF upload failed:", error);
    alert("Upload failed: " + error.message);
  }
}



// Load and display PDF documents in compact table format
async function loadPDFDocuments() {
  try {
    console.log("Loading PDF documents...");
    const result = await callEdgeFunction("documents", "load_documents");
    const documents = result.data || [];

    console.log("Documents loaded:", documents);
    const pdfTableBody = document.getElementById("pdfTableBody");
    const documentCount = document.getElementById("documentCount");
    const documentsBadge = document.getElementById("documentsBadge");

    // Update counts
    documentCount.textContent = `(${documents.length})`;
    documentsBadge.textContent = documents.length;

    if (documents.length === 0) {
      pdfTableBody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-muted py-2">
            <small>No documents uploaded yet</small>
          </td>
        </tr>
      `;
      return;
    }

    // Generate compact table rows
    let html = "";
    for (const doc of documents) {
      const fileSizeKB = (doc.file_size / 1024).toFixed(0); // Remove decimal for compactness
      const displayTitle = doc.title || doc.filename;
      
      // Very short title for compact view
      const shortTitle = displayTitle.length > 20 
        ? displayTitle.substring(0, 20) + '...' 
        : displayTitle;

      // Compact category badge
      const categoryShort = doc.category.substring(0, 3);
      
      html += `
        <tr class="border-bottom">
          <td class="py-1 px-2">
            <small class="text-truncate" title="${displayTitle}">${shortTitle}</small>
          </td>
          <td class="py-1 px-2 text-center">
            <span class="badge bg-light text-dark fs-6" title="${doc.category}">${categoryShort}</span>
          </td>
          <td class="py-1 px-2 text-center">
            <small class="text-muted">${fileSizeKB}K</small>
          </td>
          <td class="py-1 px-2 text-center">
            <div class="btn-group btn-group-xs">
              <a href="${doc.file_url}" 
                 target="_blank" 
                 class="btn btn-outline-primary btn-xs p-1"
                 title="View">
                <i class="bi bi-eye fs-6"></i>
              </a>
              <button onclick="deletePDFDocument('${doc.id}')" 
                      class="btn btn-outline-danger btn-xs p-1"
                      title="Delete">
                <i class="bi bi-trash fs-6"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }

    pdfTableBody.innerHTML = html;
  } catch (error) {
    console.error("Load documents failed:", error);
    const pdfTableBody = document.getElementById("pdfTableBody");
    pdfTableBody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-danger py-2">
          <small><i class="bi bi-exclamation-triangle"></i> Error</small>
        </td>
      </tr>
    `;
  }
}

// Delete PDF document
async function deletePDFDocument(documentId) {
  if (!confirm("Are you sure you want to delete this document?")) return;

  try {
  // TAMBAH: Dapatkan document info sebelum delete
    const result = await callEdgeFunction("documents", "load_documents");
    const documents = result.data || [];
    const doc = documents.find(d => d.id === documentId);

    console.log("Deleting document:", documentId);

    // Delete via Edge Function
    await callEdgeFunction("documents", "delete_document", { id: documentId });

  // NOTIFICATION: Document deleted
    if (doc) {
      createAdminMessage("deletedDocument", { 
        title: doc.title || doc.filename 
      });
    }
    
    alert("Document deleted successfully");
    loadPDFDocuments();
  } catch (error) {
    console.error("Delete document failed:", error);
    alert("Delete failed: " + error.message);
  }
}

// === INITIALIZATION FOR PDF MANAGEMENT ===
document.addEventListener("DOMContentLoaded", function () {
  const pdfForm = document.getElementById("pdfUploadForm");
  if (pdfForm) {
    pdfForm.addEventListener("submit", handlePDFUpload);
    console.log("PDF form event listener attached");
  }

  // Load documents when page loads
  loadPDFDocuments();
});

// Make functions global
window.handlePDFUpload = handlePDFUpload;
window.deletePDFDocument = deletePDFDocument;
window.loadPDFDocuments = loadPDFDocuments;
window.previewBuildingImage = previewBuildingImage;
window.removeBuildingImage = removeBuildingImage;
window.removeBuildingImageFromServer = removeBuildingImageFromServer;



// ===== BUILDING IMAGE FUNCTIONS =====

// Preview image before upload
function previewBuildingImage(input) {
  const preview = document.getElementById('buildingImagePreview');
  const previewImg = document.getElementById('buildingPreviewImg');
  const currentImageDiv = document.getElementById('currentBuildingImage');
  
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
      previewImg.src = e.target.result;
      preview.style.display = 'block';
      
      // Hide current image when uploading new one
      if (currentImageDiv) {
        currentImageDiv.style.display = 'none';
      }
    };
    
    reader.readAsDataURL(input.files[0]);
  }
}

// Remove uploaded image preview
function removeBuildingImage() {
  const preview = document.getElementById('buildingImagePreview');
  const input = document.getElementById('buildingImage');
  const currentImageDiv = document.getElementById('currentBuildingImage');
  
  preview.style.display = 'none';
  input.value = '';
  
  // Show current image again
  if (currentImageDiv) {
    currentImageDiv.style.display = 'block';
  }
}

// Upload image to server
async function uploadBuildingImage(buildingId, imageFile) {
  try {
    // Convert file to base64
    const imageBase64 = await fileToBase64(imageFile);
    
    const result = await callEdgeFunction("buildings", "upload_building_image", {
      building_id: buildingId,
      image_data: imageBase64,
      filename: imageFile.name
    });

    if (result.error) throw new Error(result.error);
    
    return result.data;
  } catch (error) {
    console.error("Failed to upload building image:", error);
    throw error;
  }
}

// Remove image from server
async function removeBuildingImageFromServer(buildingId) {
  if (!confirm("Are you sure you want to remove this building image?")) return;

  try {
    // First, try to remove from server
    await callEdgeFunction("buildings", "remove_building_image", {
      building_id: buildingId
    });

    // Clear UI immediately after successful server update
    const currentImageDiv = document.getElementById('currentBuildingImage');
    if (currentImageDiv) {
      currentImageDiv.innerHTML = '';
      currentImageDiv.style.display = 'none';
    }

    // Update local data
    const building = buildingData.find(b => b.id == buildingId);
    if (building) {
      building.image_url = null; // Clear image URL in local data
    }

    // Show success message
    alert("Building image removed successfully");

    // Refresh buildings data to ensure everything is in sync
    await loadBuildings();
  } catch (error) {
    console.error("Failed to remove building image:", error);
    alert("Failed to remove building image: " + error.message);
  }
}

// Update the existing loadBuildingIntoForm function to show images
function loadBuildingIntoForm(b) {
  el("buildingId").value = b.id;
  el("buildingName").value = b.name || "";
  el("buildingInfo").value = b.info || "";

  if (b.color) {
    el("buildingColor").value = b.color;
  } else {
    el("buildingColor").value = "blue";
  }

  // Show existing image if available
  const currentImageDiv = document.getElementById('currentBuildingImage');
  if (b.image_url) {
    currentImageDiv.innerHTML = `
      <label class="form-label">Current Image:</label>
      <div>
        <img src="${b.image_url}" alt="${b.name}" class="img-thumbnail" style="max-height: 200px;">
        <button type="button" class="btn btn-sm btn-outline-danger mt-1" onclick="removeBuildingImageFromServer(${b.id})">
          <i class="bi bi-trash"></i> Remove Image
        </button>
      </div>
    `;
    currentImageDiv.style.display = 'block';
  } else {
    currentImageDiv.innerHTML = '';
    currentImageDiv.style.display = 'none';
  }

  // Hide preview when loading existing building
  document.getElementById('buildingImagePreview').style.display = 'none';
  el("buildingImage").value = '';

  drawnItems.clearLayers();

  if (b.coords) {
    const parsed = typeof b.coords === "string" ? JSON.parse(b.coords) : b.coords;
    if (Array.isArray(parsed) && parsed.length) {
      const currentColor = b.color || "red";
      const poly = L.polygon(parsed, {
        color: currentColor,
        fillColor: currentColor,
        fillOpacity: 0.5,
      });
      drawnItems.addLayer(poly);
      map.fitBounds(poly.getBounds());
    }
  }

  currentBuildingId = b.id;
  el("deleteBuildingBtn").disabled = false;
}

// Update the existing saveBuilding function to handle images
async function saveBuilding() {
  const id = el("buildingId").value || null;
  const name = el("buildingName").value.trim();
  const info = el("buildingInfo").value.trim();
  const color = el("buildingColor").value || "blue";
  const imageFile = el("buildingImage").files[0];

  if (!name) return alert("Enter building name");

  // Check if we're editing an existing building
  const buildingSelector = el("buildingSelector");
  const isEditingExisting = buildingSelector.value !== "";

  if (isEditingExisting) {
    const selectedOption = buildingSelector.options[buildingSelector.selectedIndex];
    const currentBuildingName = selectedOption.textContent;

    const confirmOverride = confirm(
      `!!WARNING!! You are about to OVERWRITE the building:\n"${currentBuildingName}"\n\n` +
      `This will permanently replace the existing building data.\n\n` +
      `Are you sure you want to continue?`
    );

    if (!confirmOverride) {
      return;
    }
  }

  const newCoords = coordsFromDrawn();
  let payload = { id, name, info, color }; // DON'T include image_url here
  if (newCoords) payload.coords = newCoords;

  try {
    // First save the building (without image_url)
    const saveResult = await callEdgeFunction("buildings", "save_building", payload);
    const buildingId = saveResult.data.id;

    // Then upload image separately if provided
    if (imageFile) {
      await uploadBuildingImage(buildingId, imageFile);
    }

  // NOTIFICATION: Building saved
    if (id) {
      createAdminMessage("updatedBuilding", { name: name });
    } else {
      createAdminMessage("newBuilding", { name: name });
    }

    alert("Building saved" + (imageFile ? " with image" : ""));
    resetBuildingForm();
    await loadBuildings();
  } catch (error) {
    alert("Save building failed: " + error.message);
  }
}

// Update resetBuildingForm to clear image fields
function resetBuildingForm() {
  el("buildingForm").reset();
  el("buildingId").value = "";
  el("buildingColor").value = "blue";
  
  // Clear image fields
  document.getElementById('buildingImagePreview').style.display = 'none';
  document.getElementById('currentBuildingImage').innerHTML = '';
  document.getElementById('currentBuildingImage').style.display = 'none';
  el("buildingImage").value = '';
  
  drawnItems.clearLayers();
  currentBuildingId = null;
  el("deleteBuildingBtn").disabled = true;
}

// Make sure fileToBase64 function exists (add if not present)
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      // Remove data:application/pdf;base64, prefix
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}

// ---------------------------------------------------
// LEVELS
// ---------------------------------------------------

async function loadLevels(buildingId) {
  if (!buildingId) {
    el("levelSelector").innerHTML =
      '<option value="">Select a level...</option>';
    levelData = [];
    resetLevelForm();
    return;
  }

  try {
    console.log("Loading levels for building:", buildingId);
    const result = await callEdgeFunction("levels", "load_levels", {
      buildingId,
    });
    levelData = result.data || [];

    console.log("Levels loaded:", levelData);

    // Populate level dropdown
    el("levelSelector").innerHTML =
      '<option value="">Select a level...</option>';

    levelData.forEach((lvl) => {
      const option = document.createElement("option");
      option.value = lvl.id;
      option.textContent = lvl.floor;
      el("levelSelector").appendChild(option);
    });

    // Clear dependent dropdowns and reset forms
    resetRoomForm();
    resetStaffForm();
  } catch (error) {
    console.error("Load levels error:", error);
    alert("Load levels failed: " + error.message);
  }
}

function selectLevelFromList() {
  const levelId = el("levelSelector").value;
  currentLevelId = levelId;

  if (levelId) {
    const level = levelData.find((l) => l.id == levelId);
    if (level) {
      loadLevelIntoForm(level);
      loadRooms(levelId);
    }
  } else {
    resetLevelForm();
    resetRoomForm();
    resetStaffForm();
  }

  el("deleteLevelBtn").disabled = !levelId;
}

function resetLevelForm() {
  el("levelForm").reset();
  el("levelId").value = "";
  currentLevelId = null;
  el("deleteLevelBtn").disabled = true;
}

function loadLevelIntoForm(lvl) {
  el("levelId").value = lvl.id;
  el("levelFloor").value = lvl.floor || "";
  currentLevelId = lvl.id;
  el("deleteLevelBtn").disabled = false;
}

async function saveLevel() {
  if (!currentBuildingId) return alert("Select a building first");

  const id = el("levelId").value || null;
  const floor = el("levelFloor").value.trim();
  if (!floor) return alert("Enter floor name/number");

  // Get building name for notification
  const building = buildingData.find((b) => b.id == currentBuildingId);
  const buildingName = building ? building.name : "the building";

  // Check if we're editing an existing level
  const levelSelector = el("levelSelector");
  const isEditingExisting = levelSelector.value !== "";

  if (isEditingExisting) {
    const selectedOption = levelSelector.options[levelSelector.selectedIndex];
    const currentLevelName = selectedOption.textContent;

    const confirmOverride = confirm(
      `!!WARNING!! You are about to OVERWRITE the level:\n"${currentLevelName}"\n\n` +
        `This will permanently replace the existing level data.\n\n` +
        `Are you sure you want to continue?`
    );

    if (!confirmOverride) {
      return;
    }
  }

  try {
    await callEdgeFunction("levels", "save_level", {
      id,
      building_id: currentBuildingId,
      floor,
    });

  // NOTIFICATION: Level saved
    if (id) {
      createAdminMessage("updatedLevel", {
        floor: floor,
        buildingName: buildingName,
      });
    } else {
      createAdminMessage("newLevel", {
        floor: floor,
        buildingName: buildingName,
      });
    }

    alert("Level saved");
    resetLevelForm();
    await loadLevels(currentBuildingId);
  } catch (error) {
    alert("Save level failed: " + error.message);
  }
}

async function deleteLevel() {
  const id = el("levelId").value;
  if (!id) return alert("Select a level first");

  // TAMBAH: Dapatkan level data
  const level = levelData.find((l) => l.id == id);
  if (!level) return alert("Level not found");

  // TAMBAH: Dapatkan building name
  const building = buildingData.find((b) => b.id == currentBuildingId);
  const buildingName = building ? building.name : "the building";

  if (!confirm("Delete this level and its rooms/staff?")) return;

  try {
    await callEdgeFunction("levels", "delete_level", { id });

  // NOTIFICATION: Level deleted - GUNA level.floor & buildingName
    createAdminMessage("deletedLevel", {
      floor: level.floor,
      buildingName: buildingName,
    });

    alert("Level deleted");
    resetLevelForm();
    resetRoomForm();
    resetStaffForm();
    await loadLevels(currentBuildingId);
  } catch (error) {
    alert("Delete level failed: " + error.message);
  }
}

// ---------------------------------------------------
// ROOMS
// ---------------------------------------------------

async function loadRooms(levelId) {
  if (!levelId) {
    el("roomSelector").innerHTML = '<option value="">Select a room...</option>';
    roomData = [];
    resetRoomForm();
    return;
  }

  try {
    console.log("Loading rooms for level:", levelId);
    const result = await callEdgeFunction("rooms", "load_rooms", { levelId });
    roomData = result.data || [];

    console.log("Rooms loaded:", roomData);

    // Populate room dropdown
    el("roomSelector").innerHTML = '<option value="">Select a room...</option>';

    roomData.forEach((r) => {
      const option = document.createElement("option");
      option.value = r.id;
      option.textContent = r.name;
      el("roomSelector").appendChild(option);
    });

    // Clear dependent dropdown and reset form
    resetStaffForm();
  } catch (error) {
    console.error("Load rooms error:", error);
    alert("Load rooms failed: " + error.message);
  }
}

function selectRoomFromList() {
  const roomId = el("roomSelector").value;
  currentRoomId = roomId;

  if (roomId) {
    const room = roomData.find((r) => r.id == roomId);
    if (room) {
      loadRoomIntoForm(room);
      loadStaff(roomId);
    }
  } else {
    resetRoomForm();
    resetStaffForm();
  }

  el("deleteRoomBtn").disabled = !roomId;
}

function resetRoomForm() {
  el("roomForm").reset();
  el("roomId").value = "";
  currentRoomId = null;
  el("deleteRoomBtn").disabled = true;
}

function loadRoomIntoForm(r) {
  el("roomId").value = r.id;
  el("roomName").value = r.name || "";
  el("roomInfo").value = r.info || "";
  currentRoomId = r.id;
  el("deleteRoomBtn").disabled = false;
}

async function saveRoom() {
  if (!currentLevelId) return alert("Select a level first");

  const id = el("roomId").value || null;
  const name = el("roomName").value.trim();
  const info = el("roomInfo").value.trim();
  if (!name) return alert("Enter room name");

  // TAMBAH: Dapatkan building name untuk notification
  const building = buildingData.find((b) => b.id == currentBuildingId);
  const buildingName = building ? building.name : "the building";

  // Check if we're editing an existing room
  const roomSelector = el("roomSelector");
  const isEditingExisting = roomSelector.value !== "";

  if (isEditingExisting) {
    const selectedOption = roomSelector.options[roomSelector.selectedIndex];
    const currentRoomName = selectedOption.textContent;

    const confirmOverride = confirm(
      `!!WARNING!! You are about to OVERWRITE the room:\n"${currentRoomName}"\n\n` +
        `This will permanently replace the existing room data.\n\n` +
        `Are you sure you want to continue?`
    );

    if (!confirmOverride) {
      return;
    }
  }

  try {
    await callEdgeFunction("rooms", "save_room", {
      id,
      level_id: currentLevelId,
      name,
      info,
    });

  // NOTIFICATION: Room saved
    if (id) {
      createAdminMessage("updatedRoom", {
        name: name,
        buildingName: buildingName,
      });
    } else {
      createAdminMessage("newRoom", {
        name: name,
        buildingName: buildingName,
      });
    }

    alert("Room saved");
    resetRoomForm();
    await loadRooms(currentLevelId);
  } catch (error) {
    alert("Save room failed: " + error.message);
  }
}

async function deleteRoom() {
  const id = el("roomId").value;
  if (!id) return alert("Select a room first");

  // TAMBAH: Dapatkan room data
  const room = roomData.find((r) => r.id == id);
  if (!room) return alert("Room not found");

  // TAMBAH: Dapatkan building name
  const building = buildingData.find((b) => b.id == currentBuildingId);
  const buildingName = building ? building.name : "the building";

  if (!confirm("Delete this room and its staff?")) return;

  try {
    await callEdgeFunction("rooms", "delete_room", { id });

  // NOTIFICATION: Room deleted
    createAdminMessage("deletedRoom", {
      name: room.name,
      buildingName: buildingName,
    });

    alert("Room deleted");
    resetRoomForm();
    resetStaffForm();
    await loadRooms(currentLevelId);
  } catch (error) {
    alert("Delete room failed: " + error.message);
  }
}

// ---------------------------------------------------
// STAFF
// ---------------------------------------------------

async function loadStaff(roomId) {
  if (!roomId) {
    el("staffSelector").innerHTML =
      '<option value="">Select staff member...</option>';
    staffData = [];
    resetStaffForm();
    return;
  }

  try {
    console.log("Loading staff for room:", roomId);
    const result = await callEdgeFunction("staff", "load_staff", { roomId });
    staffData = result.data || [];

    console.log("Staff loaded:", staffData);

    // Populate staff dropdown
    el("staffSelector").innerHTML =
      '<option value="">Select staff member...</option>';

    staffData.forEach((s) => {
      const option = document.createElement("option");
      option.value = s.id;
      option.textContent = `${s.name} (${s.role || "No role"})`;
      el("staffSelector").appendChild(option);
    });
  } catch (error) {
    console.error("Load staff error:", error);
    alert("Load staff failed: " + error.message);
  }
}

function selectStaffFromList() {
  const staffId = el("staffSelector").value;

  if (staffId) {
    const staff = staffData.find((s) => s.id == staffId);
    if (staff) {
      loadStaffIntoForm(staff);
    }
  } else {
    resetStaffForm();
  }

  el("deleteStaffBtn").disabled = !staffId;
}

function resetStaffForm() {
  el("staffForm").reset();
  el("staffId").value = "";
  el("deleteStaffBtn").disabled = true;
}

function loadStaffIntoForm(s) {
  el("staffId").value = s.id;
  el("staffName").value = s.name || "";
  el("staffRole").value = s.role || "";
  el("deleteStaffBtn").disabled = false;
}

async function saveStaff() {
  if (!currentRoomId) return alert("Select a room first");

  const id = el("staffId").value || null;
  const name = el("staffName").value.trim();
  const role = el("staffRole").value.trim();
  if (!name) return alert("Enter staff name");

  // Check if we're editing an existing staff
  const staffSelector = el("staffSelector");
  const isEditingExisting = staffSelector.value !== "";

  if (isEditingExisting) {
    const selectedOption = staffSelector.options[staffSelector.selectedIndex];
    const currentStaffName = selectedOption.textContent;

    const confirmOverride = confirm(
      `!!WARNING!! You are about to OVERWRITE the staff member:\n"${currentStaffName}"\n\n` +
        `This will permanently replace the existing staff data.\n\n` +
        `Are you sure you want to continue?`
    );

    if (!confirmOverride) {
      return;
    }
  }

  try {
    await callEdgeFunction("staff", "save_staff", {
      id,
      room_id: currentRoomId,
      name,
      role,
    });

  // NOTIFICATION: Staff saved
    if (id) {
      createAdminMessage("updatedStaff", { name: name, role: role });
    } else {
      createAdminMessage("newStaff", { name: name, role: role });
    }

    alert("Staff saved");
    resetStaffForm();
    await loadStaff(currentRoomId);
  } catch (error) {
    alert("Save staff failed: " + error.message);
  }
}

async function deleteStaff() {
  const id = el("staffId").value;
  if (!id) return alert("Select a staff member first");

  // TAMBAH: Dapatkan staff data
  const staff = staffData.find((s) => s.id == id);
  if (!staff) return alert("Staff not found");

  try {
    await callEdgeFunction("staff", "delete_staff", { id });

  // NOTIFICATION: Staff deleted
    createAdminMessage("deletedStaff", {
      name: staff.name,
    });

    alert("Staff deleted");
    resetStaffForm();
    await loadStaff(currentRoomId);
  } catch (error) {
    alert("Delete staff failed: " + error.message);
  }
}

// Helper function to reset all dependent forms
function resetAllDependentForms() {
  el("levelSelector").innerHTML = '<option value="">Select a level...</option>';
  el("roomSelector").innerHTML = '<option value="">Select a room...</option>';
  el("staffSelector").innerHTML =
    '<option value="">Select staff member...</option>';

  resetLevelForm();
  resetRoomForm();
  resetStaffForm();
}

// ---------------------------------------------------
// EVENT BINDINGS
// ---------------------------------------------------
el("buildingSelector").addEventListener("change", selectBuildingFromList);
el("levelSelector").addEventListener("change", selectLevelFromList);
el("roomSelector").addEventListener("change", selectRoomFromList);
el("staffSelector").addEventListener("change", selectStaffFromList);

// Global function assignments
window.saveBuilding = saveBuilding;
window.deleteBuilding = deleteBuilding;
window.resetBuildingForm = resetBuildingForm;
window.enableDrawing = enableDrawing;
window.disableDrawing = disableDrawing;

window.saveLevel = saveLevel;
window.deleteLevel = deleteLevel;
window.resetLevelForm = resetLevelForm;

window.saveRoom = saveRoom;
window.deleteRoom = deleteRoom;
window.resetRoomForm = resetRoomForm;

window.saveStaff = saveStaff;
window.deleteStaff = deleteStaff;
window.resetStaffForm = resetStaffForm;

// SERVER NOTIFICATION FUNCTIONS
async function sendServerNotification(title, body, type = "general") {
  try {
    const currentUserId = localStorage.getItem('userId');
    
    const result = await callEdgeFunction("notifications", "send_notification", {
      title,
      body,
      type,
      from_user: currentUserId, // Link to admin user
      to: "all"
    });

    if (result.error) throw new Error(result.error);
    
    console.log("Server notification sent:", result);
    return result;
  } catch (error) {
    console.error("Failed to send server notification:", error);
    throw error;
  }
}

async function loadServerNotifications() {
  try {
    const result = await callEdgeFunction("notifications", "get_notifications", {});
    
    if (result.error) throw new Error(result.error);
    
    return result.data || [];
  } catch (error) {
    console.error("Failed to load server notifications:", error);
    return [];
  }
}

// Update your notification functions to use server
async function sendMaintenanceNotification() {
  const message = prompt("Enter maintenance message:");
  if (message) {
    try {
      await sendServerNotification("System Maintenance", message, "maintenance");
      alert("Maintenance notification sent to ALL users!");
      loadRecentNotifications();
    } catch (error) {
      alert("Failed to send notification: " + error.message);
    }
  }
}

async function sendCustomNotification() {
  const title = prompt("Enter notification title:");
  const body = prompt("Enter notification message:");

  if (title && body) {
    try {
      await sendServerNotification(title, body, "announcement");
      alert("Custom notification sent to ALL users!");
      loadRecentNotifications();
    } catch (error) {
      alert("Failed to send notification: " + error.message);
    }
  }
}

async function sendEmergencyNotification() {
  const message = prompt("Enter emergency message:");
  if (message) {
    try {
      await sendServerNotification("EMERGENCY ALERT", message, "emergency");
      alert("Emergency notification sent to ALL users!");
      loadRecentNotifications();
    } catch (error) {
      alert("Failed to send notification: " + error.message);
    }
  }
}

async function loadRecentNotifications() {
  try {
    const notifications = await loadServerNotifications();
    const recent = notifications.slice(-5).reverse();
    const container = document.getElementById("recentNotifications");
    
    if (!container) return;
    
    if (recent.length === 0) {
      container.innerHTML = '<small class="text-muted">No recent notifications</small>';
      return;
    }

    let html = '';
    recent.forEach(notification => {
      const time = new Date(notification.created_at).toLocaleTimeString();
      const typeIcon = getNotificationIcon(notification.type);
      const fromUser = notification.users?.username || 'Admin';
      
      // Count how many users have read this (for admin insight)
      const readCount = notification.read_by_users?.length || 0;
      
      html += `
        <div class="border-bottom pb-2 mb-2">
          <small class="fw-bold">${typeIcon} ${notification.title}</small><br>
          <small class="text-muted">From: ${fromUser}</small><br>
          <small class="text-muted">${notification.body.substring(0, 50)}${notification.body.length > 50 ? '...' : ''}</small><br>
          <small class="text-muted">${time} • Read by ${readCount} users</small>
        </div>
      `;
    });
    
    container.innerHTML = html;
  } catch (error) {
    console.error("Failed to load recent notifications:", error);
    const container = document.getElementById("recentNotifications");
    if (container) {
      container.innerHTML = '<small class="text-danger">Error loading notifications</small>';
    }
  }
}

function getNotificationIcon(type) {
  const icons = {
    emergency: "🚨",
  maintenance: "maintenance", 
    announcement: "📢",
    general: "💬"
  };
  return icons[type] || "💬";
}

// Make functions global
window.sendMaintenanceNotification = sendMaintenanceNotification;
window.sendCustomNotification = sendCustomNotification;
window.sendEmergencyNotification = sendEmergencyNotification;
window.loadRecentNotifications = loadRecentNotifications;
// Load initial data

await loadBuildings();


// Enhanced Alert System for Map with Dark Mode Support
function showCustomAlert(options) {
  return new Promise((resolve) => {
    // Check current dark mode state
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    
    const {
      title,
      message,
      type = 'warning',
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      showCancel = true,
      dangerous = false
    } = options;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'custom-alert-overlay';
    
    // Create alert container with dark mode class if needed
    const alert = document.createElement('div');
    alert.className = `custom-alert ${isDarkMode ? 'dark-mode' : ''}`;
    
    // Icon mapping
    const icons = {
      warning: 'bi-exclamation-triangle',
      danger: 'bi-exclamation-circle',
      success: 'bi-check-circle',
      info: 'bi-info-circle'
    };
    
    alert.innerHTML = `
      <div class="custom-alert-header">
        <div class="custom-alert-icon ${type}">
          <i class="bi ${icons[type]}"></i>
        </div>
        <h3 class="custom-alert-title">${title}</h3>
        ${message ? `<p class="custom-alert-message">${message}</p>` : ''}
      </div>
      <div class="custom-alert-body">
        <div class="custom-alert-actions">
          ${showCancel ? `
            <button class="custom-alert-btn custom-alert-btn-secondary" data-action="cancel">
              ${cancelText}
            </button>
          ` : ''}
          <button class="custom-alert-btn ${dangerous ? 'custom-alert-btn-danger' : 'custom-alert-btn-primary'}" data-action="confirm">
            ${confirmText}
          </button>
        </div>
      </div>
    `;
    
    // Add to DOM
    document.body.appendChild(overlay);
    document.body.appendChild(alert);
    
    // Handle actions
    const handleAction = (action) => {
      document.body.removeChild(overlay);
      document.body.removeChild(alert);
      resolve(action === 'confirm');
    };
    
    // Event listeners
    alert.querySelector('[data-action="confirm"]').addEventListener('click', () => handleAction('confirm'));
    
    if (showCancel) {
      alert.querySelector('[data-action="cancel"]').addEventListener('click', () => handleAction('cancel'));
      overlay.addEventListener('click', () => handleAction('cancel'));
    }
    
    // Escape key handler
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        handleAction('cancel');
        document.removeEventListener('keydown', handleEscape);
      }
    };
    
    document.addEventListener('keydown', handleEscape);
  });
}

// Show toast notification with dark mode support
function showToast(message, type = 'info') {
  const isDarkMode = localStorage.getItem('darkMode') === 'true';
  
  const toast = document.createElement('div');
  toast.className = `custom-toast custom-toast-${type} ${isDarkMode ? 'dark-mode' : ''}`;
  toast.innerHTML = `
    <div class="custom-toast-content">
      <i class="bi ${getToastIcon(type)}"></i>
      <span>${message}</span>
    </div>
  `;
  
  document.body.appendChild(toast);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.animation = 'toastSlideOut 0.3s ease';
      setTimeout(() => {
        if (toast.parentNode) {
          document.body.removeChild(toast);
        }
      }, 300);
    }
  }, 3000);
}

function getToastIcon(type) {
  const icons = {
    success: 'bi-check-circle',
    warning: 'bi-exclamation-triangle',
    danger: 'bi-exclamation-circle',
    info: 'bi-info-circle'
  };
  return icons[type] || 'bi-info-circle';
}

// Enhanced Logout Function with Dark Mode Support
async function logout() {
  const confirmed = await showCustomAlert({
    title: 'Logout',
    message: 'Are you sure you want to logout? You will need to login again to access your account.',
    type: 'warning',
    confirmText: 'Logout',
    cancelText: 'Stay',
    dangerous: true
  });

  if (confirmed) {
    try {
      // Show loading state
      showToast('Logging out...', 'info');
      
      // Clear user data with a small delay for better UX
      setTimeout(() => {
        localStorage.removeItem("userId");
        localStorage.removeItem("username");
        localStorage.removeItem("messages");
        
        // Show success message
        showToast('Logged out successfully', 'success');
        
        // Redirect to login page after a brief delay
        setTimeout(() => {
          window.location.href = "index.html";
        }, 1000);
        
      }, 500);
      
    } catch (error) {
      console.error('Logout error:', error);
      showToast('Error during logout', 'danger');
    }
  }
}

// Initialize dark mode on page load
function initializeDarkMode() {
  const isDarkMode = localStorage.getItem('darkMode') === 'true';
  document.body.classList.toggle('dark-mode', isDarkMode);
}

// ===== GLOBAL FUNCTION DECLARATIONS =====
// Pastikan semua function yang dipanggil dalam HTML adalah global

// Building Functions
window.selectBuildingFromList = selectBuildingFromList;
window.selectLevelFromList = selectLevelFromList;
window.selectRoomFromList = selectRoomFromList;
window.selectStaffFromList = selectStaffFromList;

// Save Functions
window.saveBuilding = saveBuilding;
window.saveLevel = saveLevel;
window.saveRoom = saveRoom;
window.saveStaff = saveStaff;

// Delete Functions
window.deleteBuilding = deleteBuilding;
window.deleteLevel = deleteLevel;
window.deleteRoom = deleteRoom;
window.deleteStaff = deleteStaff;

// Drawing Functions
window.enableDrawing = enableDrawing;
window.disableDrawing = disableDrawing;

// Image Functions
window.previewBuildingImage = previewBuildingImage;
window.removeBuildingImage = removeBuildingImage;
window.removeBuildingImageFromServer = removeBuildingImageFromServer;

// Notification Functions
window.sendMaintenanceNotification = sendMaintenanceNotification;
window.sendCustomNotification = sendCustomNotification;
window.sendEmergencyNotification = sendEmergencyNotification;

// Other Functions
window.resetBuildingForm = resetBuildingForm;
window.resetLevelForm = resetLevelForm;
window.resetRoomForm = resetRoomForm;
window.resetStaffForm = resetStaffForm;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
  initializeDarkMode();
  console.log('Dark mode initialized:', localStorage.getItem('darkMode') === 'true');
});

window.logout = logout;
window.showCustomAlert = showCustomAlert;
window.showToast = showToast;
//end of logout