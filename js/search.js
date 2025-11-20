// --------------------------------------------
// search.js - FIXED VERSION
// --------------------------------------------

(function() {
    const searchBar = document.getElementById("searchBar");
    const searchResults = document.getElementById("searchResults");
    let searchTimeout = null;
    let currentSearchHighlight = null;

    async function handleSearchResult(result) {
        console.log('Search result:', result); // Debug log
        
        if (result.type === "Building") {
            await highlightBuilding(result.data);
        } 
        else if (result.type === "Room") {
            // First get the level for this room to find building_id
            const { data: level } = await window.supabase
                .from('levels')
                .select('building_id')
                .eq('id', result.data.level_id)
                .single();
            
            if (level) {
                // Then get the building
                const { data: building } = await window.supabase
                    .from('buildings')
                    .select('*')
                    .eq('id', level.building_id)
                    .single();
                
                if (building) {
                    await highlightBuilding(building);
                    onBuildingClick(building, polygon);
                    currentSearchHighlight.bindPopup(popupContent).openPopup();
                }
            }
        }
        else if (result.type === "Staff") {
            // First get the room for this staff to find level_id
            const { data: room } = await window.supabase
                .from('rooms')
                .select('level_id')
                .eq('id', result.data.room_id)
                .single();
            
            if (room) {
                // Then get the level to find building_id
                const { data: level } = await window.supabase
                    .from('levels')
                    .select('building_id')
                    .eq('id', room.level_id)
                    .single();
                
                if (level) {
                    // Finally get the building
                    const { data: building } = await window.supabase
                        .from('buildings')
                        .select('*')
                        .eq('id', level.building_id)
                        .single();
                    
                    if (building) {
                        await highlightBuilding(building);
                        onBuildingClick(building, polygon);
                        currentSearchHighlight.bindPopup(popupContent).openPopup();
                    }
                }
            }
        }
    }

    async function highlightBuilding(building) {
        console.log('Highlighting building:', building);
        
        if (!building || !building.coords) {
            console.error('No building or coordinates found');
            return;
        }

        // Remove previous highlight
        if (currentSearchHighlight) {
            window.map.removeLayer(currentSearchHighlight);
        }

        // Convert coordinates
        let coords = typeof building.coords === "string" 
            ? JSON.parse(building.coords) 
            : building.coords;

        if (coords[0] && coords[0].lat !== undefined) {
            coords = coords.map((p) => [p.lat, p.lng]);
        }

        // Create a semi-transparent overlay that will show above existing polygons
        const polygon = L.polygon(coords, {
            color: "red",
            fillColor: "red", 
            fillOpacity: 0.3,  // More transparent so you can see the building underneath
            weight: 4,
            className: 'search-highlight',
            pane: 'overlayPane'  // Make sure it appears above other layers
        }).addTo(window.map);

        currentSearchHighlight = polygon;
        
        // Fit bounds with some padding
        window.map.fitBounds(polygon.getBounds(), { padding: [20, 20] });

        // Create popup
        onBuildingClick(building, polygon);

        console.log('Search highlight overlay added to map');
    }

    // Event listeners
    if (searchBar) {
        searchBar.addEventListener("keypress", async (e) => {
            if (e.key !== "Enter") return;

            const keyword = searchBar.value.trim();
            if (!keyword) return;

            try {
                // SIMPLER QUERIES - no complex joins
                const [buildingsRes, roomsRes, staffRes] = await Promise.all([
                    window.supabase.from("buildings").select("*").ilike("name", `%${keyword}%`),
                    window.supabase.from("rooms").select("*").ilike("name", `%${keyword}%`),
                    window.supabase.from("staff").select("*").ilike("name", `%${keyword}%`)
                ]);

                const results = [
                    ...buildingsRes.data.map(b => ({ type: "Building", data: b })),
                    ...roomsRes.data.map(r => ({ type: "Room", data: r })),
                    ...staffRes.data.map(s => ({ type: "Staff", data: s }))
                ];

                if (results.length === 0) {
                    alert("No results found!");
                    return;
                }

                await handleSearchResult(results[0]);

            } catch (err) {
                console.error("Search failed:", err);
            }
        });

        searchBar.addEventListener("input", async (e) => {
            const keyword = e.target.value.trim();
            clearTimeout(searchTimeout);

            if (!keyword) {
                if (searchResults) {
                    searchResults.style.display = "none";
                    searchResults.innerHTML = "";
                }
                return;
            }

            searchTimeout = setTimeout(async () => {
                try {
                    const [buildingsRes, roomsRes, staffRes] = await Promise.all([
                        window.supabase.from("buildings").select("*").ilike("name", `%${keyword}%`),
                        window.supabase.from("rooms").select("*").ilike("name", `%${keyword}%`),
                        window.supabase.from("staff").select("*").ilike("name", `%${keyword}%`)
                    ]);

                    const results = [
                        ...buildingsRes.data.map(b => ({ type: "Building", data: b })),
                        ...roomsRes.data.map(r => ({ type: "Room", data: r })),
                        ...staffRes.data.map(s => ({ type: "Staff", data: s }))
                    ];

                    if (!searchResults) return;

                    if (results.length === 0) {
                        searchResults.innerHTML = `<li class="list-group-item text-muted">No results found</li>`;
                        searchResults.style.display = "block";
                        return;
                    }

                    searchResults.innerHTML = results
                        .map(
                            (item, i) => `
                            <li class="list-group-item list-group-item-action" role="button" data-index="${i}">
                                <strong>${item.data.name}</strong> <small class="text-muted">(${item.type})</small>
                            </li>`
                        )
                        .join("");
                    searchResults.style.display = "block";

                    Array.from(searchResults.children).forEach((li, i) => {
                        li.addEventListener("click", async () => {
                            searchBar.value = results[i].data.name;
                            searchResults.style.display = "none";
                            await handleSearchResult(results[i]);
                        });
                    });
                } catch (err) {
                    console.error("Autocomplete failed:", err);
                }
            }, 300);
        });
    }

    document.addEventListener("click", (e) => {
        if (!e.target.closest("#searchBar") && !e.target.closest("#searchResults")) {
            if (searchResults) {
                searchResults.style.display = "none";
            }
        }
    });

})();