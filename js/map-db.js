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
  rotate:true,
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
      })
        .bindTooltip(b.name)
        .on("click", () => onBuildingClick(b, poly));

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
  } catch (error) {
    console.error("Load buildings failed:", error.message);
  }
}

// Function untuk tambah semua building ke map
function addAllBuildingsToMap() {
  Object.values(window.legendItems).forEach((item) => {
    item.polygons.forEach((polygon) => {
      map.addLayer(polygon);
    });
    item.visible = true;
  });
}

function createLegend() {
  const legendContainer = document.getElementById("legendItems");
  if (!legendContainer) return;

  legendContainer.innerHTML = "";

  Object.values(window.legendItems).forEach((item, index) => {
    const legendItem = document.createElement("div");
    legendItem.className = "legend-item";
    legendItem.setAttribute("data-color", item.color);

    // Dapatkan data warna termasuk icon
    const colorData = getColorName(item.color, item.category);

    legendItem.innerHTML = `
            <div class="legend-color" style="background-color: ${item.color};"></div>
            <i class="${colorData.icon} legend-icon"></i>
            <span class="legend-label">${colorData.name}</span>
            <input type="checkbox" class="legend-checkbox" checked data-color="${item.color}">
        `;

    // Add event listener untuk toggle visibility
    const checkbox = legendItem.querySelector(".legend-checkbox");
    checkbox.addEventListener("change", function () {
      const isChecked = this.checked;
      toggleBuildingVisibility(item.color, isChecked);

      // Update UI state
      if (isChecked) {
        legendItem.classList.remove("disabled");
      } else {
        legendItem.classList.add("disabled");
      }

      // Update visibility state
      window.legendItems[item.color].visible = isChecked;
    });

    legendContainer.appendChild(legendItem);
  });

  // Apply dark mode jika perlu
  applyLegendDarkMode();
}

// Function untuk toggle building visibility berdasarkan warna
function toggleBuildingVisibility(color, visible) {
  if (window.legendItems[color]) {
    window.legendItems[color].polygons.forEach((polygon) => {
      if (visible) {
        map.addLayer(polygon);
        polygon.setStyle({
          fillOpacity: 0.6,
          weight: 3,
          opacity: 1,
        });
      } else {
        map.removeLayer(polygon);
      }
    });
    window.legendItems[color].visible = visible;
  }
}

// Function untuk toggle semua buildings
function toggleAllBuildings(show) {
  const checkboxes = document.querySelectorAll(".legend-checkbox");
  const legendItems = document.querySelectorAll(".legend-item");

  checkboxes.forEach((checkbox, index) => {
    const color = checkbox.getAttribute("data-color");
    const legendItem = legendItems[index];

    checkbox.checked = show;

    if (show) {
      legendItem.classList.remove("disabled");
    } else {
      legendItem.classList.add("disabled");
    }

    toggleBuildingVisibility(color, show);
  });
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
    return category;
  }

  const colorNames = {
    blue: {
      name: "Academic Buildings",
      icon: "bi bi-buildings", // University building icon
    },
    green: {
      name: "Nature/sports",
      icon: "bi bi-tree", // Sports trophy icon
    },
    red: {
      name: "Medical/emergency",
      icon: "bi bi-heart-pulse", // Warning icon
    },
    orange: {
      name: "Living Quarters",
      icon: "bi bi-house", // House icon
    },
    purple: {
      name: "food/drink",
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

// Make functions globally available
window.toggleAllBuildings = toggleAllBuildings;
window.toggleLegend = toggleLegend;
window.expandLegend = expandLegend;
window.collapseLegend = collapseLegend;

loadBuildings();

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
    document.getElementById("user").textContent = "Guest";

    // Hide logout on error
    const logoutItem = document.getElementById("logoutItem");
    if (logoutItem) logoutItem.style.display = "none";
  }
}

document.addEventListener("DOMContentLoaded", function () {
  console.log("Map page initialized");
  showUsername();
  loadBuildings();
  initLegendClick();
});

window.showUsername = showUsername;

