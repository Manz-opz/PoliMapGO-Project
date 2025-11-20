// ==================== OPTIMIZED DIRECTIONS SYSTEM ====================
const lightLayer = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 20,
  }
);

const darkLayer = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  {
    attribution: "©OpenStreetMap, ©CartoDB",
    subdomains: "abcd",
    maxZoom: 20,
  }
);

// Check current dark mode state
const isDarkMode = localStorage.getItem("darkMode") === "true";

// ==================== LIVE TRACKING VARIABLES ====================
let liveTracking = false;
let liveTrackingInterval = null;
let bufferDistance = 10; // meters - adjust this value as needed
let currentRoute = null;
let routeSegments = [];
let currentSegmentIndex = 0;


// ==================== IMPROVED MAP INITIALIZATION ====================
const map = L.map("map", { 
  zoomControl: false, 
  minZoom: 5,
  preferCanvas: true
}).setView([4.589, 101.125], 17);

(isDarkMode ? darkLayer : lightLayer).addTo(map);

// Ensure dark mode class on body
if (isDarkMode) {
  document.body.classList.add("dark-mode");
} else {
  document.body.classList.remove("dark-mode");
}

// ==================== GLOBAL VARIABLES ====================
let routingControl, userMarker, destination, gpsPosition;
let gpsWatchId = null;
let gpsTimeoutId = null;
let gpsLoadingPopup = null;
let gpsProgressInterval = null;
let currentRouteProfile = 'driving-car';
let gpsSuppressDialogsUntil = 0; // timestamp to suppress blocking modals (ms)

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', function() {
  // Get destination from URL parameters
  const params = new URLSearchParams(window.location.search);
  if (params.has("lat") && params.has("lng")) {
    const lat = parseFloat(params.get("lat"));
    const lng = parseFloat(params.get("lng"));
    
    if (!isNaN(lat) && !isNaN(lng)) {
      destination = L.latLng(lat, lng);
      console.log("Destination set:", destination);
      
      // Add destination marker immediately
      L.marker(destination, {
        icon: L.divIcon({
          html: '<i class="bi bi-geo-alt-fill" style="color: #dc3545; font-size: 1.5rem;"></i>',
          className: 'destination-marker',
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        })
      }).addTo(map).bindPopup("Destination").openPopup();
      
      // Start directions process
      setTimeout(initializeDirections, 100);
    }
  } else {
    // Improved UX: allow user to pick a destination on this map or go back
    showCustomAlert({
      title: "No Destination",
      message: "No destination coordinates provided. You can pick a destination on the map or go back to the map page.",
      type: "info",
      confirmText: "Pick on Map",
      cancelText: "Go Back",
      showCancel: true
    }).then(confirmed => {
      if (confirmed) {
        showToast('Click anywhere on the map to set your destination', 'info');
        map.once('click', function(e) {
          destination = e.latlng;
          L.marker(destination, {
            icon: L.divIcon({
              html: '<i class="bi bi-geo-alt-fill" style="color: #dc3545; font-size: 1.5rem;"></i>',
              className: 'destination-marker',
              iconSize: [30, 30],
              iconAnchor: [15, 15]
            })
          }).addTo(map).bindPopup('Destination').openPopup();
          // Start the directions flow
          setTimeout(initializeDirections, 150);
        });
      } else {
        goBack();
      }
    });
  }
});

// ==================== CORE FUNCTIONS ====================
function initializeDirections() {
  if (!destination) {
    console.error("No destination specified");
    return;
  }
  startFastGPS();
}

function startFastGPS() {
  if (!navigator.geolocation) {
    showCustomAlert({
      title: "GPS Not Supported",
      message: "Your browser doesn't support GPS. Please use a different browser.",
      type: "warning",
      confirmText: "OK",
      showCancel: false
    });
    return;
  }

  showGPSLoading();

  const options = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 30000
  };

  // Clear any previous watch/timeout
  if (gpsWatchId) {
    try { navigator.geolocation.clearWatch(gpsWatchId); } catch (e) {}
    gpsWatchId = null;
  }
  if (gpsTimeoutId) {
    clearTimeout(gpsTimeoutId);
    gpsTimeoutId = null;
  }

  gpsWatchId = navigator.geolocation.watchPosition(
    onGPSSuccess,
    onGPSError,
    options
  );

  // Auto-timeout after 12 seconds
  gpsTimeoutId = setTimeout(() => {
    if (gpsWatchId && !gpsPosition) {
      try { navigator.geolocation.clearWatch(gpsWatchId); } catch (e) {}
      gpsWatchId = null;
      onGPSTimeout();
    }
    gpsTimeoutId = null;
  }, 12000);
}

function showGPSLoading() {
  // Ensure previous popup/interval cleared
  if (gpsLoadingPopup) {
    try { map.closePopup(gpsLoadingPopup); } catch (e) {}
    gpsLoadingPopup = null;
  }
  if (gpsProgressInterval) {
    clearInterval(gpsProgressInterval);
    gpsProgressInterval = null;
  }

  const popup = L.popup({
    closeButton: true,
    autoClose: false,
    className: "gps-loading-popup",
  })
    .setLatLng(map.getCenter())
    .setContent(`
      <div style="text-align:center; min-width: 200px;">
        <div style="font-size: 2rem; color: #007bff; margin-bottom: 10px;">
          <i class="bi bi-geo-alt-fill"></i>
        </div>
        <h6 style="margin-bottom: 5px;">Getting Your Location</h6>
        <p style="font-size: 0.9rem; color: #666; margin-bottom: 15px;">
          Please allow location access for directions
        </p>
        <div style="background: #e9ecef; height: 6px; border-radius: 3px; overflow: hidden;">
          <div id="gpsProgress" style="background: #007bff; height: 100%; width: 0%; transition: width 0.3s;"></div>
        </div>
        <button class="btn btn-outline-primary btn-sm mt-3 w-100" onclick="useManualLocation()">
          <i class="bi bi-cursor"></i> Set Location Manually
        </button>
      </div>
    `)
    .openOn(map);

  gpsLoadingPopup = popup;

  // Animate progress bar and keep reference
  let progress = 0;
  gpsProgressInterval = setInterval(() => {
    progress += 1;
    const progressBar = document.getElementById('gpsProgress');
    if (progressBar) {
      progressBar.style.width = progress + '%';
    }
    if (progress >= 100) {
      clearInterval(gpsProgressInterval);
      gpsProgressInterval = null;
    }
  }, 120);
}

function hideGPSLoading() {
  try {
    if (gpsLoadingPopup) {
      map.closePopup(gpsLoadingPopup);
      gpsLoadingPopup = null;
    } else {
      map.closePopup();
    }
  } catch (e) {}

  if (gpsProgressInterval) {
    clearInterval(gpsProgressInterval);
    gpsProgressInterval = null;
  }
}

function onGPSSuccess(position) {
  if (gpsWatchId) {
    navigator.geolocation.clearWatch(gpsWatchId);
  }

  gpsPosition = L.latLng(
    position.coords.latitude,
    position.coords.longitude
  );

  hideGPSLoading();
  initializeRouting();
  showToast("Location found! Calculating route...", "success");
  
  // Start live tracking after route is calculated
  startLiveTracking();
}

function onGPSError(error) {
  // Clear any active watch/timeout to avoid duplicate dialogs
  if (gpsWatchId) {
    try { navigator.geolocation.clearWatch(gpsWatchId); } catch (e) {}
    gpsWatchId = null;
  }
  if (gpsTimeoutId) {
    clearTimeout(gpsTimeoutId);
    gpsTimeoutId = null;
  }

  hideGPSLoading();

  let message = "Could not get your location. ";
  
  switch(error.code) {
    case error.PERMISSION_DENIED:
      message = "Location access was denied. Please enable location permissions.";
      break;
    case error.POSITION_UNAVAILABLE:
      message = "Location information is unavailable. Please check your GPS signal.";
      break;
    case error.TIMEOUT:
      message = "Location request timed out. Please try again.";
      break;
  }
  
  // If we've recently switched to manual selection, suppress the blocking modal
  const now = Date.now();
  if (now < gpsSuppressDialogsUntil) {
    showToast(message, 'warning');
    return;
  }

  showCustomAlert({
    title: "Location Access Needed",
    message: message,
    type: "warning",
    confirmText: "Set Manually",
    cancelText: "Cancel",
    showCancel: true
  }).then(confirmed => {
    if (confirmed) {
      useManualLocation();
    }
  });
}

function onGPSTimeout() {
  // Clear any active watch/timeout
  if (gpsWatchId) {
    try { navigator.geolocation.clearWatch(gpsWatchId); } catch (e) {}
    gpsWatchId = null;
  }
  if (gpsTimeoutId) {
    clearTimeout(gpsTimeoutId);
    gpsTimeoutId = null;
  }

  hideGPSLoading();
  
  // If we've recently switched to manual selection, suppress the modal
  const now = Date.now();
  if (now < gpsSuppressDialogsUntil) {
    // Offer a non-blocking toast instead
    showToast("Getting your location is taking too long. You can set your location manually.", "warning");
    return;
  }

  showCustomAlert({
    title: "GPS Timeout",
    message: "Getting your location is taking too long. You can set your location manually.",
    type: "warning",
    confirmText: "Set Manually",
    cancelText: "Try Again",
    showCancel: true
  }).then(confirmed => {
    if (confirmed) {
      useManualLocation();
    } else {
      // Restart GPS after clearing stale watches/timeouts
      startFastGPS();
    }
  });
}

function useManualLocation() {
  // Clear any gps watches/timeouts so manual selection is clean
  if (gpsWatchId) {
    try { navigator.geolocation.clearWatch(gpsWatchId); } catch (e) {}
    gpsWatchId = null;
  }
  if (gpsTimeoutId) {
    clearTimeout(gpsTimeoutId);
    gpsTimeoutId = null;
  }

  hideGPSLoading();
  // Suppress modal dialogs for a short time to avoid alerts after manual set
  gpsSuppressDialogsUntil = Date.now() + 5000; // 5 seconds
  
  showCustomAlert({
    title: "Set Your Location",
    message: "Click anywhere on the map to set your starting location for directions.",
    type: "info",
    confirmText: "OK",
    showCancel: false
  }).then(() => {
    map.once('click', function(e) {
      gpsPosition = e.latlng;
      // extend suppression briefly after the user clicked the map
      gpsSuppressDialogsUntil = Date.now() + 5000;
      initializeRouting();
      showToast("Location set! Calculating route...", "success");
    });
  });
}

function initializeRouting() {
  if (!gpsPosition || !destination) {
    console.error("Missing GPS position or destination");
    return;
  }

  // Clear existing routing
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }

  // Create or update user marker
  if (!userMarker) {
    userMarker = L.marker(gpsPosition, {
      icon: L.divIcon({
        html: '<i class="bi bi-person-fill" style="color: #007bff; font-size: 1.5rem;"></i>',
        className: 'user-marker',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      })
    }).addTo(map).bindPopup("You are here").openPopup();
  } else {
    userMarker.setLatLng(gpsPosition);
  }

  // Fit map to show both points
  const bounds = L.latLngBounds([gpsPosition, destination]);
  map.fitBounds(bounds, { 
    padding: [50, 50],
    maxZoom: 18
  });

  // Show route type selector
  showRouteTypeSelector();
}

function showRouteTypeSelector() {
  // Remove existing selector if any
  const existingSelector = document.querySelector('.route-type-selector');
  if (existingSelector) {
    existingSelector.remove();
  }

  // Create route type selector
  const selectorControl = L.control({ position: 'topright' });
  
  selectorControl.onAdd = function(map) {
    const div = L.DomUtil.create('div', 'route-type-selector');
    div.innerHTML = `
      <div class="route-type-card">
        <!-- Header with toggle button -->
        <div class="route-card-header" id="routeCardHeader">
          <h6 class="mb-0">Route Options</h6>
          <button class="btn btn-sm btn-outline-secondary route-toggle-btn" id="routeToggleBtn">
            <i class="bi bi-chevron-up" id="routeToggleIcon"></i>
          </button>
        </div>
        
        <!-- Collapsible content -->
        <div class="route-card-body" id="routeCardBody">
          <div class="route-options mt-2">
            <button class="btn btn-primary route-option active" data-type="driving-car">
              <i class="bi bi-car-front"></i>
              <span>By Vehicle</span>
              <small>Follows roads</small>
            </button>
            <button class="btn btn-outline-primary route-option" data-type="foot-walking">
              <i class="bi bi-person-walking"></i>
              <span>Walking</span>
              <small>Shortest path</small>
            </button>
          </div>
          
          <!-- Buffer Control -->
          <div class="buffer-control mt-3">
            <label class="form-label small mb-2">Live Tracking Buffer: <span id="bufferValue">${bufferDistance}</span>m</label>
            <input type="range" class="form-range" id="bufferRange" min="10" max="130" value="${bufferDistance}" step="10">
            <div class="form-text small">Route recalculates if you deviate beyond this distance</div>
          </div>
          
          <div class="route-info mt-2" id="routeInfo" style="display: none;">
            <div class="route-stats">
              <span id="routeDistance">-</span> • <span id="routeTime">-</span>
            </div>
          </div>
        </div>
      </div>
    `;
    return div;
  };
  
  selectorControl.addTo(map);

  // Add event listeners
  setTimeout(() => {
    // Buffer control
    const bufferRange = document.getElementById('bufferRange');
    const bufferValue = document.getElementById('bufferValue');
    
    if (bufferRange) {
      bufferRange.addEventListener('input', function() {
        bufferDistance = parseInt(this.value);
        bufferValue.textContent = bufferDistance;
      });
    }

    // Toggle button functionality
    const toggleBtn = document.getElementById('routeToggleBtn');
    const toggleIcon = document.getElementById('routeToggleIcon');
    const cardBody = document.getElementById('routeCardBody');
    const cardHeader = document.getElementById('routeCardHeader');
    
    if (cardHeader && cardBody) {
        // Click on header OR toggle button will work
        const toggleHandler = function() {
            const isCollapsed = cardBody.style.display === 'none';
            
            if (isCollapsed) {
                // Expand
                cardBody.style.display = 'block';
                toggleIcon.className = 'bi bi-chevron-up';
                cardHeader.classList.remove('collapsed');
            } else {
                // Collapse
                cardBody.style.display = 'none';
                toggleIcon.className = 'bi bi-chevron-down';
                cardHeader.classList.add('collapsed');
            }
        };
        
        // Attach to both header and button
        cardHeader.addEventListener('click', toggleHandler);
        
        // Also keep button clickable (in case user specifically clicks the icon)
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function(e) {
                e.stopPropagation(); // Prevent double trigger from header
                toggleHandler();
            });
        }
      
      // Auto-collapse on mobile after route selection
      if (window.innerWidth <= 768) {
        setTimeout(() => {
          if (toggleBtn && cardBody.style.display !== 'none') {
            toggleBtn.click(); // Collapse it
          }
        }, 3000); // Collapse after 3 seconds on mobile
      }
    }

    // Route buttons
    const routeButtons = document.querySelectorAll('.route-option');
    routeButtons.forEach(btn => {
      btn.addEventListener('click', function() {
        routeButtons.forEach(b => {
          b.classList.remove('active', 'btn-primary');
          b.classList.add('btn-outline-primary');
        });
        
        this.classList.add('active', 'btn-primary');
        this.classList.remove('btn-outline-primary');
        
        const routeType = this.dataset.type;
        currentRouteProfile = routeType;
        calculateRoute(routeType);
        
        // Auto-collapse after selection on mobile
        if (window.innerWidth <= 768) {
          const toggleBtn = document.getElementById('routeToggleBtn');
          const cardBody = document.getElementById('routeCardBody');
          if (toggleBtn && cardBody && cardBody.style.display !== 'none') {
            setTimeout(() => toggleBtn.click(), 1000);
          }
        }
      });
    });

    // Auto-select driving by default
    calculateRoute('driving-car');
  }, 100);
}


function calculateRoute(profile = 'driving-car') {
  // Set buffer based on route type
  if (profile === 'foot-walking') {
    bufferDistance = 20; // Smaller buffer for walking
  } else {
    bufferDistance = 40; // Larger buffer for driving
  }
  
  // Update UI if elements exist
  const bufferRange = document.getElementById('bufferRange');
  const bufferValue = document.getElementById('bufferValue');
  if (bufferRange && bufferValue) {
    bufferRange.value = bufferDistance;
    bufferValue.textContent = bufferDistance;
  }
  
  if (!gpsPosition || !destination) {
    showToast("Please set your location first", "warning");
    return;
  }

  showToast(`Calculating ${profile === 'driving-car' ? 'vehicle' : 'walking'} route...`, 'info');
  initializeRoutingControl(profile);
}

function initializeRoutingControl(profile = 'driving-car') {
  // Clear existing routing
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }

  const routeColor = profile === 'driving-car' ? '#007bff' : '#28a745';
  const routeWeight = profile === 'driving-car' ? 6 : 4;

  // Create custom router with enhanced error handling
  const customRouter = {
    route: function(waypoints, callback, context, options) {
      const coordinates = waypoints.map(wp => [wp.latLng.lng, wp.latLng.lat]);
      
      console.log(`Routing with profile: ${profile}, coordinates:`, coordinates);
      
      // Show loading state
      showToast(`Calculating ${profile === 'driving-car' ? 'vehicle' : 'walking'} route...`, 'info');
      
      fetch('https://spmnhcxigezzjqabxpmg.supabase.co/functions/v1/routing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coordinates: coordinates,
          instructions: true,
          instructions_format: 'text',
          preference: 'recommended',
          profile: profile
        })
      })
      .then(response => {
        if (!response.ok) {
          // Handle specific HTTP errors
          if (response.status === 400) {
            throw new Error('Invalid route parameters. Please check your locations.');
          } else if (response.status === 429) {
            throw new Error('Too many routing requests. Please try again in a moment.');
          } else if (response.status >= 500) {
            throw new Error('Routing service is temporarily unavailable.');
          } else {
            throw new Error(`Routing failed (${response.status})`);
          }
        }
        return response.json();
      })
      .then(data => {
        if (data.error) {
          throw new Error(data.error);
        }
        if (data.features && data.features.length > 0) {
          const route = data.features[0];
          const convertedRoute = convertORSRouteToLRM(route, waypoints);
          callback.call(context, null, [convertedRoute]);
          updateRouteInfo(route, profile);
          
          // Store route for live tracking
          currentRoute = convertedRoute;
        } else {
          throw new Error('No route found between these locations.');
        }
      })
      .catch(error => {
        console.error('Routing error:', error);
        
        // Show specific error message
        let errorMessage = "Routing service unavailable. ";
        if (error.message.includes('Invalid route') || error.message.includes('No route found')) {
          errorMessage = "No route found between these locations. Please try different start/end points.";
        } else if (error.message.includes('Too many requests')) {
          errorMessage = "Too many routing requests. Please wait a moment before trying again.";
        }
        
        showToast(errorMessage, "warning");
        
        // Fallback to OSRM
        console.log('Falling back to OSRM...');
        fallbackToOSRM(waypoints, callback, context, profile);
      });
    }
  };

  // Create routing control with enhanced options
  routingControl = L.Routing.control({
    waypoints: [gpsPosition, destination],
    routeWhileDragging: false,
    showAlternatives: false,
    fitSelectedRoutes: false,
    show: true,
    collapsible: true,
    addWaypoints: false,
    draggableWaypoints: false,
    createMarker: function() { return null; },
    lineOptions: {
      styles: [{
        color: routeColor, 
        opacity: 0.8, 
        weight: routeWeight,
        dashArray: profile === 'foot-walking' ? '5, 10' : undefined
      }],
      extendToWaypoints: true,
      missingRouteTolerance: profile === 'foot-walking' ? 50 : 10
    },
    router: customRouter,
    formatter: new L.Routing.Formatter({
      language: 'en',
      units: 'metric'
    })
  }).addTo(map);

  // Enhanced event listeners
  routingControl.on('routesfound', function(e) {
    const route = e.routes[0];
    currentRoute = route;
    
    const distance = (route.summary.totalDistance / 1000).toFixed(1);
    const time = formatDuration(route.summary.totalTime, profile);
    
    console.log(`Route found: ${distance} km, ${time}`);
    
    // Update route info in the selector
    updateRouteInfo(route, profile);
    
    showToast(`${profile === 'driving-car' ? 'Vehicle' : 'Walking'} route calculated!`, "success");
    
    // Fit bounds to route with optimal padding
    const routeBounds = L.latLngBounds(route.coordinates);
    map.fitBounds(routeBounds, { 
      padding: [50, 50],
      maxZoom: profile === 'foot-walking' ? 18 : 16
    });
    
    // Start live tracking if not already started
    if (!liveTracking) {
      startLiveTracking();
    }
  });

  routingControl.on('routingerror', function(e) {
    console.error('Routing error event:', e.error);
    
    let errorMessage = "Could not calculate a route. ";
    if (e.error && e.error.message) {
      if (e.error.message.includes('No route found') || e.error.message.includes('Unable to find a route')) {
        errorMessage = "No route found between these locations. They might be too far apart or inaccessible.";
      } else if (e.error.message.includes('Too many requests')) {
        errorMessage = "Too many routing requests. Please wait a moment.";
      }
    }
    
    showCustomAlert({
      title: "Route Calculation Failed",
      message: errorMessage,
      type: "danger",
      confirmText: "Try Again",
      cancelText: "Cancel",
      showCancel: true
    }).then(confirmed => {
      if (confirmed) {
        // Retry the route calculation
        calculateRoute(profile);
      }
    });
  });

  // Add route waypoint events for better UX
  routingControl.on('waypointschanged', function(e) {
    console.log('Waypoints changed:', e.waypoints);
  });

  // Enhanced container setup
  enhanceRoutingContainer();
  updateRoutingControlStyle(isDarkMode);
  
  return routingControl;
}

function convertORSRouteToLRM(orsRoute, waypoints) {
  const geometry = orsRoute.geometry;
  const properties = orsRoute.properties;
  const segments = properties.segments[0];
  
  // Convert coordinates from [lng, lat] to [lat, lng]
  const coordinates = geometry.coordinates.map(coord => [coord[1], coord[0]]);
  
  // Convert instructions
  const instructions = segments.steps.map((step, index) => {
    return {
      text: step.instruction,
      distance: step.distance,
      time: step.duration,
      index: index
    };
  });
  
  return {
    name: 'Route',
    summary: {
      totalDistance: segments.distance,
      totalTime: segments.duration
    },
    coordinates: coordinates,
    instructions: instructions,
    inputWaypoints: waypoints,
    waypoints: waypoints,
    properties: {
      segments: [segments]
    }
  };
}

function updateRouteInfo(route, profile) {
  const routeInfo = document.getElementById('routeInfo');
  const routeDistance = document.getElementById('routeDistance');
  const routeTime = document.getElementById('routeTime');
  
  if (routeInfo && routeDistance && routeTime) {
    const summary = route.properties.segments[0];
    const distance = (summary.distance / 1000).toFixed(1);
    const time = formatDuration(summary.duration, profile);
    
    routeDistance.textContent = `${distance} km`;
    routeTime.textContent = time;
    routeInfo.style.display = 'block';
  }
}

function formatDuration(seconds, profile) {
  const minutes = Math.round(seconds / 60);
  if (profile === 'foot-walking') {
    if (minutes < 60) {
      return `${minutes} min walk`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m walk`;
    }
  } else {
    if (minutes < 60) {
      return `${minutes} min drive`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m drive`;
    }
  }
}

function fallbackToOSRM(waypoints, callback, context, profile) {
  console.log(`Falling back to OSRM for ${profile}...`);
  
  const osrmProfile = profile === 'foot-walking' ? 'walking' : 'driving';
  const osrmRouter = L.Routing.osrmv1({
    serviceUrl: 'https://router.project-osrm.org/route/v1',
    profile: osrmProfile
  });
  
  osrmRouter.route(waypoints, callback, context);
}

function enhanceRoutingContainer() {
  setTimeout(() => {
    const routingContainer = document.querySelector('.leaflet-routing-container');
    if (routingContainer) {
      routingContainer.classList.add('mobile-routing-container');
      
      // Make the entire minimized container clickable to expand
      routingContainer.addEventListener('click', function(e) {
        if (this.classList.contains('leaflet-routing-container-hide')) {
          // Don't trigger if clicking the collapse button itself
          if (!e.target.closest('.leaflet-routing-collapse-btn')) {
            const collapseBtn = this.querySelector('.leaflet-routing-collapse-btn');
            if (collapseBtn) {
              collapseBtn.click();
            }
          }
        }
      });
      
      // Ensure collapse button is clickable
      const collapseBtn = routingContainer.querySelector('.leaflet-routing-collapse-btn');
      if (collapseBtn) {
        collapseBtn.style.pointerEvents = 'auto';
        collapseBtn.style.cursor = 'pointer';
        
        collapseBtn.addEventListener('click', function(e) {
          e.stopPropagation(); // Prevent triggering the container click
        });
      }
      
      // Auto-collapse on mobile only
      if (window.innerWidth <= 768) {
        if (collapseBtn) {
          setTimeout(() => {
            collapseBtn.click();
          }, 1000);
        }
      }
    }
  }, 100);
}

// ==================== UTILITY FUNCTIONS ====================
window.updateMapDarkMode = function (isDark) {
  if (isDark) {
    if (map.hasLayer(lightLayer)) map.removeLayer(lightLayer);
    darkLayer.addTo(map);
  } else {
    if (map.hasLayer(darkLayer)) map.removeLayer(darkLayer);
    lightLayer.addTo(map);
  }
  updateRoutingControlStyle(isDark);
};

window.updateMapFilter = function (brightness = 1, contrast = 1) {
  const tilePane = document.querySelector("#map .leaflet-tile-pane");
  const overlayPane = document.querySelector("#map .leaflet-overlay-pane");
  const filterValue = `brightness(${brightness}) contrast(${contrast})`;
  if (tilePane) tilePane.style.filter = filterValue;
  if (overlayPane) overlayPane.style.filter = filterValue;
};

function updateRoutingControlStyle(isDark) {
  const routingContainer = document.querySelector('.leaflet-routing-container');
  if (routingContainer) {
    if (isDark) {
      routingContainer.style.backgroundColor = "#2d2d2d";
      routingContainer.style.color = "#e0e0e0";
    } else {
      routingContainer.style.backgroundColor = "";
      routingContainer.style.color = "";
    }
  }
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `custom-toast custom-toast-${type}`;
  toast.innerHTML = `
    <div class="custom-toast-content">
      <i class="bi ${getToastIcon(type)}"></i>
      <span>${message}</span>
    </div>
  `;
  
  document.body.appendChild(toast);
  
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

function showCustomAlert(options) {
  return new Promise((resolve) => {
    const {
      title,
      message,
      type = 'warning',
      confirmText = 'OK',
      cancelText = 'Cancel',
      showCancel = true
    } = options;

    const overlay = document.createElement('div');
    overlay.className = 'custom-alert-overlay';
    
    const alert = document.createElement('div');
    alert.className = 'custom-alert';
    
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
          <button class="custom-alert-btn custom-alert-btn-primary" data-action="confirm">
            ${confirmText}
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    document.body.appendChild(alert);
    
    const handleAction = (action) => {
      document.body.removeChild(overlay);
      document.body.removeChild(alert);
      resolve(action === 'confirm');
    };
    
    alert.querySelector('[data-action="confirm"]').addEventListener('click', () => handleAction('confirm'));
    
    if (showCancel) {
      alert.querySelector('[data-action="cancel"]').addEventListener('click', () => handleAction('cancel'));
      overlay.addEventListener('click', () => handleAction('cancel'));
    }
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        handleAction('cancel');
        document.removeEventListener('keydown', handleEscape);
      }
    };
    
    document.addEventListener('keydown', handleEscape);
  });
}

// ==================== NAVIGATION & UI FUNCTIONS ====================
function goBack() {
  window.history.back(); 
}

function SidebarBtn() {
  const sidebar = document.getElementById("sidebarId");
  sidebar.classList.toggle("active");
}

function closebtn() {
  const sidebar = document.getElementById("sidebarId");
  sidebar.classList.remove("active");
}

document.addEventListener("click", function (event) {
  const sidebar = document.getElementById("sidebarId");
  const togglebtn = document.querySelector(".bi-list");

  if (
    sidebar.classList.contains("active") &&
    !sidebar.contains(event.target) &&
    (!togglebtn || !togglebtn.contains(event.target))
  ) {
    sidebar.classList.remove("active");
  }
});

async function showUsername() {
  try {
    const username = localStorage.getItem("username");
    const usernameElement = document.getElementById("user");

    if (!usernameElement) return;

    usernameElement.textContent = username || "Guest";
    usernameElement.style.fontSize = "20px";

    const logoutItem = document.getElementById("logoutItem");
    if (logoutItem) {
      logoutItem.style.display = (username && username !== "Guest") ? "block" : "none";
    }
    
  } catch (err) {
    console.error("Error in showUsername:", err);
    const userElement = document.getElementById("user");
    if (userElement) userElement.textContent = "Guest";
    
    const logoutItem = document.getElementById("logoutItem");
    if (logoutItem) logoutItem.style.display = "none";
  }
}

function startLiveTracking() {
  if (liveTracking) return;
  
  liveTracking = true;
  showToast("Live tracking started", "success");
  
  // Update GPS position continuously
  gpsWatchId = navigator.geolocation.watchPosition(
    updateLivePosition,
    onGPSError,
    {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 2000
    }
  );
  
  // Update every 5 seconds
  liveTrackingInterval = setInterval(() => {
    if (gpsPosition && routingControl) {
      checkRouteProximity();
    }
  }, 5000);
}

function stopLiveTracking() {
  liveTracking = false;
  if (gpsWatchId) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  if (liveTrackingInterval) {
    clearInterval(liveTrackingInterval);
    liveTrackingInterval = null;
  }
  showToast("Live tracking stopped", "info");
}

function updateLivePosition(position) {
  const newPosition = L.latLng(
    position.coords.latitude,
    position.coords.longitude
  );
  
  // Update user marker position
  if (userMarker) {
    userMarker.setLatLng(newPosition);
  }
  
  gpsPosition = newPosition;
  
  // Update route if needed (with buffer check)
  checkRouteProximity();
}

function checkRouteProximity() {
  if (!currentRoute || !gpsPosition) return;
  
  // Calculate distance from current position to the route
  const distanceToRoute = calculateDistanceToRoute(gpsPosition, currentRoute);
  
  // If user is outside the buffer zone, recalculate route
  if (distanceToRoute > bufferDistance) {
    showToast("You're off route! Recalculating...", "warning");
    recalculateRouteFromCurrentPosition();
  }
}

function calculateDistanceToRoute(position, route) {
  let minDistance = Infinity;
  
  // Check distance to each point in the route
  route.coordinates.forEach(coord => {
    const routePoint = L.latLng(coord[0], coord[1]);
    const distance = position.distanceTo(routePoint);
    if (distance < minDistance) {
      minDistance = distance;
    }
  });
  
  return minDistance;
}

function recalculateRouteFromCurrentPosition() {
  if (!gpsPosition || !destination) return;
  
  showToast("Recalculating route from current position...", "info");
  
  // Store current profile
  const currentProfile = currentRouteProfile;
  
  // Clear existing routing
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }
  
  // Recalculate route from current position
  calculateRoute(currentProfile);
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

// Make functions globally available
window.showCustomAlert = showCustomAlert;
window.showToast = showToast;
window.logout = logout;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
  initializeDarkMode();
  console.log('Dark mode initialized:', localStorage.getItem('darkMode') === 'true');
});

// Initialize
showUsername();