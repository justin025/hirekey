export function createMapListView(locationsData) {
    // Find the main container
    const mainContainer = document.querySelector('.main-container');
    if (!mainContainer) {
        console.error('No element with class "main-container" found');
        return;
    }

    // Create the complete HTML structure
    const appHTML = `
        <div class="container">
            <div id="map"></div>

            <div class="recruit-top-controls">
                <button id="recruit-search-toggle" class="recruit-control-btn recruit-icon-btn" type="button" aria-expanded="false" aria-controls="recruit-search-overlay" aria-label="Search location">
                    <span class="recruit-icon-glyph fa-solid" aria-hidden="true">&#xf002;</span>
                </button>

                <div class="view-toggle">
                    <button id="list-view-btn" class="toggle-btn active">List View</button>
                    <button id="map-view-btn" class="toggle-btn">Map View</button>
                </div>
            </div>

            <div id="recruit-search-overlay" class="recruit-search-overlay" aria-hidden="true">
                <button id="recruit-search-overlay-backdrop" class="recruit-search-overlay-backdrop" type="button" aria-label="Close search"></button>
                <form id="recruit-search-form" class="recruit-search-panel" role="search">
                    <input id="recruit-search-input" class="recruit-search-input" type="search" placeholder="Search location" maxlength="120" autocomplete="off">
                    <button class="recruit-search-submit" type="submit">Search</button>
                    <p id="recruit-search-status" class="recruit-search-status"></p>
                </form>
            </div>

            <div id="list-overlay" class="list-overlay active">
                <div class="list-header">
                    <h2>Recruits</h2>
                </div>
                <div id="status-message" class="status-message">Showing <span id="visible-count">0</span> of <span id="total-count">0</span> locations</div>
                <div id="markers-list"></div>
            </div>
        </div>
    `;

    // Insert the HTML into the main container
    mainContainer.innerHTML = appHTML;

    // Add Leaflet CSS and JS
    const leafletCSS = document.createElement('link');
    leafletCSS.rel = 'stylesheet';
    leafletCSS.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(leafletCSS);

    const leafletJS = document.createElement('script');
    leafletJS.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    document.head.appendChild(leafletJS);

    // Wait for Leaflet to load before initializing
    leafletJS.onload = function() {
        initializeApp(locationsData);
    };

    function initializeApp(locations) {
        // Initialize the map
        const map = L.map('map').setView([43.6532, -79.3832], 10);

        // Add tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        // Array to store markers
        const markers = [];
        const searchToggle = document.getElementById('recruit-search-toggle');
        const searchOverlay = document.getElementById('recruit-search-overlay');
        const searchOverlayBackdrop = document.getElementById('recruit-search-overlay-backdrop');
        const searchForm = document.getElementById('recruit-search-form');
        const searchInput = document.getElementById('recruit-search-input');
        const searchStatus = document.getElementById('recruit-search-status');

        // Function to create and add markers to the map
        function addMarkers() {
            locations.forEach((location, index) => {
                // Create popup content with photo
                const popupContent = `
                    <div class="popup-content">
                        <img src="${location.photo}" alt="${location.name}">
                        <div class="popup-info">
                            <div class="popup-name">${location.name}</div>
                            <div class="popup-desc"><strong>Industry:</strong> ${location.industry || ''}</div>
                            <div class="popup-desc"><strong>Education:</strong> ${location.education || ''}</div>
                            <button type="button" class="recruit-contact-btn">Contact</button>
                        </div>
                    </div>
                `;
                
                // Create marker with custom popup
                const marker = L.marker([location.latitude, location.longitude])
                    .addTo(map)
                    .bindPopup(popupContent, {
                        maxWidth: 300,
                        className: 'custom-popup'
                    });
                
                // Store marker with its index
                markers.push({
                    marker: marker,
                    location: location,
                    index: index
                });
            });
            
            // Update the status message with total count
            document.getElementById('total-count').textContent = locations.length;
        }

        // Function to update the list based on visible markers
        function updateMarkersList() {
            const markersList = document.getElementById('markers-list');
            const visibleCount = document.getElementById('visible-count');
            
            // Clear the current list
            markersList.innerHTML = '';
            
            // Get current map bounds
            const bounds = map.getBounds();
            
            // Filter markers that are within bounds
            const visibleMarkers = markers.filter(item => {
                return bounds.contains(item.marker.getLatLng());
            });
            
            // Update the count
            visibleCount.textContent = visibleMarkers.length;
            
            // Show empty message if no markers are visible
            if (visibleMarkers.length === 0) {
                const emptyMessage = document.createElement('div');
                emptyMessage.className = 'empty-message';
                emptyMessage.textContent = 'No locations in the current view. Try zooming out or panning the map.';
                markersList.appendChild(emptyMessage);
                return;
            }
            
            // Add visible markers to the list
            visibleMarkers.forEach(item => {
                const listItem = document.createElement('div');
                listItem.className = 'marker-item';
                listItem.innerHTML = `
                    <img src="${item.location.photo}" alt="${item.location.name}">
                    <div class="marker-info">
                        <div class="marker-name">${item.location.name}</div>
                        <div class="marker-desc"><strong>Industry:</strong> ${item.location.industry || ''}</div>
                        <div class="marker-desc"><strong>Education:</strong> ${item.location.education || ''}</div>
                        <button type="button" class="recruit-contact-btn">Contact</button>
                    </div>
                `;
                
                // Add click event to list item
                listItem.addEventListener('click', function(event) {
                    if (event.target instanceof HTMLElement && event.target.closest('.recruit-contact-btn')) {
                        return;
                    }
                    // Switch back to map view
                    showMapView();
                    
                    // Pan map to marker and open popup
                    map.setView([item.location.latitude, item.location.longitude], 15);
                    setTimeout(() => {
                        item.marker.openPopup();
                    }, 300);
                });
                
                // Add list item to the list
                markersList.appendChild(listItem);
            });
        }

        // Function to show map view
        function showMapView() {
            document.getElementById('list-overlay').classList.remove('active');
            document.getElementById('map-view-btn').classList.add('active');
            document.getElementById('list-view-btn').classList.remove('active');
            
            // Show zoom controls
            if (!map.zoomControl._map) {
                map.zoomControl.addTo(map);
            }
            
            // Refresh the map to ensure it displays correctly
            setTimeout(() => {
                map.invalidateSize();
            }, 100);
        }

        // Function to show list view
        function showListView() {
            document.getElementById('list-overlay').classList.add('active');
            document.getElementById('map-view-btn').classList.remove('active');
            document.getElementById('list-view-btn').classList.add('active');
            
            // Hide zoom controls
            if (map.zoomControl._map) {
                map.zoomControl.remove();
            }
            
            // Close any open popups
            map.closePopup();
            
            // Update the list with markers in the current viewport
            updateMarkersList();
        }

        // Initialize the app
        addMarkers();
        
        // Hide zoom controls initially (since list view is default)
        map.zoomControl.remove();
        
        // Update the list with markers in the current viewport
        updateMarkersList();
        
        // Set up event listeners
        document.getElementById('map-view-btn').addEventListener('click', showMapView);
        document.getElementById('list-view-btn').addEventListener('click', showListView);
        searchToggle.addEventListener('click', function() {
            setSearchOpen(true);
        });
        searchOverlayBackdrop.addEventListener('click', function() {
            setSearchOpen(false);
        });
        searchForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            await submitSearch();
        });
        mainContainer.addEventListener('click', function(event) {
            const target = event.target;
            if (!(target instanceof HTMLElement) || !target.classList.contains('recruit-contact-btn')) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            alert('Coming soon');
        });
        
        // Update the list when the map moves or zooms
        map.on('moveend', function() {
            if (document.getElementById('list-overlay').classList.contains('active')) {
                updateMarkersList();
            }
        });

        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape') {
                setSearchOpen(false);
            }
        });

        function setSearchOpen(isOpen) {
            searchOverlay.classList.toggle('is-open', isOpen);
            searchOverlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
            searchToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            if (isOpen) {
                setSearchStatus('');
                searchInput.focus();
                searchInput.select();
            }
        }

        function setSearchStatus(message) {
            searchStatus.textContent = message;
        }

        async function submitSearch() {
            const rawQuery = searchInput.value || '';
            const query = rawQuery.trim();
            if (query === '') {
                setSearchStatus('Enter a location.');
                return;
            }

            setSearchStatus('Searching...');

            try {
                const geocodeResult = await geocodeLocation(query);
                if (!geocodeResult) {
                    setSearchStatus('No location found.');
                    return;
                }

                showMapView();
                if (geocodeResult.bounds) {
                    map.fitBounds(geocodeResult.bounds, { padding: [24, 24], maxZoom: 13 });
                } else {
                    map.setView([geocodeResult.lat, geocodeResult.lng], 12);
                }

                setSearchOpen(false);
            } catch (_) {
                setSearchStatus('Search failed. Try again.');
            }
        }

        async function geocodeLocation(query) {
            const encodedQuery = encodeURIComponent(query);
            const geocodeURL = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ca&q=${encodedQuery}`;
            const response = await fetch(geocodeURL, {
                headers: {
                    Accept: 'application/json'
                }
            });
            if (!response.ok) {
                throw new Error(`Geocoder status ${response.status}`);
            }

            let payload = await response.json();
            if (!Array.isArray(payload) || payload.length === 0) {
                const globalURL = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodedQuery}`;
                const globalResponse = await fetch(globalURL, {
                    headers: {
                        Accept: 'application/json'
                    }
                });
                if (!globalResponse.ok) {
                    throw new Error(`Geocoder status ${globalResponse.status}`);
                }
                payload = await globalResponse.json();
            }
            if (!Array.isArray(payload) || payload.length === 0) {
                return null;
            }

            const topResult = payload[0];
            const lat = Number.parseFloat(topResult.lat);
            const lng = Number.parseFloat(topResult.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                return null;
            }

            return {
                lat: lat,
                lng: lng,
                bounds: parseNominatimBounds(topResult.boundingbox)
            };
        }

        function parseNominatimBounds(rawBounds) {
            if (!Array.isArray(rawBounds) || rawBounds.length < 4) {
                return null;
            }

            const south = Number.parseFloat(rawBounds[0]);
            const north = Number.parseFloat(rawBounds[1]);
            const west = Number.parseFloat(rawBounds[2]);
            const east = Number.parseFloat(rawBounds[3]);

            if (!Number.isFinite(south) || !Number.isFinite(north) || !Number.isFinite(west) || !Number.isFinite(east)) {
                return null;
            }

            return [[south, west], [north, east]];
        }
    }
}

export function drawPeopleTabsApp(peopleData) {
    // Add CSS to the document
    const style = document.createElement('style');
    style.textContent = `
        #map-view { height: 75vh; }
        .person-popup {
            position: fixed; bottom: 0; left: 0; width: 100%; height: 200px; display: none;
            background: white; padding: 20px; box-shadow: 0 -2px 10px rgba(0,0,0,0.2);
            display: flex; align-items: center; gap: 20px; box-sizing: border-box;
            transform: translateY(100%); transition: transform 0.3s ease-in-out;
            z-index: 10000;
        }
        .person-popup.show { display:block; transform: translateY(0); }
        .person-popup img { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
        .person-popup #popup-name { font-size: 1.2em; font-weight: bold; }
        .close-popup { position: absolute; top: 10px; right: 20px; font-size: 24px; cursor: pointer; color: #555; }
    `;
    document.head.appendChild(style);


    // Add Leaflet CSS and JS
    const leafletCSS = document.createElement('link');
    leafletCSS.rel = 'stylesheet';
    leafletCSS.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(leafletCSS);

    const leafletJS = document.createElement('script');
    leafletJS.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    document.head.appendChild(leafletJS);

    // Create main container with HTML using template literal
    const mainContainer = document.querySelector('.main-container');
    mainContainer.innerHTML = `
    <div class='main-container'>
        <h3 style="margin-left: 20px;">Recent</h3>
        <div class="tab-container">
            <input type="radio" id="posts-tab" name="main-tabs" checked>
            <input type="radio" id="about-tab" name="main-tabs">
            <div class="tab-nav">
                <label for="posts-tab" class="tab-label"><span class="tab-text">Newly Added</span></label>
                <label for="about-tab" class="tab-label"><span class="tab-text">Map View</span></label>
            </div>
            <div class="panels">
                <div class="panel" id="posts-panel">
                    <div class="container">
                        <div class="image-grid">
                            ${peopleData.map(person => `
                                <div class="grid-item">
                                    <img src="${person.photo}">
                                    <div class="image-label">${person.name}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="panel" id="about-panel">
                    <div id="map-view"></div>
                </div>
            </div>
        </div>
        <div id="person-popup" class="person-popup">
            <img id="popup-photo" src="" alt="">
            <div id="popup-name"></div>
            <span class="close-popup">&times;</span>
        </div>
    </div>
    `;

    // Wait for Leaflet to load before initializing
    leafletJS.onload = function() {
        initializeApp(peopleData);
    };

    function initializeApp(people) {
        // Get DOM elements
        const postsTab = document.getElementById('posts-tab');
        const aboutTab = document.getElementById('about-tab');
        const postsPanel = document.getElementById('posts-panel');
        const aboutPanel = document.getElementById('about-panel');
        const personPopup = document.getElementById('person-popup');
        const popupPhoto = document.getElementById('popup-photo');
        const popupName = document.getElementById('popup-name');

        // Tab switching functionality
        function switchPanel() {
            postsPanel.style.display = postsTab.checked ? 'block' : 'none';
            aboutPanel.style.display = aboutTab.checked ? 'block' : 'none';
            if (aboutTab.checked && !window.map) {
                initializeMap(people);
            }
        }

        postsTab.addEventListener('change', switchPanel);
        aboutTab.addEventListener('change', switchPanel);
        switchPanel(); // Initial call

        // Popup close functionality
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('close-popup')) {
                personPopup.classList.remove('show');
            }
        });
    }

    function initializeMap(people) {
        window.map = L.map('map-view').setView([51.505, -0.09], 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(window.map);

        people.forEach(person => {
            L.marker([person.latitude, person.longitude]).addTo(window.map).on('click', () => showPersonPopup(person));
        });
    }

    function showPersonPopup(person) {
        const popupPhoto = document.getElementById('popup-photo');
        const popupName = document.getElementById('popup-name');
        const personPopup = document.getElementById('person-popup');
        
        popupPhoto.src = person.photo;
        popupName.textContent = person.name;
        personPopup.classList.add('show');
    }
}
