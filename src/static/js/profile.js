import { addBlock, addFollow, createReport, getFollowStates, getPost, getStories, removeFollow, toggleEventRsvp } from './api.js';
import { drawPost, initPostCommentButtons, initPostLikeButtons, initPostMediaAudioToggles, initPostMoreMenus, initPostShareButtons, initPostViewTracking } from './post.js';
import { formatCompactCount, formatCountHoverTitle, normalizeCount } from './number_format.js';


const defaultEventImage = '/static/img/test-img.jpg';
const defaultStoryMediaImage = '/static/img/test-img.jpg';
const profilePostFetchSize = 10;
const profileScrollLoadThresholdRatio = 0.8;
const profileStoryDurationMs = 10000;
const interactionSoundLikeSrc = '/static/audio/like.mp3';
const interactionSoundUnlikeSrc = '/static/audio/unlike.mp3';

const profilePostPaginationState = {
    profileID: '',
    offset: 0,
    isLoading: false,
    hasMore: true,
    loadedPostIDs: new Set()
};

const profileActionPopupState = {
    root: null,
    status: null,
    closeButtons: []
};

const profileStoryState = {
    root: null,
    media: null,
    text: null,
    progressFill: null,
    closeButtons: [],
    animationFrameID: 0,
    closeDeadlineMs: 0,
    profileID: '',
    fallbackMediaURL: ''
};

let profilePostScrollHandler = null;
let profileActionPopupEscapeBound = false;
let profileStoryEscapeBound = false;
let likeInteractionAudio = null;
let unlikeInteractionAudio = null;


export function drawProfile(profileData, postData, eventData, profileOptions = {}) {
    const postsHtml = (postData || []).map((post) => drawPost(post)).join('');
    const detailsHtml = (profileData.Details || []).map((detail) => {
        let icon = '';
        switch (detail.Type) {
            case 'career':
                icon = '';
                break;
            case 'education':
                icon = '';
                break;
            case 'location':
                icon = '';
                break;
        }
        return `
            <tr>
                <td><span style="color: gray; margin-right: 10px; text-align: center;" class="fa-solid">${icon}</span></td>
                <td><span>${escapeHTML(detail.Desc || '')}</span></td>
            </tr>
        `;
    }).join('');

    const normalizedEvents = normalizeEvents(eventData);
    const eventsHtml = normalizedEvents.map((event) => buildProfileEventCard(event)).join('');

    const followRelId = normalizeRelId(profileData.Id || profileData.ID || profileData._id);
    const profileID = normalizeRelId(profileData.Id || profileData.ID || profileData._id);
    const followersCount = normalizePositiveInt(profileData.Followers);
    const followersDisplay = formatCompactCount(followersCount);
    const followersTitle = formatCountHoverTitle('follower', followersCount);
    const profileUsername = sanitizeUsername(profileData.Username || profileData.username);
    const currentUsername = sanitizeUsername(profileOptions.currentUsername);
    const isOwnProfile = profileUsername !== '' && profileUsername.toLowerCase() === currentUsername.toLowerCase();
    const hasActiveStory = profileData?.HasActiveStory === true || profileData?.has_active_story === true;
    const followDisabledClass = followRelId === '' ? ' is-disabled' : '';
    const postsPanelHtml = postsHtml === '' ? '<p class="profile-events-empty">No posts yet.</p>' : postsHtml;
    const eventsPanelHtml = eventsHtml === '' ? '<p class="profile-events-empty">No RSVP events yet.</p>' : `<div class="profile-events-list">${eventsHtml}</div>`;

    let mainContainer = document.querySelector('.main-container');
    if (!mainContainer) {
        mainContainer = document.createElement('div');
        mainContainer.className = 'main-container';
        document.body.appendChild(mainContainer);
    }
    closeProfileStoryView();

    const bannerEditButtonHtml = isOwnProfile ? `
        <button type="button" class="profile-image-edit-button profile-banner-edit-button fa-solid" data-image-target="banner" aria-label="Edit banner image"></button>
    ` : '';
    const avatarEditButtonHtml = isOwnProfile ? `
        <button type="button" class="profile-image-edit-button profile-avatar-edit-button fa-solid" data-image-target="avatar" aria-label="Edit profile picture"></button>
    ` : '';
    const imageEditorPopupHtml = isOwnProfile ? `
        <div class="profile-image-popup" id="profile-image-popup" hidden>
            <button class="profile-image-popup-backdrop profile-image-popup-close" type="button" aria-label="Close image editor"></button>
            <section class="profile-image-popup-card" role="dialog" aria-modal="true" aria-labelledby="profile-image-popup-title">
                <header class="profile-image-popup-header">
                    <h3 id="profile-image-popup-title">Update Profile Image</h3>
                    <button type="button" class="profile-image-popup-close-button profile-image-popup-close" aria-label="Close image editor">×</button>
                </header>
                <form class="profile-image-popup-form" id="profile-image-popup-form">
                    <label class="profile-image-popup-field">
                        <span>Image target</span>
                        <select id="profile-image-popup-target" class="profile-image-popup-input">
                            <option value="avatar">Profile picture</option>
                            <option value="banner">Profile banner</option>
                        </select>
                    </label>
                    <label class="profile-image-popup-field">
                        <span>Image URL</span>
                        <input id="profile-image-popup-url" class="profile-image-popup-input" type="url" placeholder="https://example.com/image.jpg">
                    </label>
                    <p class="profile-image-popup-note">Image update logic coming soon.</p>
                    <div class="profile-image-popup-actions">
                        <button type="button" class="profile-image-popup-cancel profile-image-popup-close">Cancel</button>
                        <button type="submit" class="profile-image-popup-submit">Save</button>
                    </div>
                </form>
            </section>
        </div>
    ` : '';
    const storyPopupHtml = `
        <div class="profile-story-view" id="profile-story-view" hidden>
            <section class="profile-story-card" role="dialog" aria-modal="true" aria-label="Story view">
                <header class="profile-story-header">
                    <div class="profile-story-progress-track" aria-hidden="true">
                        <div class="profile-story-progress-fill"></div>
                    </div>
                    <button type="button" class="profile-story-close profile-story-close-trigger" aria-label="Close story view">×</button>
                </header>
                <img class="profile-story-media" id="profile-story-media" alt="Story media">
                <p class="profile-story-text" id="profile-story-text"></p>
            </section>
        </div>
    `;

    mainContainer.innerHTML = `
            <div class="profile-banner-shell">
                <img src="${escapeHTML(profileData.ProfileBannerURL || '')}" class="banner-image" />
                ${bannerEditButtonHtml}
            </div>
            <div class="white-container">
                <div class="profile-container">
                    <div class="profile-avatar-shell${hasActiveStory ? ' has-story' : ''}">
                        <img src="${escapeHTML(profileData.ProfilePictureURL || '')}" class="rounded-image${hasActiveStory ? ' rounded-image-has-story' : ''}" />
                        ${avatarEditButtonHtml}
                    </div>
                    <div class="profile-data">
                        <h2>${escapeHTML(profileData.FirstName || '')} ${escapeHTML(profileData.LastName || '')}</h2>
                        <span><strong class="profile-followers-count" data-count="${followersCount}" title="${escapeHTML(followersTitle)}">${escapeHTML(followersDisplay)}</strong> Followers</span>
                        <p>${escapeHTML(profileData.ShortDescription || '')}</p>
                        <div class="profile-action-row">
                            <button class="fill-button profile-follow-button profile-follow-fill${followDisabledClass}" data-rel-id="${followRelId}" type="button">Follow</button>
                            <div class="profile-more-menu-shell">
                            <button class="fixed-button fa-solid profile-more-toggle" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Profile actions"></button>
                                <div class="profile-more-menu" hidden>
                                    <button type="button" class="profile-more-menu-item" data-profile-action="message">Message</button>
                                    <button type="button" class="profile-more-menu-item" data-profile-action="copy-link">Copy link</button>
                                    <button type="button" class="profile-more-menu-item profile-more-menu-item-danger" data-profile-action="report">Report</button>
                                    <button type="button" class="profile-more-menu-item profile-more-menu-item-danger" data-profile-action="block">Block</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <hr />

                <div class="tab-container">
                    <input type="radio" id="posts-tab" name="main-tabs" checked>
                    <input type="radio" id="about-tab" name="main-tabs">
                    <input type="radio" id="events-tab" name="main-tabs">

                    <div class="tab-nav tab-nav-three">
                        <label for="posts-tab" class="tab-label">
                            <span class="tab-text">Posts</span>
                        </label>
                        <label for="about-tab" class="tab-label">
                            <span class="tab-text">About</span>
                        </label>
                        <label for="events-tab" class="tab-label">
                            <span class="tab-text">Events</span>
                        </label>
                    </div>

                    <div class="panels">
                        <div class="panel" id="posts-panel">
                            ${postsPanelHtml}
                        </div>

                        <div class="panel about-panel" id="about-panel">
                            <h3>Details</h3>
                            <table>
                                ${detailsHtml}
                            </table>
                            <h3>Description</h3>
                            <p>${escapeHTML(profileData.LongDescription || '')}</p>
                            <h3>Profile Information</h3>
                            <p>Profile Created on Feburary 11, 2004</p>
                        </div>

                        <div class="panel" id="events-panel">
                            ${eventsPanelHtml}
                        </div>
                    </div>
                </div>
            </div>
            ${imageEditorPopupHtml}
            ${storyPopupHtml}
            <div class="event-detail-popup profile-event-popup" id="profile-event-popup" hidden>
                <button class="event-detail-backdrop profile-event-popup-close" type="button" aria-label="Close event details"></button>
                <div class="event-detail-card" role="dialog" aria-modal="true" aria-labelledby="profile-event-title">
                    <button class="event-detail-close profile-event-popup-close" type="button" aria-label="Close event details">×</button>
                    <img class="event-detail-image" id="profile-event-image" alt="Event image" />
                    <div class="event-detail-content">
                        <h3 class="event-detail-title" id="profile-event-title"></h3>
                        <p class="event-detail-meta" id="profile-event-datetime"></p>
                        <p class="event-detail-meta" id="profile-event-location"></p>
                        <p class="event-detail-meta" id="profile-event-team"></p>
                        <p class="event-detail-description" id="profile-event-description"></p>
                        <p class="event-detail-contact" id="profile-event-contact-name"></p>
                        <p class="event-detail-contact" id="profile-event-contact-email"></p>
                        <p class="event-detail-contact" id="profile-event-contact-phone"></p>
                        <p class="event-detail-rsvp-count" id="profile-event-rsvp-count"></p>
                        <div class="event-detail-actions">
                            <button class="event-detail-rsvp-button" id="profile-event-rsvp-button" type="button">RSVP</button>
                            <button class="event-detail-travel-button" id="profile-event-travel-button" type="button">Book Travel Accomidations</button>
                        </div>
                    </div>
                </div>
            </div>
    `;

    document.body.classList.remove('event-detail-popup-open');
    document.body.classList.remove('profile-story-open');
    const profileEventPopup = mainContainer.querySelector('#profile-event-popup');
    if (profileEventPopup) {
        profileEventPopup.hidden = true;
    }

    initPostLikeButtons(mainContainer);
    initPostCommentButtons(mainContainer);
    initPostMoreMenus(mainContainer);
    initPostShareButtons(mainContainer);
    initPostMediaAudioToggles(mainContainer);
    initPostViewTracking(mainContainer);
    initProfileFollowButton(mainContainer);
    initProfileActionMenu(mainContainer, profileUsername, profileID);
    initProfileImageEditor(mainContainer, isOwnProfile);
    initProfileStoryView(mainContainer, profileID, hasActiveStory, sanitizeText(profileData.ProfilePictureURL));
    initProfileEventCards(mainContainer, normalizedEvents);
    initProfilePostInfiniteScroll(mainContainer, profileID, postData || []);
}


function initProfileStoryView(root, profileID, hasActiveStory, fallbackMediaURL) {
    const storyRoot = root.querySelector('#profile-story-view');
    const storyMedia = root.querySelector('#profile-story-media');
    const storyText = root.querySelector('#profile-story-text');
    const progressFill = root.querySelector('.profile-story-progress-fill');
    const closeButtons = storyRoot ? Array.from(storyRoot.querySelectorAll('.profile-story-close-trigger')) : [];

    profileStoryState.root = storyRoot;
    profileStoryState.media = storyMedia;
    profileStoryState.text = storyText;
    profileStoryState.progressFill = progressFill;
    profileStoryState.closeButtons = closeButtons;
    profileStoryState.profileID = normalizeRelId(profileID);
    profileStoryState.fallbackMediaURL = sanitizeText(fallbackMediaURL);

    if (!storyRoot || !storyMedia || !storyText || !progressFill) {
        return;
    }

    closeButtons.forEach((button) => {
        button.addEventListener('click', () => {
            closeProfileStoryView();
        });
    });

    if (!profileStoryEscapeBound) {
        profileStoryEscapeBound = true;
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') {
                return;
            }
            closeProfileStoryView();
        });
    }

    if (hasActiveStory !== true) {
        return;
    }

    const avatarShell = root.querySelector('.profile-avatar-shell.has-story');
    const avatarImage = root.querySelector('.rounded-image-has-story');
    if (!avatarShell || !avatarImage) {
        return;
    }

    avatarImage.classList.add('profile-story-avatar-trigger');
    avatarImage.setAttribute('role', 'button');
    avatarImage.setAttribute('tabindex', '0');
    avatarImage.setAttribute('aria-label', 'Open story');

    const openStoryView = async () => {
        if (avatarImage.classList.contains('is-loading')) {
            return;
        }
        if (profileStoryState.profileID === '') {
            return;
        }

        avatarImage.classList.add('is-loading');
        try {
            const response = await getStories(profileStoryState.profileID, 1);
            const stories = Array.isArray(response?.stories) ? response.stories : [];
            if (stories.length === 0) {
                showProfileActionPopup('No active story found.', true);
                return;
            }

            const story = normalizeProfileStoryEntry(stories[0], profileStoryState.fallbackMediaURL);
            openProfileStoryView(story);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to load story.';
            showProfileActionPopup(message, true);
        } finally {
            avatarImage.classList.remove('is-loading');
        }
    };

    avatarImage.addEventListener('click', () => {
        void openStoryView();
    });
    avatarImage.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }
        event.preventDefault();
        void openStoryView();
    });
}


function normalizeProfileStoryEntry(rawStory, fallbackMediaURL) {
    const storyID = normalizeRelId(rawStory?._id || rawStory?.id || rawStory?.Id || rawStory?.ID);
    const storyText = sanitizeText(rawStory?.story_text || rawStory?.storyText);
    const storyMediaURL = sanitizeText(rawStory?.story_media_url || rawStory?.storyMediaURL);
    const resolvedStoryMediaURL = storyMediaURL || sanitizeText(fallbackMediaURL) || defaultStoryMediaImage;

    return {
        id: storyID,
        storyText,
        storyMediaURL: resolvedStoryMediaURL
    };
}


function openProfileStoryView(story) {
    const storyRoot = profileStoryState.root;
    const storyMedia = profileStoryState.media;
    const storyText = profileStoryState.text;
    const progressFill = profileStoryState.progressFill;
    if (!storyRoot || !storyMedia || !storyText || !progressFill) {
        return;
    }

    const mediaURL = sanitizeText(story?.storyMediaURL) || profileStoryState.fallbackMediaURL || defaultStoryMediaImage;
    storyMedia.src = mediaURL;
    storyMedia.onerror = () => {
        storyMedia.onerror = null;
        storyMedia.src = defaultStoryMediaImage;
    };

    storyText.textContent = sanitizeText(story?.storyText);
    progressFill.style.width = '100%';

    storyRoot.hidden = false;
    storyRoot.setAttribute('aria-hidden', 'false');
    document.body.classList.add('profile-story-open');

    startProfileStoryTimer();
}


function startProfileStoryTimer() {
    const progressFill = profileStoryState.progressFill;
    const storyRoot = profileStoryState.root;
    if (!progressFill || !storyRoot) {
        return;
    }

    cancelProfileStoryTimer();
    profileStoryState.closeDeadlineMs = performance.now() + profileStoryDurationMs;

    const tick = (nowMs) => {
        const activeRoot = profileStoryState.root;
        const activeProgressFill = profileStoryState.progressFill;
        if (!activeRoot || !activeProgressFill || activeRoot.hidden) {
            cancelProfileStoryTimer();
            return;
        }

        const remainingMs = Math.max(0, profileStoryState.closeDeadlineMs - nowMs);
        const remainingRatio = remainingMs / profileStoryDurationMs;
        activeProgressFill.style.width = `${remainingRatio * 100}%`;

        if (remainingMs <= 0) {
            closeProfileStoryView();
            return;
        }

        profileStoryState.animationFrameID = window.requestAnimationFrame(tick);
    };

    profileStoryState.animationFrameID = window.requestAnimationFrame(tick);
}


function cancelProfileStoryTimer() {
    if (profileStoryState.animationFrameID > 0) {
        window.cancelAnimationFrame(profileStoryState.animationFrameID);
        profileStoryState.animationFrameID = 0;
    }
}


function closeProfileStoryView() {
    cancelProfileStoryTimer();
    if (!profileStoryState.root) {
        document.body.classList.remove('profile-story-open');
        return;
    }

    profileStoryState.root.hidden = true;
    profileStoryState.root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('profile-story-open');
}


function initProfileEventCards(root, events) {
    const eventMap = new Map();
    for (const event of events) {
        if (event.id === '') {
            continue;
        }
        eventMap.set(event.id, event);
    }

    const popup = root.querySelector('#profile-event-popup');
    const popupCloseButtons = popup ? Array.from(popup.querySelectorAll('.profile-event-popup-close')) : [];
    const popupImage = root.querySelector('#profile-event-image');
    const popupTitle = root.querySelector('#profile-event-title');
    const popupDatetime = root.querySelector('#profile-event-datetime');
    const popupLocation = root.querySelector('#profile-event-location');
    const popupTeam = root.querySelector('#profile-event-team');
    const popupDescription = root.querySelector('#profile-event-description');
    const popupContactName = root.querySelector('#profile-event-contact-name');
    const popupContactEmail = root.querySelector('#profile-event-contact-email');
    const popupContactPhone = root.querySelector('#profile-event-contact-phone');
    const popupRsvpCount = root.querySelector('#profile-event-rsvp-count');
    const popupRsvpButton = root.querySelector('#profile-event-rsvp-button');
    const popupTravelButton = root.querySelector('#profile-event-travel-button');

    let activeEventId = '';

    const cards = Array.from(root.querySelectorAll('.profile-event-card'));
    cards.forEach((card) => {
        if (card.dataset.eventBound === 'true') {
            return;
        }
        card.dataset.eventBound = 'true';

        card.addEventListener('click', () => {
            const eventId = normalizeRelId(card.dataset.eventId || '');
            if (eventId === '') {
                return;
            }

            const event = eventMap.get(eventId);
            if (!event || !popup) {
                return;
            }

            activeEventId = eventId;
            fillProfileEventPopup(event, {
                popupImage,
                popupTitle,
                popupDatetime,
                popupLocation,
                popupTeam,
                popupDescription,
                popupContactName,
                popupContactEmail,
                popupContactPhone,
                popupRsvpCount,
                popupRsvpButton
            });

            popup.hidden = false;
            document.body.classList.add('event-detail-popup-open');
        });
    });

    popupCloseButtons.forEach((button) => {
        button.addEventListener('click', () => {
            closeProfileEventPopup(popup);
            activeEventId = '';
        });
    });

    if (popup) {
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') {
                return;
            }
            if (popup.hidden) {
                return;
            }
            closeProfileEventPopup(popup);
            activeEventId = '';
        });
    }

    if (!popupRsvpButton) {
        return;
    }

    if (popupTravelButton) {
        popupTravelButton.addEventListener('click', () => {
            window.alert('Travel accommodation booking coming soon.');
        });
    }

    popupRsvpButton.addEventListener('click', async () => {
        if (popupRsvpButton.classList.contains('is-loading')) {
            return;
        }

        const eventId = normalizeRelId(activeEventId);
        if (eventId === '') {
            return;
        }

        const activeEvent = eventMap.get(eventId);
        if (!activeEvent) {
            return;
        }

        popupRsvpButton.classList.add('is-loading');
        try {
            const response = await toggleEventRsvp(eventId);
            activeEvent.isRsvped = Boolean(response?.is_rsvped);
            activeEvent.rsvpCount = normalizePositiveInt(response?.rsvp_count);
            updateProfileEventCardState(root, activeEvent);
            fillProfileEventPopup(activeEvent, {
                popupImage,
                popupTitle,
                popupDatetime,
                popupLocation,
                popupTeam,
                popupDescription,
                popupContactName,
                popupContactEmail,
                popupContactPhone,
                popupRsvpCount,
                popupRsvpButton
            });
        } catch (_) {
        } finally {
            popupRsvpButton.classList.remove('is-loading');
        }
    });
}


function fillProfileEventPopup(event, popupRefs) {
    const {
        popupImage,
        popupTitle,
        popupDatetime,
        popupLocation,
        popupTeam,
        popupDescription,
        popupContactName,
        popupContactEmail,
        popupContactPhone,
        popupRsvpCount,
        popupRsvpButton
    } = popupRefs;

    if (popupImage) {
        popupImage.src = event.eventImage || defaultEventImage;
        popupImage.alt = `${event.eventTitle || 'Event'} image`;
        popupImage.onerror = () => {
            popupImage.onerror = null;
            popupImage.src = defaultEventImage;
        };
    }
    if (popupTitle) {
        popupTitle.textContent = event.eventTitle || 'Untitled Event';
    }
    if (popupDatetime) {
        popupDatetime.innerHTML = `<strong>Date:</strong> ${escapeHTML(event.date)}${event.time ? ` at ${escapeHTML(event.time)}` : ''}`;
    }
    if (popupLocation) {
        popupLocation.innerHTML = `<strong>Location:</strong> ${escapeHTML(event.location)}`;
    }
    if (popupTeam) {
        popupTeam.innerHTML = `<strong>Team:</strong> ${escapeHTML(event.team)}`;
    }
    if (popupDescription) {
        popupDescription.textContent = event.eventDescription;
    }
    if (popupContactName) {
        popupContactName.innerHTML = `<strong>Contact:</strong> ${escapeHTML(event.contactName || 'N/A')}`;
    }
    if (popupContactEmail) {
        popupContactEmail.innerHTML = `<strong>Email:</strong> ${escapeHTML(event.contactEmail || 'N/A')}`;
    }
    if (popupContactPhone) {
        popupContactPhone.innerHTML = `<strong>Phone:</strong> ${escapeHTML(event.contactPhone || 'N/A')}`;
    }
    if (popupRsvpCount) {
        popupRsvpCount.textContent = formatRsvpCount(event.rsvpCount);
    }
    if (popupRsvpButton) {
        popupRsvpButton.textContent = event.isRsvped ? "RSVP'd" : 'RSVP';
        popupRsvpButton.classList.toggle('is-active', event.isRsvped);
    }
}


function updateProfileEventCardState(root, event) {
    const card = root.querySelector(`.profile-event-card[data-event-id="${event.id}"]`);
    if (!card) {
        return;
    }

    const countElement = card.querySelector('.profile-event-rsvp-count');
    if (countElement) {
        countElement.textContent = formatRsvpCount(event.rsvpCount);
    }
    card.classList.toggle('is-rsvped', event.isRsvped);
}


function closeProfileEventPopup(popup) {
    if (!popup) {
        return;
    }
    popup.hidden = true;
    document.body.classList.remove('event-detail-popup-open');
}


function buildProfileEventCard(event) {
    const disabledClass = event.id === '' ? ' is-disabled' : '';
    const rsvpedClass = event.isRsvped ? ' is-rsvped' : '';
    return `
        <button type="button" class="profile-event-card${disabledClass}${rsvpedClass}" data-event-id="${escapeHTML(event.id)}">
            <img class="profile-event-image" src="${escapeHTML(event.eventImage || defaultEventImage)}" alt="${escapeHTML(event.eventTitle || 'Event')} image" loading="lazy" />
            <div class="profile-event-content">
                <h4 class="profile-event-title">${escapeHTML(event.eventTitle || 'Untitled Event')}</h4>
                <p class="profile-event-meta"><strong>Date:</strong> ${escapeHTML(event.date)}${event.time ? ` at ${escapeHTML(event.time)}` : ''}</p>
                <p class="profile-event-meta"><strong>Location:</strong> ${escapeHTML(event.location)}</p>
                <p class="profile-event-rsvp-count">${escapeHTML(formatRsvpCount(event.rsvpCount))}</p>
            </div>
        </button>
    `;
}


function normalizeEvents(events) {
    if (!Array.isArray(events)) {
        return [];
    }

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

function initProfilePostInfiniteScroll(root, profileID, initialPosts) {
    if (!root) {
        return;
    }

    const postsPanel = root.querySelector('#posts-panel');
    const postsTab = root.querySelector('#posts-tab');
    if (!postsPanel || !postsTab) {
        return;
    }
    if (profileID === '') {
        return;
    }

    resetProfilePostPaginationState();
    profilePostPaginationState.profileID = profileID;
    profilePostPaginationState.offset = Array.isArray(initialPosts) ? initialPosts.length : 0;
    registerProfilePostIDs(initialPosts);
    if (profilePostPaginationState.offset < profilePostFetchSize) {
        profilePostPaginationState.hasMore = false;
    }

    profilePostScrollHandler = () => {
        if (postsTab.checked !== true) {
            return;
        }
        if (shouldLoadMoreProfilePosts() === false) {
            return;
        }
        void loadMoreProfilePosts(postsPanel);
    };

    window.addEventListener('scroll', profilePostScrollHandler, { passive: true });
    window.addEventListener('resize', profilePostScrollHandler);
    postsTab.addEventListener('change', profilePostScrollHandler);

    profilePostScrollHandler();
}

function resetProfilePostPaginationState() {
    profilePostPaginationState.profileID = '';
    profilePostPaginationState.offset = 0;
    profilePostPaginationState.isLoading = false;
    profilePostPaginationState.hasMore = true;
    profilePostPaginationState.loadedPostIDs = new Set();

    if (profilePostScrollHandler) {
        window.removeEventListener('scroll', profilePostScrollHandler);
        window.removeEventListener('resize', profilePostScrollHandler);
        profilePostScrollHandler = null;
    }
}

function shouldLoadMoreProfilePosts() {
    if (profilePostPaginationState.isLoading || profilePostPaginationState.hasMore === false) {
        return false;
    }

    const documentElement = document.documentElement;
    const scrollTop = window.pageYOffset || documentElement.scrollTop || 0;
    const viewportHeight = window.innerHeight || documentElement.clientHeight || 0;
    const documentHeight = Math.max(
        documentElement.scrollHeight || 0,
        document.body ? document.body.scrollHeight : 0
    );
    if (documentHeight <= 0) {
        return false;
    }

    return (scrollTop + viewportHeight) >= (documentHeight * profileScrollLoadThresholdRatio);
}

async function loadMoreProfilePosts(postsPanel) {
    if (!postsPanel || profilePostPaginationState.profileID === '') {
        return;
    }
    if (profilePostPaginationState.isLoading || profilePostPaginationState.hasMore === false) {
        return;
    }

    profilePostPaginationState.isLoading = true;
    try {
        const payload = await getPost(
            profilePostPaginationState.profileID,
            profilePostPaginationState.offset,
            profilePostFetchSize
        );
        const fetchedPosts = Array.isArray(payload) ? payload : [];
        if (fetchedPosts.length === 0) {
            profilePostPaginationState.hasMore = false;
            return;
        }

        const uniquePosts = fetchedPosts.filter((post) => {
            const postID = getProfilePostIdentifier(post);
            if (postID === '') {
                return false;
            }
            if (profilePostPaginationState.loadedPostIDs.has(postID)) {
                return false;
            }
            return true;
        });
        if (uniquePosts.length === 0) {
            profilePostPaginationState.hasMore = false;
            return;
        }

        appendProfilePosts(postsPanel, uniquePosts);
        profilePostPaginationState.offset += fetchedPosts.length;
        registerProfilePostIDs(uniquePosts);

        if (fetchedPosts.length < profilePostFetchSize) {
            profilePostPaginationState.hasMore = false;
        }
    } catch (error) {
        console.error('Unable to load more profile posts:', error);
    } finally {
        profilePostPaginationState.isLoading = false;
    }
}

function appendProfilePosts(postsPanel, posts) {
    if (!postsPanel || !Array.isArray(posts) || posts.length === 0) {
        return;
    }

    const emptyState = postsPanel.querySelector('.profile-events-empty');
    if (emptyState) {
        emptyState.remove();
    }

    const fragment = document.createDocumentFragment();
    for (const post of posts) {
        const postWrapper = document.createElement('div');
        postWrapper.innerHTML = drawPost(post).trim();
        const postElement = postWrapper.firstElementChild;
        if (!postElement) {
            continue;
        }
        fragment.appendChild(postElement);
    }
    postsPanel.appendChild(fragment);

    initPostLikeButtons(postsPanel);
    initPostCommentButtons(postsPanel);
    initPostMoreMenus(postsPanel);
    initPostShareButtons(postsPanel);
    initPostMediaAudioToggles(postsPanel);
    initPostViewTracking(postsPanel);
}

function registerProfilePostIDs(posts) {
    if (!Array.isArray(posts) || posts.length === 0) {
        return;
    }

    for (const post of posts) {
        const postID = getProfilePostIdentifier(post);
        if (postID === '') {
            continue;
        }
        profilePostPaginationState.loadedPostIDs.add(postID);
    }
}

function getProfilePostIdentifier(post) {
    if (!post || typeof post !== 'object') {
        return '';
    }

    const candidates = [
        post.Id,
        post.ID,
        post.id,
        post._id
    ];
    for (const candidate of candidates) {
        const postID = normalizeRelId(candidate);
        if (postID !== '') {
            return postID;
        }
    }
    return '';
}


function initProfileFollowButton(root) {
    const button = root.querySelector('.profile-follow-button');
    if (!button) {
        return;
    }
    if (button.dataset.followBound === 'true') {
        return;
    }
    button.dataset.followBound = 'true';

    const relId = normalizeRelId(button.dataset.relId || '');
    if (relId === '') {
        button.classList.add('is-disabled');
        return;
    }
    button.dataset.relId = relId;
    button.classList.add('is-loading');

    void loadFollowState(button, relId);
    button.addEventListener('click', () => {
        void toggleFollowForButton(button);
    });
}

function initProfileActionMenu(root, profileUsername, profileID) {
    const menuShell = root.querySelector('.profile-more-menu-shell');
    const toggleButton = root.querySelector('.profile-more-toggle');
    const menu = root.querySelector('.profile-more-menu');
    if (!menuShell || !toggleButton || !menu) {
        return;
    }

    const closeMenu = () => {
        menu.hidden = true;
        toggleButton.setAttribute('aria-expanded', 'false');
        menuShell.classList.remove('is-open');
    };

    const openMenu = () => {
        menu.hidden = false;
        toggleButton.setAttribute('aria-expanded', 'true');
        menuShell.classList.add('is-open');
    };

    toggleButton.addEventListener('click', (event) => {
        event.stopPropagation();
        if (menu.hidden) {
            openMenu();
            return;
        }
        closeMenu();
    });

    menu.addEventListener('click', async (event) => {
        const actionButton = event.target.closest('.profile-more-menu-item');
        if (!actionButton) {
            return;
        }

        const action = sanitizeText(actionButton.dataset.profileAction);
        if (action === 'message') {
            if (profileUsername !== '') {
                window.location.href = `/chat?username=${encodeURIComponent(profileUsername)}`;
            }
            closeMenu();
            return;
        }

        if (action === 'copy-link') {
            const shareURL = buildProfileShareURL(profileUsername);
            await copyTextToClipboard(shareURL);
            showProfileActionPopup('Link copied', false);
            closeMenu();
            return;
        }

        if (action === 'report') {
            if (profileID === '') {
                showProfileActionPopup('Unable to resolve profile ID for report.', true);
                closeMenu();
                return;
            }

            actionButton.disabled = true;
            try {
                await createReport(profileID, 'profile');
                showProfileActionPopup('Profile report submitted.', false);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unable to submit report.';
                showProfileActionPopup(message, true);
            } finally {
                actionButton.disabled = false;
            }
            closeMenu();
            return;
        }

        if (action === 'block') {
            if (profileID === '') {
                showProfileActionPopup('Unable to resolve profile ID for block.', true);
                closeMenu();
                return;
            }

            actionButton.disabled = true;
            try {
                await addBlock(profileID);
                showProfileActionPopup('Account blocked. You will no longer see this profile in feed or search.', false);
                window.setTimeout(() => {
                    window.location.href = '/feed';
                }, 500);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unable to block account.';
                showProfileActionPopup(message, true);
            } finally {
                actionButton.disabled = false;
            }
            closeMenu();
        }
    });

    document.addEventListener('click', (event) => {
        if (!menuShell.contains(event.target)) {
            closeMenu();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeMenu();
        }
    });
}

function ensureProfileActionPopup() {
    if (profileActionPopupState.root && document.body.contains(profileActionPopupState.root)) {
        return;
    }

    const popupRoot = document.createElement('div');
    popupRoot.className = 'profile-action-popup';
    popupRoot.innerHTML = `
        <button type="button" class="profile-action-popup-backdrop profile-action-popup-close" aria-label="Close notification"></button>
        <section class="profile-action-popup-card" role="dialog" aria-modal="true" aria-label="Action status">
            <button type="button" class="profile-action-popup-close-button profile-action-popup-close" aria-label="Close notification">×</button>
            <p class="profile-action-popup-status"></p>
        </section>
    `;
    document.body.appendChild(popupRoot);

    profileActionPopupState.root = popupRoot;
    profileActionPopupState.status = popupRoot.querySelector('.profile-action-popup-status');
    profileActionPopupState.closeButtons = Array.from(popupRoot.querySelectorAll('.profile-action-popup-close'));
    profileActionPopupState.closeButtons.forEach((closeButton) => {
        closeButton.addEventListener('click', closeProfileActionPopup);
    });

    if (!profileActionPopupEscapeBound) {
        profileActionPopupEscapeBound = true;
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeProfileActionPopup();
            }
        });
    }
}

function showProfileActionPopup(message, isError) {
    ensureProfileActionPopup();
    if (!profileActionPopupState.root || !profileActionPopupState.status) {
        return;
    }

    profileActionPopupState.status.textContent = sanitizeText(message);
    profileActionPopupState.status.classList.toggle('is-error', Boolean(isError));
    profileActionPopupState.root.classList.add('is-active');
    document.body.classList.add('profile-action-popup-open');
}

function closeProfileActionPopup() {
    if (!profileActionPopupState.root) {
        return;
    }

    profileActionPopupState.root.classList.remove('is-active');
    document.body.classList.remove('profile-action-popup-open');
}

function initProfileImageEditor(root, isOwnProfile) {
    if (isOwnProfile !== true) {
        return;
    }

    const popup = root.querySelector('#profile-image-popup');
    const targetSelect = root.querySelector('#profile-image-popup-target');
    const imageURLInput = root.querySelector('#profile-image-popup-url');
    const form = root.querySelector('#profile-image-popup-form');
    const editButtons = Array.from(root.querySelectorAll('.profile-image-edit-button'));
    const closeButtons = Array.from(root.querySelectorAll('.profile-image-popup-close'));

    if (!popup || !targetSelect || !imageURLInput || !form || editButtons.length === 0 || closeButtons.length === 0) {
        return;
    }

    const closePopup = () => {
        popup.hidden = true;
        popup.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('profile-image-popup-open');
    };

    const openPopup = (targetValue) => {
        targetSelect.value = targetValue === 'banner' ? 'banner' : 'avatar';
        imageURLInput.value = '';
        popup.hidden = false;
        popup.setAttribute('aria-hidden', 'false');
        document.body.classList.add('profile-image-popup-open');
        imageURLInput.focus();
    };

    editButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const targetValue = sanitizeText(button.dataset.imageTarget);
            openPopup(targetValue);
        });
    });

    closeButtons.forEach((button) => {
        button.addEventListener('click', closePopup);
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        alert('Image update logic coming soon.');
        closePopup();
    });
}


async function loadFollowState(button, relId) {
    try {
        const response = await getFollowStates([relId]);
        const stateMap = response?.is_followed && typeof response.is_followed === 'object' ? response.is_followed : {};
        setFollowButtonState(button, Boolean(stateMap[relId]));
    } catch (_) {
        setFollowButtonState(button, false);
    } finally {
        button.classList.remove('is-loading');
    }
}


async function toggleFollowForButton(button) {
    if (!button || button.classList.contains('is-disabled') || button.classList.contains('is-loading')) {
        return;
    }

    const relId = normalizeRelId(button.dataset.relId || '');
    if (relId === '') {
        button.classList.add('is-disabled');
        return;
    }

    const isCurrentlyFollowed = button.classList.contains('is-following');
    button.classList.add('is-loading');
    playInteractionToggleSound(!isCurrentlyFollowed);
    try {
        const response = isCurrentlyFollowed ? await removeFollow(relId) : await addFollow(relId);
        const isNowFollowed = Boolean(response?.is_followed);
        setFollowButtonState(button, isNowFollowed);
        updateProfileFollowersCount(isCurrentlyFollowed, isNowFollowed);
    } catch (_) {
    } finally {
        button.classList.remove('is-loading');
    }
}

function playInteractionToggleSound(isActiveState) {
    let audioElement = null;
    if (isActiveState) {
        if (likeInteractionAudio == null) {
            likeInteractionAudio = new Audio(interactionSoundLikeSrc);
            likeInteractionAudio.preload = 'auto';
            likeInteractionAudio.load();
        }
        audioElement = likeInteractionAudio;
    } else {
        if (unlikeInteractionAudio == null) {
            unlikeInteractionAudio = new Audio(interactionSoundUnlikeSrc);
            unlikeInteractionAudio.preload = 'auto';
            unlikeInteractionAudio.load();
        }
        audioElement = unlikeInteractionAudio;
    }

    if (!(audioElement instanceof HTMLAudioElement)) {
        return;
    }

    try {
        audioElement.currentTime = 0;
        const playPromise = audioElement.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {
            });
        }
    } catch (_) {
    }
}


function setFollowButtonState(button, isFollowed) {
    if (!button) {
        return;
    }

    if (isFollowed) {
        button.classList.add('is-following');
        button.textContent = 'Following';
        return;
    }

    button.classList.remove('is-following');
    button.textContent = 'Follow';
}

function updateProfileFollowersCount(wasFollowed, isFollowed) {
    if (wasFollowed === isFollowed) {
        return;
    }

    const countElement = document.querySelector('.profile-followers-count');
    if (!countElement) {
        return;
    }

    const rawCount = countElement.dataset.count || countElement.textContent || '0';
    let count = normalizePositiveInt(rawCount);
    if (isFollowed) {
        count += 1;
    } else {
        count -= 1;
    }
    if (count < 0) {
        count = 0;
    }

    countElement.dataset.count = String(count);
    countElement.textContent = formatCompactCount(count);
    countElement.setAttribute('title', formatCountHoverTitle('follower', count));
}


function formatRsvpCount(value) {
    const count = normalizePositiveInt(value);
    const suffix = count === 1 ? ' RSVP' : ' RSVPs';
    return `${count}${suffix}`;
}


function normalizePositiveInt(value) {
    return normalizeCount(value);
}


function sanitizeText(value) {
    return String(value || '').trim();
}

function sanitizeUsername(value) {
    return sanitizeText(value).replace(/\s+/g, '');
}

function buildProfileShareURL(profileUsername) {
    if (typeof window === 'undefined') {
        return '';
    }

    const normalizedUsername = sanitizeUsername(profileUsername);
    if (normalizedUsername === '') {
        return window.location.href.split('#')[0];
    }

    return `${window.location.origin}/profile/${encodeURIComponent(normalizedUsername)}`;
}

async function copyTextToClipboard(value) {
    const text = sanitizeText(value);
    if (text === '') {
        return;
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch (_) {
        }
    }

    if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
        window.prompt('Copy this link:', text);
    }
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


function escapeHTML(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
