import { getEvents, toggleEventRsvp } from './api.js';


const defaultEventImage = '/static/img/test-img.jpg';
const defaultEventLimit = 100;
const headerSearchInputSelector = '.top-nav .search-box, .mobile-header .mobile-search-box';


export function drawEventsPage() {
    let mainContainer = document.querySelector('.main-container');
    if (!mainContainer) {
        mainContainer = document.createElement('div');
        mainContainer.className = 'main-container';
        document.body.appendChild(mainContainer);
    }

    mainContainer.innerHTML = `
        <section class="events-page">
            <p class="events-page-status" id="events-page-status">Loading events...</p>
            <div class="events-page-results search-page-events" id="events-page-results"></div>
        </section>
        <div class="event-detail-popup events-page-popup" id="events-page-popup" hidden>
            <button class="event-detail-backdrop events-page-popup-close" type="button" aria-label="Close event details"></button>
            <div class="event-detail-card" role="dialog" aria-modal="true" aria-labelledby="events-page-popup-title">
                <button class="event-detail-close events-page-popup-close" type="button" aria-label="Close event details">×</button>
                <img class="event-detail-image" id="events-page-popup-image" alt="Event image" />
                <div class="event-detail-content">
                    <h3 class="event-detail-title" id="events-page-popup-title"></h3>
                    <p class="event-detail-meta" id="events-page-popup-datetime"></p>
                    <p class="event-detail-meta" id="events-page-popup-location"></p>
                    <p class="event-detail-meta" id="events-page-popup-team"></p>
                    <p class="event-detail-description" id="events-page-popup-description"></p>
                    <p class="event-detail-contact" id="events-page-popup-contact-name"></p>
                    <p class="event-detail-contact" id="events-page-popup-contact-email"></p>
                    <p class="event-detail-contact" id="events-page-popup-contact-phone"></p>
                    <p class="event-detail-rsvp-count" id="events-page-popup-rsvp-count"></p>
                    <div class="event-detail-actions">
                        <button class="event-detail-rsvp-button" id="events-page-popup-rsvp-button" type="button">RSVP</button>
                        <button class="event-detail-travel-button" id="events-page-popup-travel-button" type="button">Book Travel Accomidations</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const statusElement = mainContainer.querySelector('#events-page-status');
    const resultsElement = mainContainer.querySelector('#events-page-results');
    if (!statusElement || !resultsElement) {
        return;
    }

    const state = {
        eventsById: new Map(),
        activeEventId: '',
        activeQuery: ''
    };

    const popupRefs = {
        popup: mainContainer.querySelector('#events-page-popup'),
        popupImage: mainContainer.querySelector('#events-page-popup-image'),
        popupTitle: mainContainer.querySelector('#events-page-popup-title'),
        popupDatetime: mainContainer.querySelector('#events-page-popup-datetime'),
        popupLocation: mainContainer.querySelector('#events-page-popup-location'),
        popupTeam: mainContainer.querySelector('#events-page-popup-team'),
        popupDescription: mainContainer.querySelector('#events-page-popup-description'),
        popupContactName: mainContainer.querySelector('#events-page-popup-contact-name'),
        popupContactEmail: mainContainer.querySelector('#events-page-popup-contact-email'),
        popupContactPhone: mainContainer.querySelector('#events-page-popup-contact-phone'),
        popupRsvpCount: mainContainer.querySelector('#events-page-popup-rsvp-count'),
        popupRsvpButton: mainContainer.querySelector('#events-page-popup-rsvp-button'),
        popupTravelButton: mainContainer.querySelector('#events-page-popup-travel-button')
    };

    document.body.classList.remove('event-detail-popup-open');
    if (popupRefs.popup) {
        popupRefs.popup.hidden = true;
    }

    renderEventsLoading(resultsElement);

    initEventsPopupHandlers(resultsElement, state, popupRefs);

    const initialQuery = sanitizeQuery(new URLSearchParams(window.location.search).get('q') || '');
    bindHeaderSearchInputs(statusElement, resultsElement, state, popupRefs, initialQuery);

    void loadEvents(initialQuery, statusElement, resultsElement, state, popupRefs);
}


function bindHeaderSearchInputs(statusElement, resultsElement, state, popupRefs, initialQuery) {
    const headerInputs = Array.from(document.querySelectorAll(headerSearchInputSelector));
    if (headerInputs.length === 0) {
        return;
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
            const query = sanitizeQuery(headerInput.value);
            syncHeaderSearchInputs(headerInputs, query);
            void loadEvents(query, statusElement, resultsElement, state, popupRefs);
        });
    });
}


function syncHeaderSearchInputs(headerInputs, value) {
    const normalizedValue = sanitizeQuery(value);
    for (const inputElement of headerInputs) {
        inputElement.value = normalizedValue;
    }
}


async function loadEvents(query, statusElement, resultsElement, state, popupRefs) {
    const normalizedQuery = sanitizeQuery(query);
    state.activeQuery = normalizedQuery;
    updateEventsURL(normalizedQuery);

    if (normalizedQuery === '') {
        statusElement.textContent = 'Loading upcoming events...';
    } else {
        statusElement.textContent = `Loading events for "${normalizedQuery}"...`;
    }
    renderEventsLoading(resultsElement);

    try {
        const payload = await getEvents(normalizedQuery, defaultEventLimit);
        const events = sortEventsByDate(normalizeEvents(Array.isArray(payload?.events) ? payload.events : []));
        renderEvents(resultsElement, events, state, popupRefs);

        if (events.length === 0) {
            if (normalizedQuery === '') {
                statusElement.textContent = 'No events available yet.';
            } else {
                statusElement.textContent = `No events found for "${normalizedQuery}".`;
            }
            return;
        }

        const plural = events.length === 1 ? 'event' : 'events';
        if (normalizedQuery === '') {
            statusElement.textContent = `${events.length} ${plural}, sorted by date.`;
        } else {
            statusElement.textContent = `${events.length} ${plural} matching "${normalizedQuery}", sorted by date.`;
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load events.';
        statusElement.textContent = `Event load failed: ${message}`;
        renderEvents(resultsElement, [], state, popupRefs);
    }
}


function renderEventsLoading(container) {
    if (!(container instanceof HTMLElement)) {
        return;
    }

    container.innerHTML = `
        <article class="search-event-card event-loading-card" aria-hidden="true">
            <div class="search-event-image event-loading-image loading-skeleton"></div>
            <div class="search-event-content event-loading-content">
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-wide"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-medium"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-wide"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-short"></div>
            </div>
        </article>
        <article class="search-event-card event-loading-card" aria-hidden="true">
            <div class="search-event-image event-loading-image loading-skeleton"></div>
            <div class="search-event-content event-loading-content">
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-wide"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-medium"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-wide"></div>
            </div>
        </article>
        <article class="search-event-card event-loading-card" aria-hidden="true">
            <div class="search-event-image event-loading-image loading-skeleton"></div>
            <div class="search-event-content event-loading-content">
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-wide"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-medium"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-wide"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-short"></div>
            </div>
        </article>
    `;
}


function renderEvents(container, events, state, popupRefs) {
    container.innerHTML = '';
    state.eventsById = new Map();
    state.activeEventId = '';
    closeEventsPopup(popupRefs.popup);

    if (!Array.isArray(events) || events.length === 0) {
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const event of events) {
        if (event.id !== '') {
            state.eventsById.set(event.id, event);
        }
        fragment.appendChild(buildEventCard(event));
    }

    container.appendChild(fragment);
}


function buildEventCard(event) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `search-event-card${event.id === '' ? ' is-disabled' : ''}${event.isRsvped ? ' is-rsvped' : ''}`;
    card.dataset.eventId = event.id;
    card.disabled = event.id === '';

    const image = document.createElement('img');
    image.className = 'search-event-image';
    image.src = event.eventImage || defaultEventImage;
    image.alt = `${event.eventTitle || 'Event'} image`;
    image.loading = 'lazy';
    image.onerror = () => {
        image.onerror = null;
        image.src = defaultEventImage;
    };

    const content = document.createElement('div');
    content.className = 'search-event-content';

    const title = document.createElement('h4');
    title.className = 'search-event-title';
    title.textContent = event.eventTitle || 'Untitled Event';

    const dateLine = document.createElement('p');
    dateLine.className = 'search-event-meta';
    dateLine.innerHTML = `<strong>Date:</strong> ${escapeHTML(event.date)}${event.time ? ` at ${escapeHTML(event.time)}` : ''}`;

    const locationLine = document.createElement('p');
    locationLine.className = 'search-event-meta';
    locationLine.innerHTML = `<strong>Location:</strong> ${escapeHTML(event.location)}`;

    const teamLine = document.createElement('p');
    teamLine.className = 'search-event-meta';
    teamLine.innerHTML = `<strong>Team:</strong> ${escapeHTML(event.team)}`;

    const description = document.createElement('p');
    description.className = 'search-event-description';
    description.textContent = event.eventDescription;

    const rsvpCount = document.createElement('p');
    rsvpCount.className = 'search-event-rsvp-count';
    rsvpCount.textContent = formatRsvpCount(event.rsvpCount);

    content.appendChild(title);
    content.appendChild(dateLine);
    content.appendChild(locationLine);
    content.appendChild(teamLine);
    if (event.eventDescription !== '') {
        content.appendChild(description);
    }
    content.appendChild(rsvpCount);

    card.appendChild(image);
    card.appendChild(content);
    return card;
}


function initEventsPopupHandlers(eventsElement, state, popupRefs) {
    const popup = popupRefs.popup;
    if (!popup || !eventsElement) {
        return;
    }

    const popupCloseButtons = Array.from(popup.querySelectorAll('.events-page-popup-close'));
    popupCloseButtons.forEach((button) => {
        button.addEventListener('click', () => {
            closeEventsPopup(popup);
            state.activeEventId = '';
        });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') {
            return;
        }
        if (popup.hidden) {
            return;
        }
        closeEventsPopup(popup);
        state.activeEventId = '';
    });

    eventsElement.addEventListener('click', (event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target) {
            return;
        }

        const card = target.closest('.search-event-card');
        if (!card || !(card instanceof HTMLButtonElement)) {
            return;
        }

        const eventId = normalizeRelId(card.dataset.eventId || '');
        if (eventId === '') {
            return;
        }

        const eventData = state.eventsById.get(eventId);
        if (!eventData) {
            return;
        }

        state.activeEventId = eventId;
        fillEventsPopup(eventData, popupRefs);
        popup.hidden = false;
        document.body.classList.add('event-detail-popup-open');
    });

    if (popupRefs.popupTravelButton) {
        popupRefs.popupTravelButton.addEventListener('click', () => {
            window.alert('Travel accommodation booking coming soon.');
        });
    }

    if (!popupRefs.popupRsvpButton) {
        return;
    }

    popupRefs.popupRsvpButton.addEventListener('click', async () => {
        if (popupRefs.popupRsvpButton.classList.contains('is-loading')) {
            return;
        }

        const eventId = normalizeRelId(state.activeEventId);
        if (eventId === '') {
            return;
        }

        const eventData = state.eventsById.get(eventId);
        if (!eventData) {
            return;
        }

        popupRefs.popupRsvpButton.classList.add('is-loading');
        try {
            const response = await toggleEventRsvp(eventId);
            eventData.isRsvped = Boolean(response?.is_rsvped);
            eventData.rsvpCount = normalizePositiveInt(response?.rsvp_count);

            updateEventCardState(eventsElement, eventData);
            fillEventsPopup(eventData, popupRefs);
        } catch (_) {
        } finally {
            popupRefs.popupRsvpButton.classList.remove('is-loading');
        }
    });
}


function fillEventsPopup(event, popupRefs) {
    if (popupRefs.popupImage) {
        popupRefs.popupImage.src = event.eventImage || defaultEventImage;
        popupRefs.popupImage.alt = `${event.eventTitle || 'Event'} image`;
        popupRefs.popupImage.onerror = () => {
            popupRefs.popupImage.onerror = null;
            popupRefs.popupImage.src = defaultEventImage;
        };
    }
    if (popupRefs.popupTitle) {
        popupRefs.popupTitle.textContent = event.eventTitle || 'Untitled Event';
    }
    if (popupRefs.popupDatetime) {
        popupRefs.popupDatetime.innerHTML = `<strong>Date:</strong> ${escapeHTML(event.date)}${event.time ? ` at ${escapeHTML(event.time)}` : ''}`;
    }
    if (popupRefs.popupLocation) {
        popupRefs.popupLocation.innerHTML = `<strong>Location:</strong> ${escapeHTML(event.location)}`;
    }
    if (popupRefs.popupTeam) {
        popupRefs.popupTeam.innerHTML = `<strong>Team:</strong> ${escapeHTML(event.team)}`;
    }
    if (popupRefs.popupDescription) {
        popupRefs.popupDescription.textContent = event.eventDescription;
    }
    if (popupRefs.popupContactName) {
        popupRefs.popupContactName.innerHTML = `<strong>Contact:</strong> ${escapeHTML(event.contactName || 'N/A')}`;
    }
    if (popupRefs.popupContactEmail) {
        popupRefs.popupContactEmail.innerHTML = `<strong>Email:</strong> ${escapeHTML(event.contactEmail || 'N/A')}`;
    }
    if (popupRefs.popupContactPhone) {
        popupRefs.popupContactPhone.innerHTML = `<strong>Phone:</strong> ${escapeHTML(event.contactPhone || 'N/A')}`;
    }
    if (popupRefs.popupRsvpCount) {
        popupRefs.popupRsvpCount.textContent = formatRsvpCount(event.rsvpCount);
    }
    if (popupRefs.popupRsvpButton) {
        popupRefs.popupRsvpButton.textContent = event.isRsvped ? "RSVP'd" : 'RSVP';
        popupRefs.popupRsvpButton.classList.toggle('is-active', event.isRsvped);
    }
}


function updateEventCardState(eventsElement, event) {
    const card = eventsElement.querySelector(`.search-event-card[data-event-id="${event.id}"]`);
    if (!card) {
        return;
    }

    const countElement = card.querySelector('.search-event-rsvp-count');
    if (countElement) {
        countElement.textContent = formatRsvpCount(event.rsvpCount);
    }
    card.classList.toggle('is-rsvped', event.isRsvped);
}


function closeEventsPopup(popup) {
    if (!popup) {
        return;
    }

    popup.hidden = true;
    document.body.classList.remove('event-detail-popup-open');
}


function normalizeEvents(events) {
    const normalizedEvents = [];
    for (const rawEvent of events) {
        const eventId = normalizeRelId(rawEvent?._id || rawEvent?.id || rawEvent?.Id || rawEvent?.ID);
        normalizedEvents.push({
            id: eventId,
            location: sanitizeText(rawEvent?.location),
            time: sanitizeText(rawEvent?.time),
            date: sanitizeText(rawEvent?.date),
            team: sanitizeText(rawEvent?.team),
            eventImage: sanitizeText(rawEvent?.event_image) || defaultEventImage,
            eventTitle: sanitizeText(rawEvent?.event_title),
            eventDescription: sanitizeText(rawEvent?.event_description),
            contactName: sanitizeText(rawEvent?.contact_name),
            contactEmail: sanitizeText(rawEvent?.contact_email),
            contactPhone: sanitizeText(rawEvent?.contact_phone),
            rsvpCount: normalizePositiveInt(rawEvent?.rsvp_count),
            isRsvped: Boolean(rawEvent?.is_rsvped)
        });
    }
    return normalizedEvents;
}


function sortEventsByDate(events) {
    const sortableEvents = Array.isArray(events) ? [...events] : [];
    sortableEvents.sort((left, right) => {
        const leftTimestamp = parseEventTimestamp(left.date, left.time);
        const rightTimestamp = parseEventTimestamp(right.date, right.time);

        if (leftTimestamp !== rightTimestamp) {
            return leftTimestamp - rightTimestamp;
        }

        const leftTitle = sanitizeText(left.eventTitle).toLowerCase();
        const rightTitle = sanitizeText(right.eventTitle).toLowerCase();
        if (leftTitle < rightTitle) {
            return -1;
        }
        if (leftTitle > rightTitle) {
            return 1;
        }

        return 0;
    });

    return sortableEvents;
}


function parseEventTimestamp(dateValue, timeValue) {
    const normalizedDate = sanitizeText(dateValue);
    const dateMatch = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) {
        return Number.MAX_SAFE_INTEGER;
    }

    const year = Number.parseInt(dateMatch[1], 10);
    const month = Number.parseInt(dateMatch[2], 10);
    const day = Number.parseInt(dateMatch[3], 10);

    let hour = 0;
    let minute = 0;
    const normalizedTime = sanitizeText(timeValue);
    if (normalizedTime !== '') {
        const timeMatch = normalizedTime.match(/^(\d{1,2}):(\d{2})(?:\s*([APMapm]{2}))?$/);
        if (timeMatch) {
            hour = Number.parseInt(timeMatch[1], 10);
            minute = Number.parseInt(timeMatch[2], 10);
            const meridiem = sanitizeText(timeMatch[3]).toUpperCase();
            if (meridiem === 'PM' && hour < 12) {
                hour += 12;
            }
            if (meridiem === 'AM' && hour === 12) {
                hour = 0;
            }
        }
    }

    const parsed = new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
    if (!Number.isFinite(parsed)) {
        return Number.MAX_SAFE_INTEGER;
    }

    return parsed;
}


function updateEventsURL(query) {
    const basePath = '/events';
    if (query === '') {
        window.history.replaceState({}, '', basePath);
        return;
    }

    const params = new URLSearchParams();
    params.set('q', query);
    window.history.replaceState({}, '', `${basePath}?${params.toString()}`);
}


function sanitizeText(value) {
    const raw = String(value || '');
    return raw.trim();
}


function sanitizeQuery(value) {
    const raw = String(value || '');
    return raw.trim().replace(/\s+/g, ' ').slice(0, 240);
}


function normalizeRelId(value) {
    if (typeof value === 'string') {
        return value.trim();
    }

    if (value && typeof value === 'object') {
        if (typeof value.$oid === 'string') {
            return value.$oid.trim();
        }
        if (typeof value.id === 'string') {
            return value.id.trim();
        }
    }

    return '';
}


function normalizePositiveInt(value) {
    const parsed = Number.parseInt(String(value || '0'), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return 0;
    }
    return parsed;
}


function formatRsvpCount(value) {
    const count = normalizePositiveInt(value);
    const suffix = count === 1 ? ' RSVP' : ' RSVPs';
    return `${count}${suffix}`;
}


function escapeHTML(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
