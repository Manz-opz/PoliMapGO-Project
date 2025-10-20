// Campus Information System - Optimized with Progressive Loading
document.addEventListener('DOMContentLoaded', async function(){
  const EDGE_FUNCTION_URLS = {
    buildings: "https://spmnhcxigezzjqabxpmg.supabase.co/functions/v1/buildings",
    levels: "https://spmnhcxigezzjqabxpmg.supabase.co/functions/v1/levels", 
    rooms: "https://spmnhcxigezzjqabxpmg.supabase.co/functions/v1/rooms",
    staff: "https://spmnhcxigezzjqabxpmg.supabase.co/functions/v1/staffs"
  };

  const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwbW5oY3hpZ2V6empxYWJ4cG1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3OTE2ODcsImV4cCI6MjA3MjM2NzY4N30.cghMxz__fkITUUzFSYaXxLi4kUj8jKDfNUGpQH35kr4";

  // State management
  const state = {
    allData: [],
    filteredData: [],
    currentFilter: '__all',
    exactMatch: false,
    isLoading: false,
    hasInitialData: false
  };

  // DOM elements
  const elements = {
    list: document.getElementById('info-list'),
    input: document.getElementById('info-search'),
    empty: document.getElementById('empty-state'),
    loading: document.getElementById('loading-state'),
    error: document.getElementById('error-state'),
    filterButtons: document.getElementById('filter-buttons'),
    exactToggle: document.getElementById('exact-toggle'),
    progressBar: document.getElementById('loading-progress'),
    progressText: document.getElementById('loading-text')
  };

  // Create progress elements if they don't exist
  function ensureProgressElements() {
    if (!elements.progressBar) {
      const progressContainer = document.createElement('div');
      progressContainer.className = 'loading-progress-container';
      progressContainer.innerHTML = `
        <div class="progress mb-2" style="height: 6px;">
          <div id="loading-progress" class="progress-bar" role="progressbar" style="width: 0%"></div>
        </div>
        <small id="loading-text" class="text-muted">Loading campus data...</small>
      `;
      // Insert the progress container above the list so it is visible at the top
      // of the content area, instead of being placed inside the loading state box.
      if (elements.list && elements.list.parentNode) {
        elements.list.parentNode.insertBefore(progressContainer, elements.list);
        // keep a reference so we can remove it later
        elements._progressContainer = progressContainer;
      } else {
        elements.loading.appendChild(progressContainer);
        elements._progressContainer = progressContainer;
      }
      elements.progressBar = document.getElementById('loading-progress');
      elements.progressText = document.getElementById('loading-text');
    }
  }

  // Edge Function helper
  async function callEdgeFunction(functionName, action, data = {}) {
    try {
      const functionUrl = EDGE_FUNCTION_URLS[functionName];
      console.log(`Calling ${functionName}.${action}...`);
      
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`
        },
        body: JSON.stringify({ action, data })
      });

      if (!response.ok) {
        throw new Error(`${functionName}.${action} failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      
      console.log(`${functionName}.${action} success:`, result.data?.length || '0 items');
      return result;
    } catch (error) {
      console.error(`Edge function ${functionName}.${action} error:`, error);
      return { data: [] };
    }
  }

  // Update progress display
  function updateProgress(step, totalSteps, message) {
    if (elements.progressBar && elements.progressText) {
      const progress = Math.min(100, Math.round((step / totalSteps) * 100));
      elements.progressBar.style.width = `${progress}%`;
      elements.progressText.textContent = message;
    }
  }

  // Load all data with progressive display
  async function loadAllData() {
    try {
      state.isLoading = true;
      state.hasInitialData = false;
      showLoading();
      hideError();
      ensureProgressElements();
      
      console.log('Starting progressive data load...');

      // Step 1: Load buildings first and display them immediately
      updateProgress(1, 5, 'Loading buildings...');
      const buildingsResult = await callEdgeFunction('buildings', 'load_buildings');
      const buildingsData = buildingsResult.data || [];
      
      console.log('Buildings loaded:', buildingsData.length);

      if (buildingsData.length === 0) {
        // Nothing to load — stop loading state and update UI
        state.isLoading = false;
        hideLoading();
        renderFilterButtons();
        showEmpty('No campus data found.');
        return;
      }

      // Display buildings immediately
      const buildingItems = buildingsData.map(building => ({
        id: `building-${building.id}`,
        type: 'building',
        name: building.name,
        info: building.info || 'No description available',
        building: building.name,
        level: null,
        room: null,
        staff: null,
        role: null,
        itemType: 'Building',
        searchable: [building.name, building.info, 'building'].filter(Boolean).join(' ').toLowerCase(),
        isPartial: true // Mark as partial data
      }));

  state.allData = buildingItems;
  state.hasInitialData = true;
  // Render buildings and prepare filter buttons so UI is interactive
  renderFilterButtons();
  render(state.allData);
  updateProgress(2, 5, 'Buildings loaded. Loading levels...');

      // Step 2: Load levels in background and update existing items
      const levelsData = await loadAllLevels(buildingsData);
      updateProgress(3, 5, 'Levels loaded. Loading rooms...');

      // Step 3: Load rooms in background
      const roomsData = await loadAllRooms(levelsData);
      updateProgress(4, 5, 'Rooms loaded. Loading staff...');

      // Step 4: Load staff in background
      const staffData = await loadAllStaff(roomsData);
      updateProgress(5, 5, 'Finalizing data...');

  // Step 5: Combine all data and replace partial items
  // Mark loading complete so filter buttons and dropdowns will be shown
  state.isLoading = false;
  combineAllData(buildingsData, levelsData, roomsData, staffData);

  hideLoading();
      console.log('All data loading complete');

    } catch (error) {
      console.error('Failed to load campus data:', error);
      // Ensure loading flag is cleared on error so filter UI can reappear or
      // show an appropriate message.
      state.isLoading = false;
      hideLoading();
      
      // Even if there's an error, we might have some data to show
      if (state.hasInitialData) {
        showToast('Some data may be incomplete', 'warning');
      } else {
        showError('Failed to load data. Please try again.');
      }
    }
  }

  // Load all levels for all buildings
  async function loadAllLevels(buildings) {
    try {
      let allLevels = [];
      
      // Load levels for each building with progress updates
      for (let i = 0; i < buildings.length; i++) {
        const building = buildings[i];
        const levelsResult = await callEdgeFunction('levels', 'load_levels', { buildingId: building.id });
        const levels = levelsResult.data || [];
        const levelsWithBuilding = levels.map(level => ({
          ...level,
          building_name: building.name,
          building_id: building.id
        }));
        allLevels = allLevels.concat(levelsWithBuilding);
        
        // Update progress for levels loading
        updateProgress(2 + (i / buildings.length), 5, `Loading levels... (${i + 1}/${buildings.length})`);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      console.log('Total levels loaded:', allLevels.length);
      return allLevels;
    } catch (error) {
      console.error('Error loading levels:', error);
      return [];
    }
  }

  // Load all rooms for all levels
  async function loadAllRooms(levels) {
    try {
      let allRooms = [];

      // Load rooms for each level with progress updates
      for (let i = 0; i < levels.length; i++) {
        const level = levels[i];
        const roomsResult = await callEdgeFunction('rooms', 'load_rooms', { levelId: level.id });
        const rooms = roomsResult.data || [];
        const roomsWithInfo = rooms.map(room => ({
          ...room,
          level_name: level.floor,
          level_id: level.id,
          building_name: level.building_name,
          building_id: level.building_id
        }));
        allRooms = allRooms.concat(roomsWithInfo);
        
        // As rooms for this level are available, append them to the UI so users
        // can see results progressively instead of waiting for the full load.
        try {
          const roomItems = roomsWithInfo.map(room => ({
            id: `room-${room.id}`,
            type: 'room',
            name: room.name,
            info: room.info || 'No description available',
            building: room.building_name || 'Unknown Building',
            level: room.level_name || 'Unknown Level',
            room: room.name,
            staff: null,
            role: null,
            itemType: 'Room',
            searchable: [room.name, room.info, room.building_name, 'room'].filter(Boolean).join(' ').toLowerCase(),
            isPartial: true
          }));

          // Append to state and render current filter
          state.allData = state.allData.concat(roomItems);
          // Update filter buttons (building list may expand) and re-apply filter
          renderFilterButtons();
          applyCurrentFilter();
        } catch (err) {
          console.error('Error appending rooms progressively:', err);
        }

        // Update progress for rooms loading
        updateProgress(3 + (i / levels.length), 5, `Loading rooms... (${i + 1}/${levels.length})`);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      console.log('Total rooms loaded:', allRooms.length);
      return allRooms;
    } catch (error) {
      console.error('Error loading rooms:', error);
      return [];
    }
  }

  // Load all staff for all rooms
  async function loadAllStaff(rooms) {
    try {
      let allStaff = [];

      // Load staff for each room with progress updates
      for (let i = 0; i < rooms.length; i++) {
        const room = rooms[i];
        const staffResult = await callEdgeFunction('staff', 'load_staff', { roomId: room.id });
        const staff = staffResult.data || [];
        const staffWithInfo = staff.map(staffMember => ({
          ...staffMember,
          room_name: room.name,
          room_id: room.id,
          level_name: room.level_name,
          level_id: room.level_id,
          building_name: room.building_name,
          building_id: room.building_id
        }));
        allStaff = allStaff.concat(staffWithInfo);
        
        // Append staff items to the UI progressively
        try {
          const staffItems = staffWithInfo.map(s => ({
            id: `staff-${s.id}`,
            type: 'staff',
            name: s.name,
            info: s.role || 'No role specified',
            building: s.building_name || 'Unknown Building',
            level: s.level_name || 'Unknown Level',
            room: s.room_name || 'Unknown Room',
            staff: s.name,
            role: s.role,
            itemType: 'Staff',
            searchable: [s.name, s.role, s.building_name, s.level_name, s.room_name, 'staff'].filter(Boolean).join(' ').toLowerCase(),
            isPartial: true
          }));

          state.allData = state.allData.concat(staffItems);
          // Re-render filters and apply the current filter so new staff appear
          renderFilterButtons();
          applyCurrentFilter();
        } catch (err) {
          console.error('Error appending staff progressively:', err);
        }

        // Update progress for staff loading
        updateProgress(4 + (i / rooms.length), 5, `Loading staff... (${i + 1}/${rooms.length})`);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      console.log('Total staff loaded:', allStaff.length);
      return allStaff;
    } catch (error) {
      console.error('Error loading staff:', error);
      return [];
    }
  }

  // Combine all data into unified format
  function combineAllData(buildings, levels, rooms, staff) {
    console.log('Combining complete data:', {
      buildings: buildings.length,
      levels: levels.length,
      rooms: rooms.length,
      staff: staff.length
    });

    const completeData = [];
    
    // Add buildings (complete data)
    buildings.forEach(building => {
      completeData.push({
        id: `building-${building.id}`,
        type: 'building',
        name: building.name,
        info: building.info || 'No description available',
        building: building.name,
        level: null,
        room: null,
        staff: null,
        role: null,
        itemType: 'Building',
        searchable: [building.name, building.info, 'building'].filter(Boolean).join(' ').toLowerCase(),
        isPartial: false
      });
    });

    // Add rooms (complete data)
    rooms.forEach(room => {
      completeData.push({
        id: `room-${room.id}`,
        type: 'room',
        name: room.name,
        info: room.info || 'No description available',
        building: room.building_name || 'Unknown Building',
        level: room.level_name || 'Unknown Level',
        room: room.name,
        staff: null,
        role: null,
        itemType: 'Room',
        searchable: [room.name, room.info, room.building_name, 'room'].filter(Boolean).join(' ').toLowerCase(),
        isPartial: false
      });
    });

    // Add staff (complete data)
    staff.forEach(staffMember => {
      completeData.push({
        id: `staff-${staffMember.id}`,
        type: 'staff',
        name: staffMember.name,
        info: staffMember.role || 'No role specified',
        building: staffMember.building_name || 'Unknown Building',
        level: staffMember.level_name || 'Unknown Level',
        room: staffMember.room_name || 'Unknown Room',
        staff: staffMember.name,
        role: staffMember.role,
        itemType: 'Staff',
        searchable: [
          staffMember.name, 
          staffMember.role, 
          staffMember.building_name, 
          staffMember.level_name, 
          staffMember.room_name,
          'staff'
        ].filter(Boolean).join(' ').toLowerCase(),
        isPartial: false
      });
    });

    // Replace the state with complete data
    state.allData = completeData;
    
    console.log('Complete data loaded:', {
      total: state.allData.length,
      buildings: state.allData.filter(d => d.type === 'building').length,
      rooms: state.allData.filter(d => d.type === 'room').length,
      staff: state.allData.filter(d => d.type === 'staff').length
    });
    
    // Re-render with complete data
    renderFilterButtons();
    applyCurrentFilter();
    
    // Show completion toast
    showToast('All data loaded successfully!', 'success');
  }

  // Show toast notification
  function showToast(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `custom-toast custom-toast-${type}`;
    toast.innerHTML = `
      <div class="custom-toast-content">
        <i class="bi ${getToastIcon(type)}"></i>
        <span>${message}</span>
      </div>
    `;
    
    // Add styles if not already added
    if (!document.querySelector('#toast-styles')) {
      const styles = document.createElement('style');
      styles.id = 'toast-styles';
      styles.textContent = `
        .custom-toast {
          position: fixed;
          top: 20px;
          right: 20px;
          background: white;
          border-radius: 12px;
          padding: 16px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          z-index: 10001;
          animation: toastSlideIn 0.3s ease;
          max-width: 300px;
          border-left: 4px solid #007aff;
        }
        .custom-toast-success { border-left-color: #34c759; }
        .custom-toast-warning { border-left-color: #ff9500; }
        .custom-toast-danger { border-left-color: #ff3b30; }
        .custom-toast-info { border-left-color: #007aff; }
        .custom-toast-content {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .custom-toast-content i {
          font-size: 1.2rem;
        }
        @keyframes toastSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes toastSlideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
        .loading-progress-container {
          padding: 20px;
          text-align: center;
        }
        .loading-item {
          opacity: 0.7;
        }
        .loading-indicator {
          margin-top: 4px;
        }
      `;
      document.head.appendChild(styles);
    }
    
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

  // Render filter buttons with smart dropdown
  function renderFilterButtons() {
    // If data is still loading, hide the filter buttons area entirely
    if (state.isLoading) {
      elements.filterButtons.style.display = 'none';
      return;
    } else {
      elements.filterButtons.style.display = '';
    }

    elements.filterButtons.innerHTML = '';
    const buildings = Array.from(new Set(state.allData.map(d => d.building).filter(Boolean)));
    
    // All button
    const allBtn = createFilterButton('All', '__all', true);
    elements.filterButtons.appendChild(allBtn);

    // Type filters
    const typeFilters = [
      { value: 'building', label: 'Buildings' },
      { value: 'room', label: 'Rooms' },
      { value: 'staff', label: 'Staff' }
    ];

    typeFilters.forEach(filter => {
      const btn = createFilterButton(filter.label, null, false, filter.value);
      elements.filterButtons.appendChild(btn);
    });

    // Building filters - use dropdown if more than 6 buildings
    if (buildings.length > 6) {
      createBuildingDropdown(buildings);
    } else {
      buildings.forEach(building => {
        const btn = createFilterButton(building, building);
        elements.filterButtons.appendChild(btn);
      });
    }
  }

  function createFilterButton(text, filter, active = false, typeFilter = null) {
    const btn = document.createElement('button');
    btn.className = `btn-ghost ${active ? 'active' : ''}`;
    btn.textContent = text;
    if (filter) btn.dataset.filter = filter;
    if (typeFilter) btn.dataset.typeFilter = typeFilter;
    return btn;
  }

  function createBuildingDropdown(buildings) {
    const dropdownWrapper = document.createElement('div');
    dropdownWrapper.className = 'building-dropdown-wrapper';
    
    const select = document.createElement('select');
    select.className = 'building-select';
    select.innerHTML = '<option value="">Select Building</option>' + 
      buildings.map(b => `<option value="${b}">${b}</option>`).join('');
    
    select.addEventListener('change', function() {
      const selectedBuilding = this.value;
      
      // Remove active class from all buttons and selects
      document.querySelectorAll('#filter-buttons .btn-ghost, .building-select').forEach(el => {
        el.classList.remove('active');
      });
      
      if (!selectedBuilding) {
        // Activate "All" button when no building selected
        const allBtn = document.querySelector('#filter-buttons [data-filter="__all"]');
        if (allBtn) allBtn.classList.add('active');
        state.currentFilter = '__all';
        state.filteredData = state.allData;
      } else {
        // Add active class to select when a building is selected
        select.classList.add('active');
        state.currentFilter = selectedBuilding;
        state.filteredData = state.allData.filter(d => d.building === selectedBuilding);
      }
      
      render(state.filteredData);
    });
    
    dropdownWrapper.appendChild(select);
    elements.filterButtons.appendChild(dropdownWrapper);
  }

  // Filter functions
  function filterDataByBuilding(building) {
    state.currentFilter = building;
    state.filteredData = state.allData.filter(d => d.building === building);
    render(state.filteredData);
  }

  function filterDataByType(type) {
    state.currentFilter = type;
    state.filteredData = type === '__all_types' ? state.allData : state.allData.filter(d => d.type === type);
    render(state.filteredData);
  }

  function applyCurrentFilter() {
    if (state.currentFilter === '__all') {
      state.filteredData = state.allData;
    } else if (['building', 'room', 'staff', '__all_types'].includes(state.currentFilter)) {
      filterDataByType(state.currentFilter === '__all_types' ? '__all_types' : state.currentFilter);
    } else {
      filterDataByBuilding(state.currentFilter);
    }
    render(state.filteredData);
  }

  // Handle filter button clicks
  elements.filterButtons.addEventListener('click', function(e) {
    const btn = e.target.closest('button');
    if (!btn) return;

    // Remove active class from all buttons and selects
    document.querySelectorAll('#filter-buttons .btn-ghost, .building-select').forEach(el => {
      el.classList.remove('active');
    });
    btn.classList.add('active');

    const filter = btn.dataset.filter;
    const typeFilter = btn.dataset.typeFilter;

    // Reset building dropdown
    const buildingSelect = document.querySelector('.building-select');
    if (buildingSelect) {
      buildingSelect.value = '';
      buildingSelect.classList.remove('active');
    }

    if (filter === '__all') {
      state.currentFilter = '__all';
      state.filteredData = state.allData;
    } else if (typeFilter) {
      state.currentFilter = typeFilter;
      filterDataByType(typeFilter);
    } else if (filter) {
      state.currentFilter = filter;
      filterDataByBuilding(filter);
    }

    render(state.filteredData);
  });

  // Exact match toggle
  elements.exactToggle.addEventListener('click', function() {
    state.exactMatch = !state.exactMatch;
    elements.exactToggle.classList.toggle('active', state.exactMatch);
    elements.exactToggle.textContent = state.exactMatch ? 'Exact: ON' : 'Exact';
    
    // Re-apply current search
    if (elements.input.value.trim()) {
      handleSearch(elements.input.value);
    }
  });

  // Search functionality
  function handleSearch(query) {
    const q = query.toLowerCase().trim();
    
    if (!q) {
      applyCurrentFilter();
      return;
    }

    const filtered = state.allData.filter(item => {
      if (state.exactMatch) {
        return item.searchable.split(' ').some(field => field === q);
      }
      return item.searchable.includes(q);
    });

    render(filtered);
  }

  elements.input.addEventListener('input', function(e) {
    handleSearch(e.target.value);
  });

  // Render list items
  function render(items) {
    elements.list.innerHTML = '';
    
    if (items.length === 0) {
      showEmpty('No results found');
      return;
    }
    
    hideEmpty();
    const fragment = document.createDocumentFragment();

    items.forEach(item => {
      const article = document.createElement('article');
      article.className = 'list-row';
      article.innerHTML = createListItemHTML(item);
      
      // Add loading indicator for partial data
      if (item.isPartial) {
        article.classList.add('loading-item');
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.innerHTML = '<small class="text-muted"><i class="bi bi-arrow-repeat spinner"></i> Loading details...</small>';
        article.querySelector('.row-meta').appendChild(loadingIndicator);
      }
      
      fragment.appendChild(article);
    });

    elements.list.appendChild(fragment);
  }

  function createListItemHTML(item) {
    const subtitle = getItemSubtitle(item);
    
    return `
      <div class="row-avatar">${getAvatarIcon(item.type)}</div>
      <div class="row-meta">
        <p class="row-title">${escapeHTML(item.name)}</p>
        <p class="row-sub">${escapeHTML(subtitle)}</p>
      </div>
      <div class="row-actions">
        <button class="btn-ghost" data-id="${item.id}">Details</button>
      </div>
    `;
  }

  function getItemSubtitle(item) {
    switch (item.type) {
      case 'building':
        return 'Building';
      case 'room':
        return `${item.building}${item.isPartial ? ' (Loading...)' : ''}`;
      case 'staff':
        return `${item.role} · ${item.room}, ${item.building}${item.isPartial ? ' (Loading...)' : ''}`;
      default:
        return '';
    }
  }

  function getAvatarIcon(type) {
    const icons = {
      building: '<i class="bi bi-building"></i>',
      room: '<i class="bi bi-door-closed"></i>',
      staff: '<i class="bi bi-person"></i>'
    };
    return icons[type] || '<i class="bi bi-file-text"></i>';
  }

  // Utility functions
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showLoading() {
    elements.loading.style.display = 'block';
    elements.empty.style.display = 'none';
    elements.error.style.display = 'none';
  }

  function hideLoading() {
    elements.loading.style.display = 'none';
    // Remove the progress container from the DOM when loading finishes
    try {
      if (elements._progressContainer && elements._progressContainer.parentNode) {
        elements._progressContainer.parentNode.removeChild(elements._progressContainer);
      }
    } catch (e) {
      console.warn('Failed to remove progress container:', e);
    }

    // Clear progress references so future loads create fresh elements
    elements.progressBar = null;
    elements.progressText = null;
    elements._progressContainer = null;
  }

  function showEmpty(message) {
    elements.empty.textContent = message;
    elements.empty.style.display = 'block';
    elements.error.style.display = 'none';
  }

  function hideEmpty() {
    elements.empty.style.display = 'none';
  }

  function showError(message) {
    elements.error.textContent = message;
    elements.error.style.display = 'block';
    elements.error.className = 'empty error';
    elements.empty.style.display = 'none';
  }

  function hideError() {
    elements.error.style.display = 'none';
  }

  // Back button
  const backBtn = document.querySelector('.btn-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => window.history.back());
  }

  // Details modal
  const detailsModal = new bootstrap.Modal(document.getElementById('detailsModal'));
  const detailsBody = document.getElementById('detailsModalBody');
  
  elements.list.addEventListener('click', function(e) {
    const btn = e.target.closest('.btn-ghost');
    if (!btn) return;
    
    const id = btn.dataset.id;
    const item = state.allData.find(d => d.id === id);
    
    if (item) {
      showItemDetails(item);
    }
  });

  function showItemDetails(item) {
    let detailsHTML = '';
    
    switch (item.type) {
      case 'building':
        detailsHTML = `
          <div class="mb-3"><strong>Building:</strong> ${escapeHTML(item.name)}</div>
          <div><strong>Description:</strong> ${escapeHTML(item.info)}</div>
        `;
        break;
      case 'room':
        detailsHTML = `
          <div class="mb-3"><strong>Room:</strong> ${escapeHTML(item.name)}</div>
          <div><strong>Building:</strong> ${escapeHTML(item.building)}</div>
          <div><strong>Level:</strong> ${escapeHTML(item.level)}</div>
          <div><strong>Details:</strong> ${escapeHTML(item.info)}</div>
        `;
        break;
      case 'staff':
        detailsHTML = `
          <div class="mb-3"><strong>Staff:</strong> ${escapeHTML(item.name)}</div>
          <div><strong>Role:</strong> ${escapeHTML(item.role)}</div>
          <div><strong>Room:</strong> ${escapeHTML(item.room)}</div>
          <div><strong>Level:</strong> ${escapeHTML(item.level)}</div>
          <div><strong>Building:</strong> ${escapeHTML(item.building)}</div>
        `;
        break;
    }

    detailsBody.innerHTML = detailsHTML;
    detailsModal.show();
  }

  // Initialize the application
  await loadAllData();
});