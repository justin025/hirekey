import { createEvent, createFeedPost, getFeedPosts, getUnreadChatCount } from "./api.js";
import { drawPost, initPostCommentButtons, initPostLikeButtons, initPostMediaAudioToggles, initPostMoreMenus, initPostShareButtons, initPostViewTracking } from "./post.js";


const feedPostTextMaxChars = 2000;
const feedPostAttachmentMaxItems = 8;
const feedPostAttachmentURLMaxChars = 3000;
const feedPostFetchSize = 10;
const feedPostSuccessMessage = "Post submitted.";
const feedEventSuccessMessage = "Event submitted.";
const feedCreateTypePost = "post";
const feedCreateTypeEvent = "event";
const feedDefaultEventImageURL = "/static/img/test-img.jpg";
const feedScrollLoadThresholdRatio = 0.8;
const feedUnreadPollIntervalMs = 5000;
const feedModeForYou = "for_you";
const feedModeFollowing = "following";
const feedModeYourTeam = "your_team";

const feedTabState = {
    activeMode: feedModeForYou,
    modes: {
        [feedModeForYou]: {
            isLoading: false,
            hasMore: true,
            loadedPostIDs: new Set(),
            container: null
        },
        [feedModeFollowing]: {
            isLoading: false,
            hasMore: true,
            loadedPostIDs: new Set(),
            container: null
        },
        [feedModeYourTeam]: {
            isLoading: false,
            hasMore: true,
            loadedPostIDs: new Set(),
            container: null
        }
    }
};

let feedScrollHandler = null;
let feedCreatePopupEscapeHandler = null;
let feedUnreadPollTimerID = 0;
let feedUnreadVisibilityHandler = null;
let feedUnreadFocusHandler = null;


export function drawFeed(forYouPostData, followingPostData, options = {}) {
    const forYouPosts = Array.isArray(forYouPostData) ? forYouPostData : [];
    const followingPosts = Array.isArray(followingPostData) ? followingPostData : [];
    const yourTeamPosts = followingPosts;
    const isLoading = options && options.isLoading === true;

    let mainContainer = document.querySelector('.main-container');
    if (!mainContainer) {
        mainContainer = document.createElement('div');
        mainContainer.className = 'main-container';
        document.body.appendChild(mainContainer);
    }

    resetFeedUnreadPolling();
    resetFeedPaginationState();

    mainContainer.innerHTML = `
        <section class="feed-tabs-shell tab-container feed-tab-container">
            <input type="radio" id="feed-tab-for-you" name="feed-main-tabs" checked>
            <input type="radio" id="feed-tab-following" name="feed-main-tabs">
            <input type="radio" id="feed-tab-your-team" name="feed-main-tabs">

            <section class="feed-page-header">
                <div class="feed-page-header-top">
                    <img class="feed-page-logo" src="https://app.hirkey.com/static/img/logo.png" alt="Hirekey">
                    <div class="feed-page-actions">
                        <button id="feed-header-plus" class="feed-header-icon-button" type="button" aria-label="Create post or event">
                            <span class="feed-header-icon-glyph fa-solid" aria-hidden="true">&#xf067;</span>
                        </button>
                        <button id="feed-header-search" class="feed-header-icon-button" type="button" aria-label="Open search">
                            <span class="feed-header-icon-glyph fa-solid" aria-hidden="true">&#xf002;</span>
                        </button>
                        <button id="feed-header-marketplace" class="feed-header-icon-button" type="button" aria-label="Open marketplace">
                            <span class="feed-header-icon-glyph fa-solid" aria-hidden="true">&#xf54f;</span>
                        </button>
                        <button id="feed-header-message" class="feed-header-icon-button" type="button" aria-label="Open messages">
                            <span class="feed-header-icon-glyph fa-solid" aria-hidden="true">&#xf27a;</span>
                            <span id="feed-header-message-dot" class="feed-header-message-dot" aria-hidden="true"></span>
                        </button>
                    </div>
                </div>

                <div class="feed-header-tab-nav">
                    <label for="feed-tab-for-you" class="feed-header-tab-label">For You</label>
                    <label for="feed-tab-following" class="feed-header-tab-label">Following</label>
                    <label for="feed-tab-your-team" class="feed-header-tab-label">Your Team</label>
                </div>
            </section>

            <div class="feed-tab-panels">
                <div class="panel feed-tab-panel" id="feed-for-you-panel" data-feed-mode="${feedModeForYou}">
                    <section id="feed-post-list-for-you" class="feed-post-list" data-feed-mode="${feedModeForYou}">
                        ${renderFeedPostsHTML(forYouPosts, 'No posts available in For You yet.', isLoading)}
                    </section>
                </div>
                <div class="panel feed-tab-panel" id="feed-following-panel" data-feed-mode="${feedModeFollowing}">
                    <section id="feed-post-list-following" class="feed-post-list" data-feed-mode="${feedModeFollowing}">
                        ${renderFeedPostsHTML(followingPosts, 'No posts available in Following yet.', isLoading)}
                    </section>
                </div>
                <div class="panel feed-tab-panel" id="feed-your-team-panel" data-feed-mode="${feedModeYourTeam}">
                    <section id="feed-post-list-your-team" class="feed-post-list" data-feed-mode="${feedModeYourTeam}">
                        ${renderFeedPostsHTML(yourTeamPosts, 'No posts available in Your Team yet.', isLoading)}
                    </section>
                </div>
            </div>
        </section>

        <div id="feed-create-popup" class="feed-create-popup" hidden>
            <button id="feed-create-popup-backdrop" class="feed-create-popup-backdrop" type="button" aria-label="Close create dialog"></button>
            <div class="feed-create-popup-card" role="dialog" aria-modal="true" aria-labelledby="feed-create-title">
                <div class="feed-create-popup-header">
                    <h3 id="feed-create-title">Create</h3>
                    <button id="feed-create-close" class="feed-create-close" type="button" aria-label="Close create dialog">×</button>
                </div>
                <form id="feed-create-form" class="feed-create-form">
                    <label class="feed-create-field">
                        <span>Type</span>
                        <select id="feed-create-type" class="feed-create-select" name="type">
                            <option value="${feedCreateTypePost}">Post</option>
                            <option value="${feedCreateTypeEvent}">Event</option>
                        </select>
                    </label>

                    <div id="feed-create-post-fields" class="feed-create-fields">
                        <label class="feed-create-field">
                            <span>Post content</span>
                            <textarea id="feed-create-post-text" class="feed-create-textarea" name="post_text" placeholder="Write your post..." maxlength="${feedPostTextMaxChars}" required></textarea>
                        </label>
                        <div id="feed-create-attachment-list" class="feed-create-attachment-list"></div>
                        <div class="feed-create-media-row">
                            <button id="feed-create-add-attachment" class="feed-create-media-button" type="button">Add attachment</button>
                        </div>
                        <p class="feed-create-media-help">For now, add direct media URLs (image or video). Upload integration will be added later.</p>
                    </div>

                    <div id="feed-create-event-fields" class="feed-create-fields feed-create-fields-hidden">
                        <label class="feed-create-field">
                            <span>Event title</span>
                            <input id="feed-create-event-title" class="feed-create-input" type="text" name="event_title" placeholder="Event title">
                        </label>
                        <label class="feed-create-field">
                            <span>Location</span>
                            <input id="feed-create-event-location" class="feed-create-input" type="text" name="location" placeholder="Location">
                        </label>
                        <div class="feed-create-grid">
                            <label class="feed-create-field">
                                <span>Date</span>
                                <input id="feed-create-event-date" class="feed-create-input" type="text" name="date" placeholder="YYYY-MM-DD">
                            </label>
                            <label class="feed-create-field">
                                <span>Time</span>
                                <input id="feed-create-event-time" class="feed-create-input" type="text" name="time" placeholder="07:00 PM">
                            </label>
                        </div>
                        <label class="feed-create-field">
                            <span>Team</span>
                            <input id="feed-create-event-team" class="feed-create-input" type="text" name="team" placeholder="Team name">
                        </label>
                        <label class="feed-create-field">
                            <span>Description</span>
                            <textarea id="feed-create-event-description" class="feed-create-textarea" name="event_description" placeholder="Describe the event..."></textarea>
                        </label>
                        <div class="feed-create-grid">
                            <label class="feed-create-field">
                                <span>Contact name</span>
                                <input id="feed-create-event-contact-name" class="feed-create-input" type="text" name="contact_name" placeholder="Optional">
                            </label>
                            <label class="feed-create-field">
                                <span>Contact email</span>
                                <input id="feed-create-event-contact-email" class="feed-create-input" type="email" name="contact_email" placeholder="Optional">
                            </label>
                        </div>
                        <label class="feed-create-field">
                            <span>Contact phone</span>
                            <input id="feed-create-event-contact-phone" class="feed-create-input" type="text" name="contact_phone" placeholder="Optional">
                        </label>
                    </div>

                    <p id="feed-create-status" class="feed-create-status" aria-live="polite"></p>
                    <div class="feed-create-actions">
                        <button id="feed-create-cancel" class="feed-create-cancel" type="button">Cancel</button>
                        <button id="feed-create-submit" class="feed-create-submit" type="submit">Submit</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    const forYouContainer = mainContainer.querySelector('#feed-post-list-for-you');
    const followingContainer = mainContainer.querySelector('#feed-post-list-following');
    const yourTeamContainer = mainContainer.querySelector('#feed-post-list-your-team');
    if (!forYouContainer || !followingContainer || !yourTeamContainer) {
        return;
    }

    feedTabState.modes[feedModeForYou].container = forYouContainer;
    feedTabState.modes[feedModeFollowing].container = followingContainer;
    feedTabState.modes[feedModeYourTeam].container = yourTeamContainer;
    feedTabState.modes[feedModeForYou].isLoading = isLoading;
    feedTabState.modes[feedModeFollowing].isLoading = isLoading;
    feedTabState.modes[feedModeYourTeam].isLoading = isLoading;

    initPostLikeButtons(forYouContainer);
    initPostCommentButtons(forYouContainer);
    initPostMoreMenus(forYouContainer);
    initPostShareButtons(forYouContainer);
    initPostMediaAudioToggles(forYouContainer);

    initPostLikeButtons(followingContainer);
    initPostCommentButtons(followingContainer);
    initPostMoreMenus(followingContainer);
    initPostShareButtons(followingContainer);
    initPostMediaAudioToggles(followingContainer);

    initPostLikeButtons(yourTeamContainer);
    initPostCommentButtons(yourTeamContainer);
    initPostMoreMenus(yourTeamContainer);
    initPostShareButtons(yourTeamContainer);
    initPostMediaAudioToggles(yourTeamContainer);

    registerFeedPosts(feedModeForYou, forYouPosts);
    registerFeedPosts(feedModeFollowing, followingPosts);
    registerFeedPosts(feedModeYourTeam, yourTeamPosts);

    bindFeedTabSelection(mainContainer);
    const activeMode = getActiveFeedMode(mainContainer);
    setFeedActiveMode(activeMode);
    initPostViewTracking(getFeedContainerByMode(activeMode));

    bindFeedInfiniteScroll(mainContainer);

    const openCreatePopup = bindFeedCreatePopup(mainContainer);
    bindFeedHeaderActions(mainContainer, openCreatePopup);
    bindFeedUnreadPolling(mainContainer);
}


function renderFeedPostsHTML(posts, emptyMessage, isLoading = false) {
    if (isLoading) {
        return renderFeedLoadingHTML();
    }

    const normalizedPosts = Array.isArray(posts) ? posts : [];
    if (normalizedPosts.length === 0) {
        return `<p class="search-page-status feed-empty-state">${emptyMessage}</p>`;
    }
    return normalizedPosts.map(post => drawPost(post)).join('');
}


function renderFeedLoadingHTML() {
    return `
        <article class="post feed-loading-card">
            <div class="post-header">
                <div class="feed-loading-avatar loading-skeleton"></div>
                <div class="feed-loading-header-lines">
                    <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-medium"></div>
                    <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-short"></div>
                </div>
            </div>
            <div class="feed-loading-content">
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-wide"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-wide"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-medium"></div>
            </div>
            <div class="feed-loading-media loading-skeleton"></div>
        </article>
        <article class="post feed-loading-card">
            <div class="post-header">
                <div class="feed-loading-avatar loading-skeleton"></div>
                <div class="feed-loading-header-lines">
                    <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-medium"></div>
                    <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-short"></div>
                </div>
            </div>
            <div class="feed-loading-content">
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-wide"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-medium"></div>
            </div>
        </article>
        <article class="post feed-loading-card">
            <div class="post-header">
                <div class="feed-loading-avatar loading-skeleton"></div>
                <div class="feed-loading-header-lines">
                    <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-medium"></div>
                    <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-short"></div>
                </div>
            </div>
            <div class="feed-loading-content">
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-wide"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-wide"></div>
                <div class="loading-skeleton loading-skeleton-line loading-skeleton-line-short"></div>
            </div>
            <div class="feed-loading-media loading-skeleton"></div>
        </article>
    `;
}


function getFeedContainerByMode(mode) {
    const normalizedMode = normalizeFeedMode(mode);
    return feedTabState.modes[normalizedMode].container;
}


function getFeedModeState(mode) {
    const normalizedMode = normalizeFeedMode(mode);
    return feedTabState.modes[normalizedMode];
}


function getActiveFeedMode(mainContainer) {
    if (!(mainContainer instanceof HTMLElement)) {
        return feedModeForYou;
    }

    const yourTeamInput = mainContainer.querySelector('#feed-tab-your-team');
    if (yourTeamInput instanceof HTMLInputElement && yourTeamInput.checked) {
        return feedModeYourTeam;
    }

    const followingInput = mainContainer.querySelector('#feed-tab-following');
    if (followingInput instanceof HTMLInputElement && followingInput.checked) {
        return feedModeFollowing;
    }
    return feedModeForYou;
}


function setFeedActiveMode(mode) {
    feedTabState.activeMode = normalizeFeedMode(mode);
}


function bindFeedTabSelection(mainContainer) {
    const tabInputs = Array.from(mainContainer.querySelectorAll('input[name="feed-main-tabs"]'));
    if (tabInputs.length === 0) {
        return;
    }

    for (const tabInput of tabInputs) {
        tabInput.addEventListener('change', () => {
            const selectedMode = getActiveFeedMode(mainContainer);
            setFeedActiveMode(selectedMode);

            const selectedContainer = getFeedContainerByMode(selectedMode);
            initPostViewTracking(selectedContainer);

            if (shouldLoadMoreFeedPosts(mainContainer)) {
                void loadMoreFeedPostsForMode(selectedMode);
            }
        });
    }
}


function prependFeedPost(mode, post) {
    const normalizedMode = normalizeFeedMode(mode);
    const postsContainer = getFeedContainerByMode(normalizedMode);
    if (!postsContainer) {
        return;
    }

    const emptyState = postsContainer.querySelector('.feed-empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    const postWrapper = document.createElement('div');
    postWrapper.innerHTML = drawPost(post).trim();
    const postElement = postWrapper.firstElementChild;
    if (!postElement) {
        return;
    }

    postsContainer.prepend(postElement);
    initPostLikeButtons(postElement);
    initPostCommentButtons(postElement);
    initPostMoreMenus(postElement);
    initPostShareButtons(postElement);
    initPostMediaAudioToggles(postElement);

    if (normalizedMode === feedTabState.activeMode) {
        initPostViewTracking(postElement);
    }

    const postId = getPostIdentifier(post);
    if (postId !== '') {
        getFeedModeState(normalizedMode).loadedPostIDs.add(postId);
    }
}


function bindFeedCreatePopup(mainContainer) {
    const popup = mainContainer.querySelector('#feed-create-popup');
    const backdrop = mainContainer.querySelector('#feed-create-popup-backdrop');
    const closeButton = mainContainer.querySelector('#feed-create-close');
    const cancelButton = mainContainer.querySelector('#feed-create-cancel');
    const form = mainContainer.querySelector('#feed-create-form');
    const typeSelect = mainContainer.querySelector('#feed-create-type');
    const postFields = mainContainer.querySelector('#feed-create-post-fields');
    const eventFields = mainContainer.querySelector('#feed-create-event-fields');
    const postText = mainContainer.querySelector('#feed-create-post-text');
    const eventTitle = mainContainer.querySelector('#feed-create-event-title');
    const eventLocation = mainContainer.querySelector('#feed-create-event-location');
    const eventDate = mainContainer.querySelector('#feed-create-event-date');
    const eventTime = mainContainer.querySelector('#feed-create-event-time');
    const eventTeam = mainContainer.querySelector('#feed-create-event-team');
    const eventDescription = mainContainer.querySelector('#feed-create-event-description');
    const eventContactName = mainContainer.querySelector('#feed-create-event-contact-name');
    const eventContactEmail = mainContainer.querySelector('#feed-create-event-contact-email');
    const eventContactPhone = mainContainer.querySelector('#feed-create-event-contact-phone');
    const attachmentList = mainContainer.querySelector('#feed-create-attachment-list');
    const addAttachmentButton = mainContainer.querySelector('#feed-create-add-attachment');
    const submitButton = mainContainer.querySelector('#feed-create-submit');
    const status = mainContainer.querySelector('#feed-create-status');
    if (!popup || !backdrop || !closeButton || !cancelButton || !form || !typeSelect || !postFields || !eventFields || !postText || !eventTitle || !eventLocation || !eventDate || !eventTime || !eventTeam || !eventDescription || !eventContactName || !eventContactEmail || !eventContactPhone || !attachmentList || !addAttachmentButton || !submitButton || !status) {
        return null;
    }

    popup.hidden = true;
    popup.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('feed-create-popup-open');

    const setCreateStatus = (message, isError) => {
        status.textContent = message;
        status.classList.toggle('is-error', Boolean(isError));
    };

    const setCreateType = (type) => {
        const normalizedType = type === feedCreateTypeEvent ? feedCreateTypeEvent : feedCreateTypePost;
        const isEvent = normalizedType === feedCreateTypeEvent;
        postFields.classList.toggle('feed-create-fields-hidden', isEvent);
        eventFields.classList.toggle('feed-create-fields-hidden', !isEvent);
    };

    const readPostAttachments = () => {
        const attachments = [];
        const rows = Array.from(attachmentList.querySelectorAll('.feed-create-attachment-row'));
        for (const row of rows) {
            if (attachments.length >= feedPostAttachmentMaxItems) {
                break;
            }

            const typeInput = row.querySelector('.feed-create-attachment-type');
            const urlInput = row.querySelector('.feed-create-attachment-url');
            if (!(typeInput instanceof HTMLSelectElement) || !(urlInput instanceof HTMLInputElement)) {
                continue;
            }

            const attachmentType = typeInput.value === 'video' ? 'video' : 'image';
            let attachmentURL = String(urlInput.value || '').trim();
            if (attachmentURL === '') {
                continue;
            }

            if (attachmentURL.length > feedPostAttachmentURLMaxChars) {
                attachmentURL = attachmentURL.slice(0, feedPostAttachmentURLMaxChars);
            }
            attachments.push({
                type: attachmentType,
                url: attachmentURL
            });
        }
        return attachments;
    };

    const createAttachmentRow = (defaultType = 'image', defaultURL = '') => {
        const currentRows = attachmentList.querySelectorAll('.feed-create-attachment-row');
        if (currentRows.length >= feedPostAttachmentMaxItems) {
            setCreateStatus(`Maximum ${feedPostAttachmentMaxItems} attachments per post.`, true);
            return;
        }

        const row = document.createElement('div');
        row.className = 'feed-create-attachment-row';
        row.innerHTML = `
            <select class="feed-create-attachment-type" name="attachment_type">
                <option value="image">Image</option>
                <option value="video">Video</option>
            </select>
            <input class="feed-create-attachment-url" name="attachment_url" type="url" placeholder="https://..." maxlength="${feedPostAttachmentURLMaxChars}">
            <button class="feed-create-attachment-remove" type="button" aria-label="Remove attachment">×</button>
        `;

        const typeInput = row.querySelector('.feed-create-attachment-type');
        const urlInput = row.querySelector('.feed-create-attachment-url');
        const removeButton = row.querySelector('.feed-create-attachment-remove');
        if (typeInput instanceof HTMLSelectElement) {
            typeInput.value = defaultType === 'video' ? 'video' : 'image';
        }
        if (urlInput instanceof HTMLInputElement) {
            urlInput.value = String(defaultURL || '').trim();
        }
        if (removeButton instanceof HTMLButtonElement) {
            removeButton.addEventListener('click', () => {
                row.remove();
            });
        }

        attachmentList.appendChild(row);
    };

    const resetAttachmentRows = () => {
        attachmentList.textContent = '';
        createAttachmentRow('image', '');
    };

    const closePopup = () => {
        popup.hidden = true;
        popup.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('feed-create-popup-open');
    };

    const openPopup = () => {
        popup.hidden = false;
        popup.setAttribute('aria-hidden', 'false');
        document.body.classList.add('feed-create-popup-open');
        setCreateType(typeSelect.value);
        setCreateStatus('', false);
        typeSelect.focus();
    };

    const resetCreateForm = () => {
        form.reset();
        typeSelect.value = feedCreateTypePost;
        setCreateType(feedCreateTypePost);
        resetAttachmentRows();
        setCreateStatus('', false);
    };

    const setFormDisabled = (isDisabled) => {
        const formControls = Array.from(form.elements);
        for (const element of formControls) {
            if (element instanceof HTMLButtonElement && element.id === 'feed-create-cancel') {
                continue;
            }
            element.disabled = Boolean(isDisabled);
        }
        cancelButton.disabled = false;
    };

    setCreateType(feedCreateTypePost);
    resetAttachmentRows();

    typeSelect.addEventListener('change', function() {
        setCreateType(typeSelect.value);
        setCreateStatus('', false);
    });

    addAttachmentButton.addEventListener('click', () => {
        createAttachmentRow('image', '');
    });

    const closeButtons = [backdrop, closeButton, cancelButton];
    for (const button of closeButtons) {
        button.addEventListener('click', function() {
            closePopup();
        });
    }

    if (feedCreatePopupEscapeHandler) {
        document.removeEventListener('keydown', feedCreatePopupEscapeHandler);
        feedCreatePopupEscapeHandler = null;
    }
    feedCreatePopupEscapeHandler = function(event) {
        if (event.key !== 'Escape') {
            return;
        }
        if (popup.hidden) {
            return;
        }
        closePopup();
    };
    document.addEventListener('keydown', feedCreatePopupEscapeHandler);

    form.addEventListener('submit', async function(event) {
        event.preventDefault();

        const selectedType = typeSelect.value === feedCreateTypeEvent ? feedCreateTypeEvent : feedCreateTypePost;
        setCreateStatus('Submitting...', false);
        setFormDisabled(true);

        try {
            if (selectedType === feedCreateTypePost) {
                let postContent = (postText.value || '').trim();
                if (postContent === '') {
                    throw new Error('Post content is required.');
                }
                if (postContent.length > feedPostTextMaxChars) {
                    postContent = postContent.slice(0, feedPostTextMaxChars);
                }

                const attachments = readPostAttachments();
                const response = await createFeedPost(postContent, attachments);
                const createdPost = response && response.post ? response.post : null;
                if (!createdPost || typeof createdPost !== 'object') {
                    throw new Error('Invalid post response');
                }

                prependFeedPost(feedModeForYou, createdPost);
                setCreateStatus(feedPostSuccessMessage, false);
                resetCreateForm();
                closePopup();
                return;
            }

            const eventPayload = {
                location: (eventLocation.value || '').trim(),
                time: (eventTime.value || '').trim(),
                date: (eventDate.value || '').trim(),
                team: (eventTeam.value || '').trim(),
                event_image: feedDefaultEventImageURL,
                event_title: (eventTitle.value || '').trim(),
                event_description: (eventDescription.value || '').trim(),
                contact_name: (eventContactName.value || '').trim(),
                contact_email: (eventContactEmail.value || '').trim(),
                contact_phone: (eventContactPhone.value || '').trim()
            };

            if (eventPayload.location === '' || eventPayload.time === '' || eventPayload.date === '' || eventPayload.team === '' || eventPayload.event_title === '' || eventPayload.event_description === '') {
                throw new Error('Complete all required event fields.');
            }

            await createEvent(eventPayload);
            setCreateStatus(feedEventSuccessMessage, false);
            resetCreateForm();
            closePopup();
        } catch (error) {
            const message = error && error.message ? error.message : 'Unable to submit.';
            setCreateStatus(message, true);
        } finally {
            setFormDisabled(false);
            if (!popup.hidden) {
                submitButton.focus();
            }
        }
    });

    return openPopup;
}


function bindFeedHeaderActions(mainContainer, openCreatePopup) {
    const plusButton = mainContainer.querySelector('#feed-header-plus');
    const searchButton = mainContainer.querySelector('#feed-header-search');
    const marketplaceButton = mainContainer.querySelector('#feed-header-marketplace');
    const messageButton = mainContainer.querySelector('#feed-header-message');

    if (plusButton) {
        plusButton.addEventListener('click', function() {
            if (typeof openCreatePopup === 'function') {
                openCreatePopup();
            }
        });
    }

    if (searchButton) {
        searchButton.addEventListener('click', function() {
            window.location.href = '/search';
        });
    }

    if (marketplaceButton) {
        marketplaceButton.addEventListener('click', function() {
            window.location.href = '/marketplace';
        });
    }

    if (messageButton) {
        messageButton.addEventListener('click', function() {
            window.location.href = '/chat';
        });
    }
}


function bindFeedUnreadPolling(mainContainer) {
    const messageButton = mainContainer.querySelector('#feed-header-message');
    if (!messageButton) {
        return;
    }

    const setUnreadIndicator = (unreadCount) => {
        const hasUnread = unreadCount > 0;
        messageButton.classList.toggle('has-unread', hasUnread);
        if (hasUnread) {
            messageButton.setAttribute('aria-label', `Open messages (${unreadCount} unread)`);
            return;
        }
        messageButton.setAttribute('aria-label', 'Open messages');
    };

    const pollUnread = async () => {
        try {
            const payload = await getUnreadChatCount();
            const unreadCount = normalizeUnreadCount(payload?.unread_count);
            setUnreadIndicator(unreadCount);
        } catch (_) {
        }
    };

    void pollUnread();
    feedUnreadPollTimerID = window.setInterval(() => {
        void pollUnread();
    }, feedUnreadPollIntervalMs);

    feedUnreadVisibilityHandler = () => {
        if (document.hidden) {
            return;
        }
        void pollUnread();
    };
    document.addEventListener('visibilitychange', feedUnreadVisibilityHandler);

    feedUnreadFocusHandler = () => {
        void pollUnread();
    };
    window.addEventListener('focus', feedUnreadFocusHandler);
}


function resetFeedUnreadPolling() {
    if (feedUnreadPollTimerID) {
        window.clearInterval(feedUnreadPollTimerID);
        feedUnreadPollTimerID = 0;
    }

    if (feedUnreadVisibilityHandler) {
        document.removeEventListener('visibilitychange', feedUnreadVisibilityHandler);
        feedUnreadVisibilityHandler = null;
    }

    if (feedUnreadFocusHandler) {
        window.removeEventListener('focus', feedUnreadFocusHandler);
        feedUnreadFocusHandler = null;
    }
}


function normalizeUnreadCount(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.floor(value));
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsedValue = Number.parseInt(value, 10);
        if (Number.isFinite(parsedValue)) {
            return Math.max(0, parsedValue);
        }
    }
    return 0;
}


function resetFeedPaginationState() {
    feedTabState.activeMode = feedModeForYou;

    for (const mode of [feedModeForYou, feedModeFollowing, feedModeYourTeam]) {
        const modeState = feedTabState.modes[mode];
        modeState.isLoading = false;
        modeState.hasMore = true;
        modeState.loadedPostIDs = new Set();
        modeState.container = null;
    }

    if (feedScrollHandler) {
        window.removeEventListener('scroll', feedScrollHandler);
        window.removeEventListener('resize', feedScrollHandler);
        feedScrollHandler = null;
    }
}


function bindFeedInfiniteScroll(mainContainer) {
    if (!(mainContainer instanceof HTMLElement)) {
        return;
    }

    feedScrollHandler = () => {
        if (shouldLoadMoreFeedPosts(mainContainer) === false) {
            return;
        }
        void loadMoreFeedPostsForMode(feedTabState.activeMode);
    };

    window.addEventListener('scroll', feedScrollHandler, { passive: true });
    window.addEventListener('resize', feedScrollHandler);

    feedScrollHandler();
}


function shouldLoadMoreFeedPosts(mainContainer) {
    if (!(mainContainer instanceof HTMLElement)) {
        return false;
    }

    const activeModeState = getFeedModeState(feedTabState.activeMode);
    if (activeModeState.isLoading || activeModeState.hasMore === false) {
        return false;
    }

    const activeContainer = getFeedContainerByMode(feedTabState.activeMode);
    if (!(activeContainer instanceof HTMLElement)) {
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

    return (scrollTop + viewportHeight) >= (documentHeight * feedScrollLoadThresholdRatio);
}


async function loadMoreFeedPostsForMode(mode) {
    const normalizedMode = normalizeFeedMode(mode);
    const requestMode = resolveFeedRequestMode(normalizedMode);
    const modeState = getFeedModeState(normalizedMode);
    const postsContainer = getFeedContainerByMode(normalizedMode);
    if (!postsContainer) {
        return;
    }

    if (modeState.isLoading || modeState.hasMore === false) {
        return;
    }

    modeState.isLoading = true;
    try {
        const payload = await getFeedPosts(
            feedPostFetchSize,
            '',
            Array.from(modeState.loadedPostIDs),
            requestMode
        );
        const fetchedPosts = Array.isArray(payload) ? payload : [];
        if (fetchedPosts.length === 0) {
            modeState.hasMore = false;
            return;
        }

        const uniquePosts = fetchedPosts.filter((post) => {
            const postID = getPostIdentifier(post);
            if (postID === '') {
                return false;
            }
            if (modeState.loadedPostIDs.has(postID)) {
                return false;
            }
            return true;
        });
        if (uniquePosts.length === 0) {
            modeState.hasMore = false;
            return;
        }

        appendFeedPosts(normalizedMode, uniquePosts);
        registerFeedPosts(normalizedMode, uniquePosts);

        if (fetchedPosts.length < feedPostFetchSize) {
            modeState.hasMore = false;
        }
    } catch (error) {
        console.error(`Unable to load more ${normalizedMode} feed posts:`, error);
    } finally {
        modeState.isLoading = false;
    }
}


function appendFeedPosts(mode, posts) {
    const normalizedMode = normalizeFeedMode(mode);
    const postsContainer = getFeedContainerByMode(normalizedMode);
    if (!postsContainer || !Array.isArray(posts) || posts.length === 0) {
        return;
    }

    const emptyState = postsContainer.querySelector('.feed-empty-state');
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
    postsContainer.appendChild(fragment);

    initPostLikeButtons(postsContainer);
    initPostCommentButtons(postsContainer);
    initPostMoreMenus(postsContainer);
    initPostShareButtons(postsContainer);
    initPostMediaAudioToggles(postsContainer);

    if (normalizedMode === feedTabState.activeMode) {
        initPostViewTracking(postsContainer);
    }
}


function registerFeedPosts(mode, posts) {
    const normalizedMode = normalizeFeedMode(mode);
    const modeState = getFeedModeState(normalizedMode);
    if (!Array.isArray(posts) || posts.length === 0) {
        return;
    }

    for (const post of posts) {
        const postID = getPostIdentifier(post);
        if (postID === '') {
            continue;
        }
        modeState.loadedPostIDs.add(postID);
    }
}


function normalizeFeedMode(mode) {
    if (mode === feedModeFollowing) {
        return feedModeFollowing;
    }
    if (mode === feedModeYourTeam) {
        return feedModeYourTeam;
    }
    return feedModeForYou;
}


function resolveFeedRequestMode(mode) {
    const normalizedMode = normalizeFeedMode(mode);
    if (normalizedMode === feedModeForYou) {
        return feedModeForYou;
    }
    return feedModeFollowing;
}


function getPostIdentifier(post) {
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
        const postID = normalizePostIdentifier(candidate);
        if (postID !== '') {
            return postID;
        }
    }

    return '';
}


function normalizePostIdentifier(value) {
    if (typeof value === 'string') {
        return value.trim();
    }
    if (!value || typeof value !== 'object') {
        return '';
    }
    if (typeof value.$oid === 'string') {
        return value.$oid.trim();
    }
    if (typeof value.id === 'string') {
        return value.id.trim();
    }
    return '';
}
