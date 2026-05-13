import { searchProfiles } from './api.js';


const defaultProfilePicture = '/static/img/test-img.jpg';
const headerSearchInputSelector = '.top-nav .search-box, .mobile-header .mobile-search-box';
const recentSearchStorageKey = 'hirkey_recent_profile_searches_v1';
const recentSearchLimit = 12;


export function drawSearchPage() {
    let mainContainer = document.querySelector('.main-container');
    if (!mainContainer) {
        mainContainer = document.createElement('div');
        mainContainer.className = 'main-container';
        document.body.appendChild(mainContainer);
    }

    mainContainer.innerHTML = `
        <section class="search-page">
            <p class="search-page-status" id="search-page-status"></p>
            <div class="search-page-results" id="search-page-results"></div>
            <h3 class="search-page-section-title">Recent Searches</h3>
            <p class="search-page-recent-status" id="search-page-recent-status"></p>
            <div class="search-page-recent" id="search-page-recent"></div>
        </section>
    `;

    const statusElement = document.getElementById('search-page-status');
    const resultsElement = document.getElementById('search-page-results');
    const recentStatusElement = document.getElementById('search-page-recent-status');
    const recentElement = document.getElementById('search-page-recent');

    if (!statusElement || !resultsElement || !recentStatusElement || !recentElement) {
        return;
    }

    const state = {
        statusElement,
        resultsElement,
        recentStatusElement,
        recentElement,
        headerInputs: []
    };

    const initialQuery = sanitizeClientQuery(new URLSearchParams(window.location.search).get('q') || '');
    state.headerInputs = bindHeaderSearchInputs(state, initialQuery);

    if (initialQuery !== '') {
        void runSearch(initialQuery, state);
        return;
    }

    renderSearchResults(resultsElement, []);
    updateSearchStatus(statusElement, '');
    updateSearchURL('');
    renderRecentSearches(state);
}


async function runSearch(query, state) {
    const normalizedQuery = sanitizeClientQuery(query);
    syncHeaderSearchInputs(state.headerInputs, normalizedQuery);

    if (normalizedQuery === '') {
        renderSearchResults(state.resultsElement, []);
        updateSearchStatus(state.statusElement, '');
        updateSearchURL('');
        renderRecentSearches(state);
        return;
    }

    if (countSearchQueryCharacters(normalizedQuery) < 3) {
        renderSearchResults(state.resultsElement, []);
        updateSearchStatus(state.statusElement, 'Enter at least 3 characters to search.');
        updateSearchURL(normalizedQuery);
        renderRecentSearches(state);
        return;
    }

    updateSearchStatus(state.statusElement, `Searching for "${normalizedQuery}"...`);
    updateSearchURL(normalizedQuery);

    try {
        const payload = await searchProfiles(normalizedQuery);
        const results = Array.isArray(payload?.results) ? payload.results : [];
        renderSearchResults(state.resultsElement, results);

        if (results.length === 0) {
            updateSearchStatus(state.statusElement, `No profiles found for "${normalizedQuery}".`);
        } else {
            const plural = results.length === 1 ? 'profile' : 'profiles';
            updateSearchStatus(state.statusElement, `Found ${results.length} ${plural} for "${normalizedQuery}".`);
        }

        addRecentSearch(normalizedQuery);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to search profiles.';
        updateSearchStatus(state.statusElement, `Search failed: ${message}`);
        renderSearchResults(state.resultsElement, []);
    }

    renderRecentSearches(state);
}


function renderSearchResults(container, results) {
    if (!container) {
        return;
    }

    container.innerHTML = '';
    if (!Array.isArray(results) || results.length === 0) {
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const profile of results) {
        fragment.appendChild(buildSearchResultCard(profile));
    }
    container.appendChild(fragment);
}


function buildSearchResultCard(profile) {
    const username = sanitizeClientQuery(profile?.username || '');
    const firstName = sanitizeClientQuery(profile?.first_name || '');
    const lastName = sanitizeClientQuery(profile?.last_name || '');
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    const profilePictureURL = sanitizeClientQuery(profile?.profile_picture_url || '') || defaultProfilePicture;

    const card = document.createElement('article');
    card.className = 'search-result-card';

    const image = document.createElement('img');
    image.className = 'search-result-avatar';
    image.src = profilePictureURL;
    image.alt = `${username || fullName || 'Profile'} avatar`;
    image.loading = 'lazy';
    image.onerror = () => {
        image.onerror = null;
        image.src = defaultProfilePicture;
    };

    const content = document.createElement('div');
    content.className = 'search-result-content';

    const nameLine = document.createElement('a');
    nameLine.className = 'search-result-name';
    nameLine.href = `/profile/${encodeURIComponent(username)}`;
    nameLine.textContent = fullName || username || 'Unknown User';

    const usernameLine = document.createElement('p');
    usernameLine.className = 'search-result-username';
    usernameLine.textContent = username ? `@${username}` : '@unknown';

    content.appendChild(nameLine);
    content.appendChild(usernameLine);
    card.appendChild(image);
    card.appendChild(content);
    return card;
}


function bindHeaderSearchInputs(state, initialQuery) {
    const headerInputs = Array.from(document.querySelectorAll(headerSearchInputSelector));
    if (headerInputs.length === 0) {
        updateSearchStatus(state.statusElement, 'Search input unavailable on this view.');
        return [];
    }

    if (initialQuery !== '') {
        syncHeaderSearchInputs(headerInputs, initialQuery);
    }

    headerInputs.forEach((headerInput) => {
        headerInput.addEventListener('input', () => {
            syncHeaderSearchInputs(headerInputs, headerInput.value);
        });

        headerInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') {
                return;
            }

            event.preventDefault();
            const query = sanitizeClientQuery(headerInput.value);
            void runSearch(query, state);
        });
    });

    return headerInputs;
}


function syncHeaderSearchInputs(headerInputs, value) {
    const normalizedValue = sanitizeClientQuery(value);
    for (const inputElement of headerInputs) {
        inputElement.value = normalizedValue;
    }
}


function renderRecentSearches(state) {
    const recentSearches = getRecentSearches();
    state.recentElement.innerHTML = '';

    if (recentSearches.length === 0) {
        state.recentStatusElement.textContent = 'No recent searches yet.';
        return;
    }

    state.recentStatusElement.textContent = '';

    const fragment = document.createDocumentFragment();
    for (const query of recentSearches) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'search-page-recent-item';
        button.textContent = query;
        button.addEventListener('click', () => {
            void runSearch(query, state);
        });
        fragment.appendChild(button);
    }

    state.recentElement.appendChild(fragment);
}


function getRecentSearches() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return [];
    }

    try {
        const rawValue = window.localStorage.getItem(recentSearchStorageKey);
        if (!rawValue) {
            return [];
        }

        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed)) {
            return [];
        }

        const normalized = [];
        const seen = new Set();
        for (const entry of parsed) {
            const value = sanitizeClientQuery(entry);
            if (value === '') {
                continue;
            }
            const key = value.toLowerCase();
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            normalized.push(value);
            if (normalized.length >= recentSearchLimit) {
                break;
            }
        }

        return normalized;
    } catch (_) {
        return [];
    }
}


function addRecentSearch(query) {
    const normalizedQuery = sanitizeClientQuery(query);
    if (normalizedQuery === '') {
        return;
    }
    if (typeof window === 'undefined' || !window.localStorage) {
        return;
    }

    const existingEntries = getRecentSearches();
    const mergedEntries = [normalizedQuery];
    const normalizedKey = normalizedQuery.toLowerCase();

    for (const entry of existingEntries) {
        if (entry.toLowerCase() === normalizedKey) {
            continue;
        }
        mergedEntries.push(entry);
        if (mergedEntries.length >= recentSearchLimit) {
            break;
        }
    }

    try {
        window.localStorage.setItem(recentSearchStorageKey, JSON.stringify(mergedEntries));
    } catch (_) {
    }
}


function updateSearchStatus(element, text) {
    if (!element) {
        return;
    }
    element.textContent = text;
}


function updateSearchURL(query) {
    const basePath = '/search';
    if (query === '') {
        window.history.replaceState({}, '', basePath);
        return;
    }
    const params = new URLSearchParams();
    params.set('q', query);
    window.history.replaceState({}, '', `${basePath}?${params.toString()}`);
}


function sanitizeClientQuery(value) {
    const raw = String(value || '');
    return raw.trim().replace(/\s+/g, ' ').slice(0, 240);
}


function countSearchQueryCharacters(value) {
    const normalized = String(value || '').trim();
    if (normalized === '') {
        return 0;
    }

    return normalized.replace(/\s/g, '').length;
}
