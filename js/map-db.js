// map-db.js - UPDATED WITH LEGEND FUNCTIONALITY
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "https://spmnhcxigezzjqabxpmg.supabase.co";
const anonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwbW5oY3hpZ2V6empxYWJ4cG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3OTE2ODcsImV4cCI6MjA3MjM2NzY4N30.cghMxz__fkITUUzFSYaXxLi4kUj8jKDfNUGpQH35kr4";

window.supabase = createClient(supabaseUrl, anonKey);

const BUILDINGS_EDGE_FUNCTION =
  "https://spmnhcxigezzjqabxpmg.supabase.co/functions/v1/buildings";

async function secureLoadBuildings() {
  try {
    const response = await fetch(BUILDINGS_EDGE_FUNCTION, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        action: "load_buildings",
      }),
    });

    if (!response.ok) {
      throw new Error(`Edge function failed: ${response.status}`);
    }

    const result = await response.json();
    if (result.error) {
      throw new Error(result.error);
    }

    return result.data;
  } catch (error) {
    console.error("Secure load buildings failed:", error);
    const { data, error: supabaseError } = await window.supabase
      .from("buildings")
      .select("*");
    if (supabaseError) throw supabaseError;
    return data;
  }
}

// Define light & dark tile layers
const lightLayer = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 22,
    maxNativeZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }
);
const darkLayer = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  {
    subdomains: "abcd",
    maxZoom: 22,
    maxNativeZoom: 20,
    attribution: "&copy; CartoDB",
  }
);

// Check localStorage for darkMode setting
const darkmodeEnable = localStorage.getItem("darkMode") === "true";

// Init map ikut setting dark mode
const puoCenter = [4.589, 101.125];
window.map = L.map("map", {
  center: puoCenter,
  zoom: 17,
  layers: [darkmodeEnable ? darkLayer : lightLayer],
  zoomControl: false,
  minZoom: 5,
});

// Switch mode bila user toggle
const switchMode = document.getElementById("switchMode");
if (switchMode) {
  switchMode.checked = darkmodeEnable;

  switchMode.addEventListener("change", () => {
    const isDark = switchMode.checked;
    document.body.classList.toggle("darkMode", isDark);
    localStorage.setItem("darkMode", isDark);

    if (isDark) {
      map.removeLayer(lightLayer);
      map.addLayer(darkLayer);
    } else {
      map.removeLayer(darkLayer);
      map.addLayer(lightLayer);
    }

    // Update legend dark mode
    applyLegendDarkMode();
  });
}

// Global variables untuk simpan polygons dan legend
window.buildingPolygons = [];
window.legendItems = {};

async function loadBuildings() {
  try {
    const data = await secureLoadBuildings();
    window.buildingPolygons = [];
    window.legendItems = {};

    data.forEach((b) => {
      if (!b.coords) return;
      let parsed =
        typeof b.coords === "string" ? JSON.parse(b.coords) : b.coords;

      if (parsed[0] && parsed[0].lat !== undefined) {
        parsed = parsed.map((p) => [p.lat, p.lng]);
      }

      const buildingColor = b.color || "blue";

      // Create polygon TANPA add ke map dulu
      const poly = L.polygon(parsed, {
        color: buildingColor,
        fillColor: buildingColor,
        fillOpacity: 0.4,
        weight: 2,
        interactive: true, // PASTIKAN INI ADA
      })
        .bindTooltip(b.name)
        .on("click", function (e) {
          // Check jika polygon masih interactive sebelum buka popup
          if (this.options.interactive) {
            onBuildingClick(b, poly);
          }
        });

      const polygonData = {
        polygon: poly,
        color: buildingColor,
        name: b.name,
        category: b.category || "General",
      };

      window.buildingPolygons.push(polygonData);

      // Add to legend items
      if (!window.legendItems[buildingColor]) {
        window.legendItems[buildingColor] = {
          color: buildingColor,
          name: getColorName(buildingColor, b.category),
          polygons: [],
          visible: true, // Track visibility state
        };
      }
      window.legendItems[buildingColor].polygons.push(poly);
    });

    // Add semua buildings ke map (default visible)
    addAllBuildingsToMap();

    // Create legend
    createLegend();

     // Apply saved state selepas legend dibuat
    setTimeout(() => {
      applySavedLegendState();
    }, 100);
    
  } catch (error) {
    console.error("Load buildings failed:", error.message);
  }
}

// Function untuk tambah semua building ke map
function addAllBuildingsToMap() {
  Object.values(window.legendItems).forEach((item) => {
    item.polygons.forEach((polygon) => {
      if (!map.hasLayer(polygon)) {
        map.addLayer(polygon);
      }
      // Set style based on visibility state
      if (item.visible) {
        polygon.setStyle({
          fillOpacity: 0.6,
          weight: 3,
          opacity: 1,
        });
        polygon.options.interactive = true;
      } else {
        polygon.setStyle({
          fillOpacity: 0,
          opacity: 0,
          weight: 0,
        });
        polygon.options.interactive = false;
      }
    });
  });
}

// Helper function untuk update UI legend item
function updateLegendItemUI(legendItem, isVisible) {
  if (isVisible) {
    legendItem.classList.remove("disabled");
  } else {
    legendItem.classList.add("disabled");
  }
}

function createLegend() {
  const legendContainer = document.getElementById("legendItems");
  if (!legendContainer) return;

  legendContainer.innerHTML = "";

  // Load saved state sebelum create legend
  const savedState = loadLegendState();

  Object.values(window.legendItems).forEach((item, index) => {
    const legendItem = document.createElement("div");
    legendItem.className = "legend-item";
    legendItem.setAttribute("data-color", item.color);

    // Gunakan saved state jika ada, kalau tak default visible
    const isVisible = savedState && savedState[item.color] 
      ? savedState[item.color].visible 
      : item.visible;

    // Update item visibility dalam memory
    item.visible = isVisible;

    const colorData = getColorName(item.color, item.category);

    legendItem.innerHTML = `
            <div class="legend-color" style="background-color: ${item.color};"></div>
            <i class="${colorData.icon} legend-icon"></i>
            <span class="legend-label">${colorData.name}</span>
            <input type="checkbox" class="legend-checkbox" ${isVisible ? 'checked' : ''} data-color="${item.color}">
        `;

    // Apply visibility state ke polygons
    toggleBuildingVisibility(item.color, isVisible);

    // Add event listener untuk checkbox
    const checkbox = legendItem.querySelector(".legend-checkbox");
    checkbox.addEventListener("change", function () {
      const isChecked = this.checked;
      toggleBuildingVisibility(item.color, isChecked);
      updateLegendItemUI(legendItem, isChecked);
      window.legendItems[item.color].visible = isChecked;
    });

    // Add event listener untuk klik pada legend item
    legendItem.addEventListener("click", function (e) {
      if (e.target.type === 'checkbox') return;
      
      const currentChecked = !window.legendItems[item.color].visible;
      checkbox.checked = currentChecked;
      toggleBuildingVisibility(item.color, currentChecked);
      updateLegendItemUI(legendItem, currentChecked);
      window.legendItems[item.color].visible = currentChecked;
    });

    // Set initial UI state
    updateLegendItemUI(legendItem, isVisible);

    legendContainer.appendChild(legendItem);
  });

  applyLegendDarkMode();
  console.log('Legend created with saved state');
}

function toggleBuildingVisibility(color, visible) {
  if (window.legendItems[color]) {
    window.legendItems[color].polygons.forEach((polygon) => {
      if (visible) {
        // Show building - add ke map
        if (!map.hasLayer(polygon)) {
          map.addLayer(polygon);
        }
        // Set style normal
        polygon.setStyle({
          fillColor: polygon.options.fillColor,
          fillOpacity: 0.6,
          color: polygon.options.color,
          weight: 3,
          opacity: 1,
        });
      } else {
        // Hide building - remove dari map completely
        if (map.hasLayer(polygon)) {
          map.removeLayer(polygon);
        }
      }
    });
    window.legendItems[color].visible = visible;
    
    // Auto-save state setiap kali visibility berubah
    saveLegendState();
  }
}

// Function untuk save legend state ke localStorage
function saveLegendState() {
  const legendState = {};
  
  Object.entries(window.legendItems).forEach(([color, item]) => {
    legendState[color] = {
      visible: item.visible,
      name: item.name
    };
  });
  
  localStorage.setItem('legendState', JSON.stringify(legendState));
  console.log('Legend state saved:', legendState);
}

// Function untuk load legend state dari localStorage
function loadLegendState() {
  const savedState = localStorage.getItem('legendState');
  if (savedState) {
    try {
      return JSON.parse(savedState);
    } catch (error) {
      console.error('Error loading legend state:', error);
      return null;
    }
  }
  return null;
}

// Function untuk apply saved state pada legend
function applySavedLegendState() {
  const savedState = loadLegendState();
  if (!savedState) return;

  Object.entries(savedState).forEach(([color, state]) => {
    if (window.legendItems[color]) {
      // Update visibility state
      window.legendItems[color].visible = state.visible;
      
      // Apply visibility ke polygons
      toggleBuildingVisibility(color, state.visible);
    }
  });
  
  console.log('Applied saved legend state');
}

function toggleAllBuildings(show) {
  const checkboxes = document.querySelectorAll(".legend-checkbox");
  const legendItems = document.querySelectorAll(".legend-item");

  checkboxes.forEach((checkbox, index) => {
    const color = checkbox.getAttribute("data-color");
    const legendItem = legendItems[index];

    checkbox.checked = show;
    toggleBuildingVisibility(color, show);
    updateLegendItemUI(legendItem, show);
    window.legendItems[color].visible = show;
  });
  
  // Save state selepas toggle all
  saveLegendState();
}
// Function untuk apply dark mode pada legend
function applyLegendDarkMode() {
  const isDarkMode = localStorage.getItem("darkMode") === "true";
  const legend = document.getElementById("mapLegend");

  if (legend) {
    if (isDarkMode) {
      legend.classList.add("dark-mode");
    } else {
      legend.classList.remove("dark-mode");
    }
  }
}

// Helper function untuk dapatkan nama warna yang lebih descriptive
function getColorName(color, category) {
  if (category && category !== "General") {
    return {
      name: category,
      icon: "bi bi-building",
    };
  }

  const colorNames = {
    blue: {
      name: "Academic",
      icon: "bi bi-buildings", // University building icon
    },
    green: {
      name: "Sports",
      icon: "bi bi-tree", // Sports trophy icon
    },
    red: {
      name: "Emergency",
      icon: "bi bi-heart-pulse", // Warning icon
    },
    orange: {
      name: "Living Quarters",
      icon: "bi bi-house", // House icon
    },
    purple: {
      name: "Food/Drink",
      icon: "bi bi-cup-hot", // Food/drink icon
    },
    "#F7DC6F": {
      name: "Misc",
      icon: "bi bi-geo-alt", // Miscellaneous icon
    },
  };

  const colorData = colorNames[color] || {
    name: `${color.charAt(0).toUpperCase() + color.slice(1)} Buildings`,
    icon: "bi bi-building", // Default icon
  };

  return colorData;
}

function toggleLegend() {
  const legend = document.getElementById("mapLegend");
  const closeBtn = legend.querySelector(".legend-close-btn");
  const icon = closeBtn.querySelector("i");

  const isCollapsed = legend.classList.toggle("collapsed");

  if (isCollapsed) {
    icon.className = "bi bi-plus";
    closeBtn.setAttribute("aria-label", "Show legend");
    // Tambah title untuk accessibility
    legend.setAttribute("title", "Click to expand legend");
  } else {
    icon.className = "bi bi-x";
    closeBtn.setAttribute("aria-label", "Close legend");
    legend.removeAttribute("title");
  }
}

// Function untuk expand legend sahaja
function expandLegend() {
  const legend = document.getElementById("mapLegend");
  const closeBtn = legend.querySelector(".legend-close-btn");
  const icon = closeBtn.querySelector("i");

  legend.classList.remove("collapsed");
  icon.className = "bi bi-x";
  closeBtn.setAttribute("aria-label", "Close legend");
  legend.removeAttribute("title");
}

function collapseLegend() {
  const legend = document.getElementById("mapLegend");
  const closeBtn = legend.querySelector(".legend-close-btn");
  const icon = closeBtn.querySelector("i");

  legend.classList.add("collapsed");
  icon.className = "bi bi-plus";
  closeBtn.setAttribute("aria-label", "Show legend");
  legend.setAttribute("title", "Click to expand legend");
}

function initLegendClick() {
  const legend = document.getElementById("mapLegend");

  if (legend) {
    legend.addEventListener("click", function (e) {
      // Jika legend dah collapsed, click anywhere pada legend akan expand
      if (
        this.classList.contains("collapsed") &&
        !e.target.closest(".legend-close-btn")
      ) {
        expandLegend();
      }
    });
  }
}

// Function yang handles apa berlaku bila polygon di-click
function onBuildingClick(building, polygon) {
  // Check jika polygon disabled sebelum proceed
  if (!polygon.options.interactive) {
    return; // Jangan buat apa-apa jika building disabled
  }
  
  // Check jika building ni visible dalam legend
  const buildingColor = polygon.options.fillColor || polygon.options.color;
  const legendItem = window.legendItems[buildingColor];
  
  if (legendItem && !legendItem.visible) {
    return; // Jangan buka popup jika building hidden
  }

  const center = polygon.getBounds().getCenter();

  // Check jika building ada image
  const hasImage = building.image_url && building.image_url.trim() !== "";

  // Image content...
  const imageContent = hasImage
    ? `<div class="building-image-container">
        <img src="${building.image_url}" alt="${building.name}" 
              class="building-image" 
              onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
        <div class="building-placeholder" style="display: none;">
          <i class="bi bi-building display-4 text-muted"></i>
          <p class="small text-muted mt-1 mb-0">Image failed to load</p>
        </div>
      </div>`
    : `<div class="building-placeholder text-center py-4 bg-light rounded">
        <i class="bi bi-building display-4 text-muted"></i>
        <p class="small text-muted mt-1 mb-0">No image available</p>
      </div>`;

  // Bootstrap card popup dengan image
  const popupContent = `
    <div class="building-popup-card card shadow-sm border-0">
      ${imageContent}
      <div class="card-body text-center p-3">
        <h4 class="card-title mb-2 fw-bold text-truncate building-name">
          ${building.name}
        </h4>
        <p class="card-text text-muted mb-3 building-info" style="font-size: 0.9rem; line-height: 1.4;">
          ${building.info || "No description available"}
        </p>
        <button class="btn btn-primary w-100 building-directions-btn" 
          onclick="goToDirections(${center.lat}, ${center.lng})">
          <i class="bi bi-signpost-split me-2"></i>Get Directions
        </button>
      </div>
    </div>
  `;

  polygon.bindPopup(popupContent).openPopup();
}

// Helper for redirect
function goToDirections(lat, lng) {
  window.location.href = `directions.html?lat=${lat}&lng=${lng}`;
}

// Make functions globally available
window.toggleAllBuildings = toggleAllBuildings;
window.toggleLegend = toggleLegend;
window.expandLegend = expandLegend;
window.collapseLegend = collapseLegend;
window.goToDirections = goToDirections;

// Initialize when page loads
document.addEventListener("DOMContentLoaded", function () {
  console.log("Map page initialized");

  // Initialize map functions
  loadBuildings();
  initLegendClick();

  console.log("Map DB initialized");
});

export async function showUsername() {
  try {
    const username = localStorage.getItem("username");
    const usernameElement = document.getElementById("user");

    if (!usernameElement) return;

    // Set username display
    usernameElement.textContent = username || "Guest";
    usernameElement.style.fontSize = "20px";

    // Simple logout button control
    const logoutItem = document.getElementById("logoutItem");
    if (logoutItem) {
      logoutItem.style.display =
        username && username !== "Guest" ? "block" : "none";
    }
  } catch (err) {
    console.error("Error in showUsername:", err);
    const usernameElement = document.getElementById("user");
    if (usernameElement) {
      usernameElement.textContent = "Guest";
    }

    // Hide logout on error
    const logoutItem = document.getElementById("logoutItem");
    if (logoutItem) logoutItem.style.display = "none";
  }
}

window.showUsername = showUsername;
