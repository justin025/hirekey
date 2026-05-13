import { createMarketplaceListing, getMarketplaceListings } from './api.js';


const defaultListingImage = '/static/img/test-img.jpg';
const headerSearchInputSelector = '.top-nav .search-box, .mobile-header .mobile-search-box';
const marketplaceListLimit = 80;
const marketplaceTitleMaxChars = 240;
const marketplaceDescriptionMaxChars = 3000;

let marketplaceCreatePopupEscapeHandler = null;


export function drawMarketplacePage() {
    let mainContainer = document.querySelector('.main-container');
    if (!mainContainer) {
        mainContainer = document.createElement('div');
        mainContainer.className = 'main-container';
        document.body.appendChild(mainContainer);
    }

    mainContainer.innerHTML = `
        <section class="marketplace-page">
            <div class="marketplace-page-heading marketplace-page-heading-row">
                <div>
                    <h2>Marketplace</h2>
                    <p>Office and commercial rentals.</p>
                </div>
                <button id="marketplace-create-open" class="marketplace-create-open" type="button">Create Listing</button>
            </div>
            <p class="marketplace-status" id="marketplace-status">Loading listings...</p>
            <div class="marketplace-listings" id="marketplace-listings"></div>
        </section>

        <div id="marketplace-create-popup" class="marketplace-create-popup" hidden>
            <button id="marketplace-create-popup-backdrop" class="marketplace-create-popup-backdrop" type="button" aria-label="Close listing dialog"></button>
            <div class="marketplace-create-popup-card" role="dialog" aria-modal="true" aria-labelledby="marketplace-create-title">
                <div class="marketplace-create-popup-header">
                    <h3 id="marketplace-create-title">Create Marketplace Listing</h3>
                    <button id="marketplace-create-close" class="marketplace-create-close" type="button" aria-label="Close listing dialog">×</button>
                </div>
                <form id="marketplace-create-form" class="marketplace-create-form">
                    <label class="marketplace-create-field">
                        <span>Listing title</span>
                        <input id="marketplace-create-title-input" class="marketplace-create-input" type="text" name="title" maxlength="${marketplaceTitleMaxChars}" placeholder="Downtown Office Sublease - 2,100 sq ft" required>
                    </label>
                    <div class="marketplace-create-grid">
                        <label class="marketplace-create-field">
                            <span>Location</span>
                            <input id="marketplace-create-location-input" class="marketplace-create-input" type="text" name="location" maxlength="${marketplaceTitleMaxChars}" placeholder="Toronto, ON" required>
                        </label>
                        <label class="marketplace-create-field">
                            <span>Monthly rent (CAD)</span>
                            <input id="marketplace-create-price-input" class="marketplace-create-input" type="number" name="price" min="0" step="1" placeholder="7800" required>
                        </label>
                    </div>
                    <div class="marketplace-create-grid">
                        <label class="marketplace-create-field">
                            <span>Category</span>
                            <select id="marketplace-create-category-input" class="marketplace-create-select" name="category">
                                <option value="Office Space">Office Space</option>
                                <option value="Retail Lease">Retail Lease</option>
                                <option value="Industrial Lease">Industrial Lease</option>
                                <option value="Coworking">Coworking</option>
                                <option value="Mixed Commercial">Mixed Commercial</option>
                            </select>
                        </label>
                        <label class="marketplace-create-field">
                            <span>Lease type</span>
                            <select id="marketplace-create-condition-input" class="marketplace-create-select" name="condition">
                                <option value="For Lease">For Lease</option>
                                <option value="Sublease">Sublease</option>
                                <option value="For Rent">For Rent</option>
                            </select>
                        </label>
                    </div>
                    <label class="marketplace-create-field">
                        <span>Description</span>
                        <textarea id="marketplace-create-description-input" class="marketplace-create-textarea" name="description" maxlength="${marketplaceDescriptionMaxChars}" placeholder="Describe the space, lease terms, and available amenities." required></textarea>
                    </label>
                    <div class="marketplace-create-media-row">
                        <button id="marketplace-create-image-button" class="marketplace-create-media-button" type="button" disabled>Add image</button>
                        <button id="marketplace-create-video-button" class="marketplace-create-media-button" type="button" disabled>Add video</button>
                    </div>
                    <p id="marketplace-create-status" class="marketplace-create-status" aria-live="polite"></p>
                    <div class="marketplace-create-actions">
                        <button id="marketplace-create-cancel" class="marketplace-create-cancel" type="button">Cancel</button>
                        <button id="marketplace-create-submit" class="marketplace-create-submit" type="submit">Post Listing</button>
                    </div>
                </form>
            </div>
        </div>

        <div id="marketplace-detail-popup" class="marketplace-detail-popup" hidden>
            <button class="marketplace-detail-popup-backdrop marketplace-detail-popup-close" type="button" aria-label="Close listing details"></button>
            <div class="marketplace-detail-card" role="dialog" aria-modal="true" aria-labelledby="marketplace-detail-title">
                <button class="marketplace-detail-close marketplace-detail-popup-close" type="button" aria-label="Close listing details">×</button>
                <div class="marketplace-detail-gallery-shell">
                    <button id="marketplace-detail-prev" class="marketplace-detail-gallery-nav" type="button" aria-label="Previous image">‹</button>
                    <div id="marketplace-detail-gallery-track" class="marketplace-detail-gallery-track"></div>
                    <button id="marketplace-detail-next" class="marketplace-detail-gallery-nav" type="button" aria-label="Next image">›</button>
                </div>
                <p id="marketplace-detail-gallery-index" class="marketplace-detail-gallery-index"></p>
                <div class="marketplace-detail-content">
                    <h3 id="marketplace-detail-title" class="marketplace-detail-title"></h3>
                    <p id="marketplace-detail-price" class="marketplace-detail-price"></p>
                    <p id="marketplace-detail-location" class="marketplace-detail-meta"></p>
                    <p id="marketplace-detail-condition" class="marketplace-detail-meta"></p>
                    <p id="marketplace-detail-seller" class="marketplace-detail-meta"></p>
                    <p id="marketplace-detail-description" class="marketplace-detail-description"></p>
                    <div class="marketplace-detail-actions">
                        <button id="marketplace-detail-contact" class="marketplace-detail-contact" type="button">Contact Seller</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const statusElement = mainContainer.querySelector('#marketplace-status');
    const listingsElement = mainContainer.querySelector('#marketplace-listings');
    if (!statusElement || !listingsElement) {
        return;
    }

    const state = {
        listingsById: new Map(),
        activeListingID: ''
    };

    const popupRefs = {
        popup: mainContainer.querySelector('#marketplace-detail-popup'),
        galleryTrack: mainContainer.querySelector('#marketplace-detail-gallery-track'),
        galleryIndex: mainContainer.querySelector('#marketplace-detail-gallery-index'),
        title: mainContainer.querySelector('#marketplace-detail-title'),
        price: mainContainer.querySelector('#marketplace-detail-price'),
        location: mainContainer.querySelector('#marketplace-detail-location'),
        condition: mainContainer.querySelector('#marketplace-detail-condition'),
        seller: mainContainer.querySelector('#marketplace-detail-seller'),
        description: mainContainer.querySelector('#marketplace-detail-description'),
        prevButton: mainContainer.querySelector('#marketplace-detail-prev'),
        nextButton: mainContainer.querySelector('#marketplace-detail-next'),
        contactButton: mainContainer.querySelector('#marketplace-detail-contact')
    };

    bindMarketplaceDetailPopup(mainContainer, listingsElement, state, popupRefs);
    renderMarketplaceLoading(listingsElement, state, popupRefs);

    const initialQuery = sanitizeQuery(new URLSearchParams(window.location.search).get('q') || '');
    bindHeaderSearchInputs(statusElement, listingsElement, state, popupRefs, initialQuery);
    bindMarketplaceCreatePopup(mainContainer, statusElement, listingsElement, state, popupRefs);
    void loadMarketplaceListings(initialQuery, statusElement, listingsElement, state, popupRefs);
}


function bindHeaderSearchInputs(statusElement, listingsElement, state, popupRefs, initialQuery) {
    const headerInputs = Array.from(document.querySelectorAll(headerSearchInputSelector));
    if (headerInputs.length === 0) {
        return;
    }

    syncHeaderSearchInputs(headerInputs, initialQuery);

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
            void loadMarketplaceListings(query, statusElement, listingsElement, state, popupRefs);
        });
    });
}


function syncHeaderSearchInputs(headerInputs, value) {
    const normalizedValue = sanitizeQuery(value);
    for (const inputElement of headerInputs) {
        inputElement.value = normalizedValue;
    }
}


async function loadMarketplaceListings(query, statusElement, listingsElement, state, popupRefs) {
    const normalizedQuery = sanitizeQuery(query);
    updateMarketplaceURL(normalizedQuery);

    if (normalizedQuery === '') {
        statusElement.textContent = 'Loading latest listings...';
    } else {
        statusElement.textContent = `Loading listings for "${normalizedQuery}"...`;
    }
    renderMarketplaceLoading(listingsElement, state, popupRefs);

    try {
        const payload = await getMarketplaceListings(normalizedQuery, marketplaceListLimit);
        const listings = normalizeMarketplaceListings(Array.isArray(payload?.listings) ? payload.listings : []);
        renderMarketplaceListings(listingsElement, listings, state, popupRefs);

        if (listings.length === 0) {
            if (normalizedQuery === '') {
                statusElement.textContent = 'No listings available yet.';
            } else {
                statusElement.textContent = `No listings found for "${normalizedQuery}".`;
            }
            return;
        }

        const plural = listings.length === 1 ? 'listing' : 'listings';
        if (normalizedQuery === '') {
            statusElement.textContent = `${listings.length} ${plural} available.`;
            return;
        }
        statusElement.textContent = `${listings.length} ${plural} matching "${normalizedQuery}".`;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load listings.';
        statusElement.textContent = `Marketplace load failed: ${message}`;
        renderMarketplaceListings(listingsElement, [], state, popupRefs);
    }
}


function renderMarketplaceLoading(container, state, popupRefs) {
    if (!(container instanceof HTMLElement)) {
        return;
    }

    if (state && typeof state === 'object') {
        state.listingsById = new Map();
        state.activeListingID = '';
    }
    if (popupRefs && popupRefs.popup) {
        closeMarketplaceDetailPopup(popupRefs.popup);
    }

    container.innerHTML = `
        <article class="marketplace-card marketplace-loading-card" aria-hidden="true">
            <div class="marketplace-card-image marketplace-loading-media loading-skeleton"></div>
            <div class="marketplace-card-content marketplace-loading-content">
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-wide"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-medium"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-wide"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-short"></div>
            </div>
        </article>
        <article class="marketplace-card marketplace-loading-card" aria-hidden="true">
            <div class="marketplace-card-image marketplace-loading-media loading-skeleton"></div>
            <div class="marketplace-card-content marketplace-loading-content">
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-wide"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-medium"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-wide"></div>
            </div>
        </article>
        <article class="marketplace-card marketplace-loading-card" aria-hidden="true">
            <div class="marketplace-card-image marketplace-loading-media loading-skeleton"></div>
            <div class="marketplace-card-content marketplace-loading-content">
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-wide"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-medium"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-wide"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-short"></div>
            </div>
        </article>
    `;
}


function renderMarketplaceListings(container, listings, state, popupRefs) {
    container.innerHTML = '';
    state.listingsById = new Map();
    state.activeListingID = '';
    closeMarketplaceDetailPopup(popupRefs.popup);

    if (!Array.isArray(listings) || listings.length === 0) {
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const listing of listings) {
        if (listing.id !== '') {
            state.listingsById.set(listing.id, listing);
        }
        fragment.appendChild(buildMarketplaceCard(listing));
    }

    container.appendChild(fragment);
}


function prependMarketplaceListing(container, listing, state) {
    if (!(container instanceof HTMLElement)) {
        return;
    }

    if (listing && listing.id !== '') {
        state.listingsById.set(listing.id, listing);
    }

    const card = buildMarketplaceCard(listing);
    if (container.firstChild) {
        container.prepend(card);
        return;
    }
    container.appendChild(card);
}


function buildMarketplaceCard(listing) {
    const card = document.createElement('article');
    card.className = 'marketplace-card';
    card.dataset.listingId = listing.id || '';

    const image = document.createElement('img');
    image.className = 'marketplace-card-image';
    image.src = getPrimaryListingImage(listing);
    image.alt = `${listing.title || 'Marketplace listing'} image`;
    image.loading = 'lazy';
    image.onerror = () => {
        image.onerror = null;
        image.src = defaultListingImage;
    };

    const content = document.createElement('div');
    content.className = 'marketplace-card-content';

    const title = document.createElement('h3');
    title.className = 'marketplace-card-title';
    title.textContent = listing.title || 'Untitled Listing';

    const price = document.createElement('p');
    price.className = 'marketplace-card-price';
    price.textContent = formatListingPrice(listing.price, listing.currency);

    const location = document.createElement('p');
    location.className = 'marketplace-card-meta';
    location.textContent = `${listing.location} • ${listing.category}`;

    const condition = document.createElement('p');
    condition.className = 'marketplace-card-meta';
    condition.textContent = listing.condition;

    const sellerName = formatSellerName(listing.sellerFirstName, listing.sellerLastName, listing.sellerUsername);
    const seller = document.createElement('p');
    seller.className = 'marketplace-card-seller';
    seller.textContent = `Seller: ${sellerName}`;

    const description = document.createElement('p');
    description.className = 'marketplace-card-description';
    description.textContent = listing.description;

    const actions = document.createElement('div');
    actions.className = 'marketplace-card-actions';

    const contactButton = document.createElement('button');
    contactButton.type = 'button';
    contactButton.className = 'marketplace-card-contact';
    contactButton.textContent = 'Contact Seller';
    contactButton.addEventListener('click', (event) => {
        event.stopPropagation();
        window.alert('Direct contact flow coming soon.');
    });

    actions.appendChild(contactButton);

    content.appendChild(title);
    content.appendChild(price);
    content.appendChild(location);
    content.appendChild(condition);
    content.appendChild(seller);
    content.appendChild(description);
    content.appendChild(actions);

    card.appendChild(image);
    card.appendChild(content);
    return card;
}


function bindMarketplaceCreatePopup(mainContainer, statusElement, listingsElement, state, popupRefs) {
    const openButton = mainContainer.querySelector('#marketplace-create-open');
    const popup = mainContainer.querySelector('#marketplace-create-popup');
    const backdrop = mainContainer.querySelector('#marketplace-create-popup-backdrop');
    const closeButton = mainContainer.querySelector('#marketplace-create-close');
    const cancelButton = mainContainer.querySelector('#marketplace-create-cancel');
    const form = mainContainer.querySelector('#marketplace-create-form');
    const titleInput = mainContainer.querySelector('#marketplace-create-title-input');
    const descriptionInput = mainContainer.querySelector('#marketplace-create-description-input');
    const priceInput = mainContainer.querySelector('#marketplace-create-price-input');
    const locationInput = mainContainer.querySelector('#marketplace-create-location-input');
    const categoryInput = mainContainer.querySelector('#marketplace-create-category-input');
    const conditionInput = mainContainer.querySelector('#marketplace-create-condition-input');
    const imageButton = mainContainer.querySelector('#marketplace-create-image-button');
    const videoButton = mainContainer.querySelector('#marketplace-create-video-button');
    const submitButton = mainContainer.querySelector('#marketplace-create-submit');
    const status = mainContainer.querySelector('#marketplace-create-status');
    if (!openButton || !popup || !backdrop || !closeButton || !cancelButton || !form || !titleInput || !descriptionInput || !priceInput || !locationInput || !categoryInput || !conditionInput || !submitButton || !status) {
        return;
    }

    if (imageButton instanceof HTMLButtonElement) {
        imageButton.disabled = true;
    }
    if (videoButton instanceof HTMLButtonElement) {
        videoButton.disabled = true;
    }

    popup.hidden = true;
    popup.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('marketplace-create-popup-open');

    const setCreateStatus = (message, isError) => {
        status.textContent = message;
        status.classList.toggle('is-error', Boolean(isError));
    };

    const closePopup = () => {
        popup.hidden = true;
        popup.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('marketplace-create-popup-open');
    };

    const openPopup = () => {
        popup.hidden = false;
        popup.setAttribute('aria-hidden', 'false');
        document.body.classList.add('marketplace-create-popup-open');
        setCreateStatus('', false);
        titleInput.focus();
    };

    const resetCreateForm = () => {
        form.reset();
        setCreateStatus('', false);
    };

    const setFormDisabled = (isDisabled) => {
        const controls = Array.from(form.elements);
        controls.forEach((element) => {
            if (element instanceof HTMLButtonElement && element.id === 'marketplace-create-cancel') {
                return;
            }
            element.disabled = Boolean(isDisabled);
        });
        cancelButton.disabled = false;
        if (imageButton instanceof HTMLButtonElement) {
            imageButton.disabled = true;
        }
        if (videoButton instanceof HTMLButtonElement) {
            videoButton.disabled = true;
        }
    };

    const closeButtons = [backdrop, closeButton, cancelButton];
    closeButtons.forEach((button) => {
        button.addEventListener('click', () => {
            closePopup();
        });
    });

    openButton.addEventListener('click', () => {
        openPopup();
    });

    if (marketplaceCreatePopupEscapeHandler) {
        document.removeEventListener('keydown', marketplaceCreatePopupEscapeHandler);
        marketplaceCreatePopupEscapeHandler = null;
    }
    marketplaceCreatePopupEscapeHandler = (event) => {
        if (event.key !== 'Escape' || popup.hidden) {
            return;
        }
        closePopup();
    };
    document.addEventListener('keydown', marketplaceCreatePopupEscapeHandler);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        setCreateStatus('Creating listing...', false);
        setFormDisabled(true);

        try {
            const title = sanitizeText(titleInput.value).slice(0, marketplaceTitleMaxChars);
            const description = sanitizeText(descriptionInput.value).slice(0, marketplaceDescriptionMaxChars);
            const location = sanitizeText(locationInput.value).slice(0, marketplaceTitleMaxChars);
            const category = sanitizeText(categoryInput.value).slice(0, marketplaceTitleMaxChars);
            const condition = sanitizeText(conditionInput.value).slice(0, marketplaceTitleMaxChars);
            const price = normalizePositiveInt(priceInput.value);

            if (title === '' || description === '' || location === '' || category === '' || condition === '') {
                throw new Error('Complete all required listing fields.');
            }

            const response = await createMarketplaceListing({
                title: title,
                description: description,
                price: price,
                currency: 'CAD',
                location: location,
                category: category,
                condition: condition,
                image_url: '',
                image_urls: []
            });

            const normalizedListings = normalizeMarketplaceListings([response?.listing]);
            const createdListing = normalizedListings.length > 0 ? normalizedListings[0] : null;
            if (!createdListing || createdListing.id === '') {
                throw new Error('Listing creation failed.');
            }

            prependMarketplaceListing(listingsElement, createdListing, state);
            closeMarketplaceDetailPopup(popupRefs.popup);
            statusElement.textContent = 'Listing created.';
            resetCreateForm();
            closePopup();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to create listing.';
            setCreateStatus(message, true);
        } finally {
            setFormDisabled(false);
        }
    });
}


function bindMarketplaceDetailPopup(mainContainer, listingsElement, state, popupRefs) {
    const popup = popupRefs.popup;
    if (!popup || !listingsElement) {
        return;
    }

    const closeButtons = Array.from(mainContainer.querySelectorAll('.marketplace-detail-popup-close'));
    closeButtons.forEach((button) => {
        button.addEventListener('click', () => {
            closeMarketplaceDetailPopup(popup);
            state.activeListingID = '';
        });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || popup.hidden) {
            return;
        }
        closeMarketplaceDetailPopup(popup);
        state.activeListingID = '';
    });

    listingsElement.addEventListener('click', (event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target) {
            return;
        }

        const card = target.closest('.marketplace-card');
        if (!card) {
            return;
        }

        const listingID = sanitizeText(card.getAttribute('data-listing-id') || '');
        if (listingID === '') {
            return;
        }

        const listing = state.listingsById.get(listingID);
        if (!listing) {
            return;
        }

        state.activeListingID = listingID;
        fillMarketplaceDetailPopup(listing, popupRefs);
        popup.hidden = false;
        document.body.classList.add('marketplace-detail-popup-open');
    });

    if (popupRefs.prevButton && popupRefs.galleryTrack) {
        popupRefs.prevButton.addEventListener('click', () => {
            scrollMarketplaceGallery(popupRefs.galleryTrack, -1);
        });
    }
    if (popupRefs.nextButton && popupRefs.galleryTrack) {
        popupRefs.nextButton.addEventListener('click', () => {
            scrollMarketplaceGallery(popupRefs.galleryTrack, 1);
        });
    }
    if (popupRefs.galleryTrack && popupRefs.galleryIndex) {
        popupRefs.galleryTrack.addEventListener('scroll', () => {
            updateMarketplaceGalleryIndex(popupRefs.galleryTrack, popupRefs.galleryIndex);
        });
    }
    if (popupRefs.contactButton) {
        popupRefs.contactButton.addEventListener('click', () => {
            window.alert('Direct contact flow coming soon.');
        });
    }
}


function fillMarketplaceDetailPopup(listing, popupRefs) {
    if (popupRefs.title) {
        popupRefs.title.textContent = listing.title || 'Untitled Listing';
    }
    if (popupRefs.price) {
        popupRefs.price.textContent = formatListingPrice(listing.price, listing.currency);
    }
    if (popupRefs.location) {
        popupRefs.location.innerHTML = `<strong>Location:</strong> ${escapeHTML(listing.location)} • ${escapeHTML(listing.category)}`;
    }
    if (popupRefs.condition) {
        popupRefs.condition.innerHTML = `<strong>Lease Type:</strong> ${escapeHTML(listing.condition)}`;
    }
    if (popupRefs.seller) {
        const sellerName = formatSellerName(listing.sellerFirstName, listing.sellerLastName, listing.sellerUsername);
        popupRefs.seller.innerHTML = `<strong>Listed By:</strong> ${escapeHTML(sellerName)}`;
    }
    if (popupRefs.description) {
        popupRefs.description.textContent = listing.description;
    }

    if (!popupRefs.galleryTrack) {
        return;
    }

    const images = getListingImageSet(listing);
    popupRefs.galleryTrack.innerHTML = '';
    images.forEach((imageURL, index) => {
        const image = document.createElement('img');
        image.className = 'marketplace-detail-gallery-image';
        image.src = imageURL;
        image.alt = `${listing.title || 'Listing'} image ${index + 1}`;
        image.loading = 'lazy';
        image.onerror = () => {
            image.onerror = null;
            image.src = defaultListingImage;
        };
        popupRefs.galleryTrack.appendChild(image);
    });

    popupRefs.galleryTrack.scrollTo({
        left: 0,
        top: 0,
        behavior: 'auto'
    });
    if (popupRefs.galleryIndex) {
        updateMarketplaceGalleryIndex(popupRefs.galleryTrack, popupRefs.galleryIndex);
    }
}


function closeMarketplaceDetailPopup(popup) {
    if (!(popup instanceof HTMLElement)) {
        return;
    }
    popup.hidden = true;
    document.body.classList.remove('marketplace-detail-popup-open');
}


function scrollMarketplaceGallery(trackElement, direction) {
    if (!(trackElement instanceof HTMLElement)) {
        return;
    }
    const width = trackElement.clientWidth || 1;
    trackElement.scrollBy({
        left: width * direction,
        top: 0,
        behavior: 'smooth'
    });
}


function updateMarketplaceGalleryIndex(trackElement, indexElement) {
    if (!(trackElement instanceof HTMLElement) || !(indexElement instanceof HTMLElement)) {
        return;
    }

    const total = trackElement.children.length;
    if (total === 0) {
        indexElement.textContent = '';
        return;
    }

    const width = trackElement.clientWidth || 1;
    const index = Math.round(trackElement.scrollLeft / width);
    const visibleIndex = Math.max(0, Math.min(total - 1, index)) + 1;
    indexElement.textContent = `${visibleIndex} / ${total}`;
}


function normalizeMarketplaceListings(listings) {
    if (!Array.isArray(listings)) {
        return [];
    }

    const normalizedListings = [];
    for (const rawListing of listings) {
        normalizedListings.push({
            id: sanitizeText(rawListing?._id || rawListing?.id),
            profileID: sanitizeText(rawListing?.profile_id),
            sellerUsername: sanitizeText(rawListing?.seller_username),
            sellerFirstName: sanitizeText(rawListing?.seller_first_name),
            sellerLastName: sanitizeText(rawListing?.seller_last_name),
            title: sanitizeText(rawListing?.title),
            description: sanitizeText(rawListing?.description),
            price: normalizePositiveInt(rawListing?.price),
            currency: sanitizeText(rawListing?.currency),
            location: sanitizeText(rawListing?.location),
            category: sanitizeText(rawListing?.category),
            condition: sanitizeText(rawListing?.condition),
            imageURL: sanitizeText(rawListing?.image_url),
            imageURLs: normalizeImageURLArray(rawListing?.image_urls),
            createdTime: normalizePositiveInt(rawListing?.created_time)
        });
    }

    return normalizedListings;
}


function getListingImageSet(listing) {
    const imageURLs = Array.isArray(listing?.imageURLs) ? listing.imageURLs.filter((entry) => sanitizeText(entry) !== '') : [];
    if (imageURLs.length > 0) {
        return imageURLs;
    }

    const primaryImage = sanitizeText(listing?.imageURL);
    if (primaryImage !== '') {
        return [primaryImage];
    }

    return [defaultListingImage];
}


function getPrimaryListingImage(listing) {
    const images = getListingImageSet(listing);
    if (images.length === 0) {
        return defaultListingImage;
    }
    return images[0];
}


function formatSellerName(firstName, lastName, username) {
    const fullName = [sanitizeText(firstName), sanitizeText(lastName)].filter(Boolean).join(' ');
    if (fullName !== '') {
        return fullName;
    }

    const normalizedUsername = sanitizeText(username);
    if (normalizedUsername !== '') {
        return `@${normalizedUsername}`;
    }

    return 'Unknown';
}


function formatListingPrice(price, currency) {
    const normalizedPrice = normalizePositiveInt(price);
    const normalizedCurrency = sanitizeText(currency).toUpperCase() || 'CAD';
    if (normalizedPrice <= 0) {
        return `Contact for price (${normalizedCurrency})`;
    }

    return `${normalizedCurrency} ${normalizedPrice.toLocaleString()}`;
}


function updateMarketplaceURL(query) {
    const basePath = '/marketplace';
    if (query === '') {
        window.history.replaceState({}, '', basePath);
        return;
    }

    const params = new URLSearchParams();
    params.set('q', query);
    window.history.replaceState({}, '', `${basePath}?${params.toString()}`);
}


function sanitizeText(value) {
    return String(value || '').trim();
}


function sanitizeQuery(value) {
    const raw = String(value || '');
    return raw.trim().replace(/\s+/g, ' ').slice(0, 240);
}


function normalizePositiveInt(value) {
    const parsed = Number.parseInt(String(value || '0'), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return 0;
    }
    return parsed;
}


function normalizeImageURLArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    const normalized = [];
    for (const rawEntry of value) {
        const imageURL = sanitizeText(rawEntry);
        if (imageURL === '') {
            continue;
        }
        normalized.push(imageURL);
        if (normalized.length >= 12) {
            break;
        }
    }
    return normalized;
}


function escapeHTML(value) {
    const text = String(value || '');
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
