import { addBlock, addComment, addLike, addShare, createReport, deletePost, getComments, getLikeStates, getShareStates, recordPostView, removeLike, updatePost } from './api.js';
import { getCurrentUsernameFromAuth } from './auth.js';
import { formatCompactCount, formatCountHoverTitle, normalizeCount } from './number_format.js';


const commentFetchLimit = 200;
const postEditTextMaxChars = 2000;
const postReportReasonMaxChars = 500;
const interactionSoundLikeSrc = '/static/audio/like.mp3';
const interactionSoundUnlikeSrc = '/static/audio/unlike.mp3';

const commentPopupState = {
    root: null,
    card: null,
    status: null,
    list: null,
    form: null,
    input: null,
    submit: null,
    closeButton: null,
    activeRelId: '',
    comments: []
};

const postEditPopupState = {
    root: null,
    form: null,
    textarea: null,
    status: null,
    saveButton: null,
    deleteButton: null,
    closeButtons: [],
    activePostElement: null,
    activePostId: ''
};

const postActionPopupState = {
    root: null,
    status: null,
    closeButtons: []
};

const postReportPopupState = {
    root: null,
    form: null,
    textarea: null,
    status: null,
    submitButton: null,
    closeButtons: [],
    activeRelId: ''
};

let commentPopupKeyListenerBound = false;
let postEditPopupKeyListenerBound = false;
let postActionPopupKeyListenerBound = false;
let postReportPopupKeyListenerBound = false;
let postViewObserver = null;
let postMoreMenuHandlersBound = false;
let postMediaFocusObserver = null;
let postMediaAudioLockPost = null;
let postMediaAudioLockVideo = null;
let postMediaGalleryResizeBound = false;

const postMediaFocusMap = new Map();

const viewedPostRelIDs = new Set();

const postViewIntersectionThreshold = 0.6;
const postMediaFocusIntersectionThreshold = 0.45;

let likeInteractionAudio = null;
let unlikeInteractionAudio = null;


export function drawPost(post) {
    const relId = normalizeRelId(post?.Id || post?.ID || post?._id);
    const profileId = normalizeRelId(post?.ProfileID || post?.profile_id || post?.RelID || post?.rel_id);
    const disabledClass = relId === '' ? ' is-disabled' : '';
    const staticClass = relId === '' ? ' is-disabled' : ' is-static';
    const profileUsername = normalizeTextValue(post?.Username);
    const currentUsername = getCurrentUsernameForPosts();
    const isOwnPost = currentUsername !== '' && profileUsername !== '' && currentUsername.toLowerCase() === profileUsername.toLowerCase();
    const editMenuItemHtml = isOwnPost ? '<button type="button" class="post-more-menu-item post-more-menu-item-edit" data-post-action="edit-post">Edit post</button>' : '';
    const commentCount = normalizeActionCount(post?.CommentCount ?? post?.comment_count);
    const repostCount = normalizeActionCount(post?.RepostCount ?? post?.repost_count);
    const likeCount = normalizeActionCount(post?.LikeCount ?? post?.like_count);
    const viewCount = normalizeActionCount(post?.ViewCount ?? post?.view_count);
    const shareCount = normalizeActionCount(post?.ShareCount ?? post?.share_count);
    const postText = normalizeTextValue(post?.PostText);
    const firstName = normalizeTextValue(post?.FirstName);
    const lastName = normalizeTextValue(post?.LastName);
    const profileDisplayName = normalizeTextValue(`${firstName} ${lastName}`) || profileUsername;
    const profilePictureURL = normalizeTextValue(post?.ProfilePictureURL);
    const profileURL = profileUsername === '' ? '#' : `/profile/${encodeURIComponent(profileUsername)}`;
    const mediaHtml = buildPostMediaHTML(post);

    return `
        <article class="post${disabledClass}" data-rel-id="${relId}">
            <div href="${profileURL}" class="post-header flex-container">
                <a class="profile-photo" href="${profileURL}">
                    <img src="${escapeHTML(profilePictureURL)}" class="profile-photo">
                </a>
                <a class="username" href="${profileURL}">
                    <div class="username">${escapeHTML(profileDisplayName)}</div>
                </a>
                <div class="post-more-menu-shell" data-post-id="${escapeHTML(relId)}" data-post-username="${escapeHTML(profileUsername)}" data-post-profile-id="${escapeHTML(profileId)}">
                    <button type="button" class="post-more-toggle fa-solid" aria-haspopup="true" aria-expanded="false" aria-label="Post actions"></button>
                    <div class="post-more-menu" hidden>
                        ${editMenuItemHtml}
                        <button type="button" class="post-more-menu-item" data-post-action="view-profile">View profile</button>
                        <button type="button" class="post-more-menu-item" data-post-action="message">Message</button>
                        <button type="button" class="post-more-menu-item" data-post-action="copy-link">Copy link</button>
                        <button type="button" class="post-more-menu-item post-more-menu-item-danger" data-post-action="report">Report</button>
                        <button type="button" class="post-more-menu-item post-more-menu-item-danger" data-post-action="block">Block</button>
                    </div>
                </div>
            </div>
            <div class="post-content">
                <p class="post-text">${escapeHTML(postText)}</p>
                ${mediaHtml}
            </div>
            <div class="flex-container bottom-actions">
                <div class="action-item post-comment-button${disabledClass}" data-rel-id="${relId}" data-action-label="comment" data-count="${commentCount}" title="${escapeHTML(buildActionCountHoverTitle('comment', commentCount))}">
                    <span class="post-action-icon fa-light">&#xf075;</span>
                    <span class="post-action-count post-comment-count" title="${escapeHTML(buildActionCountHoverTitle('comment', commentCount))}">${formatActionCount(commentCount)}</span>
                </div>
                <div class="action-item post-repost-button is-disabled${disabledClass}" data-rel-id="${relId}" data-action-label="repost" data-count="${repostCount}" title="${escapeHTML(buildActionCountHoverTitle('repost', repostCount))}">
                    <span class="post-action-icon fa-solid">&#xf079;</span>
                    <span class="post-action-count post-repost-count" title="${escapeHTML(buildActionCountHoverTitle('repost', repostCount))}">${formatActionCount(repostCount)}</span>
                </div>
                <div class="action-item post-like-button${disabledClass}" data-rel-id="${relId}" data-action-label="like" data-count="${likeCount}" title="${escapeHTML(buildActionCountHoverTitle('like', likeCount))}">
                    <span class="post-action-icon post-like-icon fa-light">&#xf004;</span>
                    <span class="post-action-count post-like-count" title="${escapeHTML(buildActionCountHoverTitle('like', likeCount))}">${formatActionCount(likeCount)}</span>
                </div>
                <div class="action-item post-view-button${staticClass}" data-rel-id="${relId}" data-action-label="view" data-count="${viewCount}" title="${escapeHTML(buildActionCountHoverTitle('view', viewCount))}">
                    <span class="post-action-icon fa-light">&#xf06e;</span>
                    <span class="post-action-count post-view-count" title="${escapeHTML(buildActionCountHoverTitle('view', viewCount))}">${formatActionCount(viewCount)}</span>
                </div>
                <div class="action-item post-share-button${disabledClass}" data-rel-id="${relId}" data-action-label="share" data-count="${shareCount}" data-post-username="${escapeHTML(profileUsername)}" title="${escapeHTML(buildActionCountHoverTitle('share', shareCount))}">
                    <span class="post-action-icon fa-light">&#xf14d;</span>
                    <span class="post-action-count post-share-count" title="${escapeHTML(buildActionCountHoverTitle('share', shareCount))}">${formatActionCount(shareCount)}</span>
                </div>
            </div>
        </article>
    `;
}

function buildPostMediaHTML(post) {
    const attachments = normalizePostAttachments(post);
    if (attachments.length === 0) {
        return '';
    }

    const multipleClass = attachments.length > 1 ? ' is-multi' : '';
    const itemsHtml = attachments.map((attachment) => {
        if (attachment.type === 'video') {
            return `
                <figure class="post-media-item post-media-item-video">
                    <video class="post-media-video" src="${escapeHTML(attachment.url)}" autoplay muted loop preload="metadata" playsinline></video>
                    <button type="button" class="post-media-audio-toggle fa-solid" data-is-muted="true" aria-label="Unmute video" title="Unmute video">&#xf6a9;</button>
                </figure>
            `;
        }

        return `
            <figure class="post-media-item post-media-item-image">
                <img class="post-media-image" src="${escapeHTML(attachment.url)}" loading="lazy" alt="Post attachment">
            </figure>
        `;
    }).join('');

    return `<div class="post-media-gallery${multipleClass}">${itemsHtml}</div>`;
}

export function initPostMediaAudioToggles(root = document) {
    initPostMediaGallerySizing(root);

    const toggleButtons = collectPostMediaAudioToggleButtons(root);
    if (toggleButtons.length > 0) {
        for (const toggleButton of toggleButtons) {
            if (!(toggleButton instanceof HTMLButtonElement)) {
                continue;
            }
            if (toggleButton.dataset.audioToggleBound === 'true') {
                continue;
            }
            toggleButton.dataset.audioToggleBound = 'true';

            const mediaItem = toggleButton.closest('.post-media-item-video');
            const videoElement = mediaItem ? mediaItem.querySelector('.post-media-video') : null;
            if (!(videoElement instanceof HTMLVideoElement)) {
                continue;
            }

            videoElement.muted = true;
            videoElement.defaultMuted = true;
            const playPromise = videoElement.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {
                });
            }

            syncPostMediaAudioToggle(toggleButton, videoElement);

            toggleButton.addEventListener('click', () => {
                const targetPostElement = findPostElementForVideo(videoElement);
                if (!(targetPostElement instanceof HTMLElement)) {
                    return;
                }

                const shouldUnmute = videoElement.muted === true;
                if (shouldUnmute) {
                    updatePostMediaAudioFocusLock();
                    return;
                }

                videoElement.muted = true;
                videoElement.defaultMuted = true;
                if (postMediaAudioLockVideo === videoElement) {
                    postMediaAudioLockVideo = null;
                    postMediaAudioLockPost = null;
                }
                syncPostMediaAudioToggle(toggleButton, videoElement);
            });
        }
    }

    const postElements = collectPostElements(root);
    bindPostMediaFocusObserver(postElements);
    updatePostMediaAudioFocusLock();
}

function syncPostMediaAudioToggle(toggleButton, videoElement) {
    if (!(toggleButton instanceof HTMLElement) || !(videoElement instanceof HTMLVideoElement)) {
        return;
    }

    const isMuted = videoElement.muted === true;
    toggleButton.dataset.isMuted = isMuted ? 'true' : 'false';
    toggleButton.innerHTML = isMuted ? '&#xf6a9;' : '&#xf028;';
    toggleButton.setAttribute('aria-label', isMuted ? 'Unmute video' : 'Mute video');
    toggleButton.setAttribute('title', isMuted ? 'Unmute video' : 'Mute video');
}

function collectPostMediaAudioToggleButtons(root) {
    if (!(root instanceof Element)) {
        return Array.from(document.querySelectorAll('.post-media-audio-toggle'));
    }
    const toggleButtons = Array.from(root.querySelectorAll('.post-media-audio-toggle'));
    if (root instanceof HTMLElement && root.classList.contains('post-media-audio-toggle')) {
        toggleButtons.push(root);
    }
    return toggleButtons;
}

function collectPostElements(root) {
    if (!(root instanceof Element)) {
        return Array.from(document.querySelectorAll('.post'));
    }
    const posts = Array.from(root.querySelectorAll('.post'));
    if (root instanceof HTMLElement && root.classList.contains('post')) {
        posts.unshift(root);
    }
    return posts;
}

function collectPostMediaGalleries(root) {
    if (!(root instanceof Element)) {
        return Array.from(document.querySelectorAll('.post-media-gallery.is-multi'));
    }
    const galleries = Array.from(root.querySelectorAll('.post-media-gallery.is-multi'));
    if (root instanceof HTMLElement && root.classList.contains('post-media-gallery') && root.classList.contains('is-multi')) {
        galleries.unshift(root);
    }
    return galleries;
}

function initPostMediaGallerySizing(root) {
    if (typeof window === 'undefined') {
        return;
    }

    const galleries = collectPostMediaGalleries(root);
    for (const galleryElement of galleries) {
        if (!(galleryElement instanceof HTMLElement)) {
            continue;
        }
        if (galleryElement.dataset.gallerySizingBound === 'true') {
            continue;
        }
        galleryElement.dataset.gallerySizingBound = 'true';

        let resizeFrameID = 0;
        const scheduleResize = () => {
            if (resizeFrameID !== 0) {
                return;
            }
            resizeFrameID = window.requestAnimationFrame(() => {
                resizeFrameID = 0;
                updatePostMediaGalleryHeight(galleryElement);
            });
        };

        galleryElement.addEventListener('scroll', scheduleResize, { passive: true });

        const mediaElements = Array.from(galleryElement.querySelectorAll('.post-media-image, .post-media-video'));
        for (const mediaElement of mediaElements) {
            if (mediaElement instanceof HTMLImageElement) {
                if (mediaElement.complete === false) {
                    mediaElement.addEventListener('load', scheduleResize, { once: true });
                }
                continue;
            }
            if (mediaElement instanceof HTMLVideoElement) {
                mediaElement.addEventListener('loadedmetadata', scheduleResize, { once: true });
                mediaElement.addEventListener('canplay', scheduleResize, { once: true });
            }
        }

        scheduleResize();
    }

    if (postMediaGalleryResizeBound) {
        return;
    }
    postMediaGalleryResizeBound = true;
    window.addEventListener('resize', () => {
        const allGalleries = Array.from(document.querySelectorAll('.post-media-gallery.is-multi'));
        for (const galleryElement of allGalleries) {
            updatePostMediaGalleryHeight(galleryElement);
        }
    });
}

function updatePostMediaGalleryHeight(galleryElement) {
    if (!(galleryElement instanceof HTMLElement)) {
        return;
    }

    const items = Array.from(galleryElement.querySelectorAll('.post-media-item'));
    if (items.length === 0) {
        galleryElement.style.removeProperty('height');
        return;
    }

    const galleryWidth = Math.max(1, galleryElement.clientWidth);
    const rawIndex = Math.round(galleryElement.scrollLeft / galleryWidth);
    const activeIndex = Math.max(0, Math.min(items.length - 1, rawIndex));
    const activeItem = items[activeIndex];
    if (!(activeItem instanceof HTMLElement)) {
        return;
    }

    let targetHeight = 0;
    const mediaElement = activeItem.querySelector('.post-media-image, .post-media-video');
    if (mediaElement instanceof HTMLElement) {
        targetHeight = Math.ceil(mediaElement.getBoundingClientRect().height);
    }
    if (targetHeight <= 0) {
        targetHeight = Math.ceil(activeItem.getBoundingClientRect().height);
    }
    if (targetHeight <= 0) {
        return;
    }

    galleryElement.style.height = `${targetHeight}px`;
}

function bindPostMediaFocusObserver(postElements) {
    if (!Array.isArray(postElements) || postElements.length === 0) {
        return;
    }
    if (typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') {
        return;
    }

    if (postMediaFocusObserver == null) {
        postMediaFocusObserver = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!(entry.target instanceof HTMLElement)) {
                        continue;
                    }
                    const ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
                    postMediaFocusMap.set(entry.target, ratio);
                }
                updatePostMediaAudioFocusLock();
            },
            {
                threshold: [0, 0.25, 0.5, 0.7, 0.85, 1]
            }
        );
    }

    for (const postElement of postElements) {
        if (!(postElement instanceof HTMLElement)) {
            continue;
        }
        if (postElement.dataset.mediaFocusBound === 'true') {
            continue;
        }
        if (postElement.querySelector('.post-media-video') == null) {
            continue;
        }

        postElement.dataset.mediaFocusBound = 'true';
        postMediaFocusMap.set(postElement, 0);
        postMediaFocusObserver.observe(postElement);
    }
}

function updatePostMediaAudioFocusLock() {
    let bestPost = null;
    let bestRatio = 0;

    for (const [postElement, ratio] of postMediaFocusMap.entries()) {
        if (!(postElement instanceof HTMLElement) || !document.body.contains(postElement)) {
            postMediaFocusMap.delete(postElement);
            continue;
        }
        if (ratio > bestRatio) {
            bestRatio = ratio;
            bestPost = postElement;
        }
    }

    if (!(bestPost instanceof HTMLElement) || bestRatio < postMediaFocusIntersectionThreshold) {
        applyPostMediaAudioLock(null, null);
        return;
    }

    const focusVideo = resolvePrimaryPostVideo(bestPost);
    if (!(focusVideo instanceof HTMLVideoElement)) {
        applyPostMediaAudioLock(null, null);
        return;
    }
    applyPostMediaAudioLock(bestPost, focusVideo);
}

function resolvePrimaryPostVideo(postElement) {
    if (!(postElement instanceof HTMLElement)) {
        return null;
    }

    const videos = Array.from(postElement.querySelectorAll('.post-media-video'))
        .filter((videoElement) => videoElement instanceof HTMLVideoElement);
    if (videos.length === 0) {
        return null;
    }
    if (videos.length === 1) {
        return videos[0];
    }

    let bestVideo = videos[0];
    let bestVisibleArea = -1;
    for (const videoElement of videos) {
        const rect = videoElement.getBoundingClientRect();
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
        const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
        const visibleArea = visibleWidth * visibleHeight;
        if (visibleArea > bestVisibleArea) {
            bestVisibleArea = visibleArea;
            bestVideo = videoElement;
        }
    }
    return bestVideo;
}

function applyPostMediaAudioLock(lockPostElement, lockVideoElement) {
    const allVideos = Array.from(document.querySelectorAll('.post-media-video'))
        .filter((videoElement) => videoElement instanceof HTMLVideoElement);
    if (allVideos.length === 0) {
        postMediaAudioLockPost = null;
        postMediaAudioLockVideo = null;
        return;
    }

    const allowAudioLock = lockPostElement instanceof HTMLElement && lockVideoElement instanceof HTMLVideoElement;
    postMediaAudioLockPost = allowAudioLock ? lockPostElement : null;
    postMediaAudioLockVideo = allowAudioLock ? lockVideoElement : null;

    for (const videoElement of allVideos) {
        const shouldUnmute = allowAudioLock && videoElement === lockVideoElement;
        videoElement.muted = !shouldUnmute;
        videoElement.defaultMuted = !shouldUnmute;
        if (shouldUnmute) {
            const playPromise = videoElement.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {
                });
            }
        }

        const mediaItem = videoElement.closest('.post-media-item-video');
        const toggleButton = mediaItem ? mediaItem.querySelector('.post-media-audio-toggle') : null;
        if (toggleButton instanceof HTMLElement) {
            syncPostMediaAudioToggle(toggleButton, videoElement);
        }
    }
}

function findPostElementForVideo(videoElement) {
    if (!(videoElement instanceof HTMLElement)) {
        return null;
    }
    return videoElement.closest('.post');
}

export function initPostViewTracking(root = document) {
    const postElements = Array.from(root.querySelectorAll('.post'));
    if (postElements.length === 0) {
        return;
    }

    const supportsIntersectionObserver = typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function';
    if (supportsIntersectionObserver === false) {
        for (const postElement of postElements) {
            markPostAsViewed(postElement);
        }
        return;
    }

    if (postViewObserver == null) {
        postViewObserver = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting !== true) {
                        continue;
                    }
                    if (entry.intersectionRatio < postViewIntersectionThreshold) {
                        continue;
                    }

                    markPostAsViewed(entry.target);
                    postViewObserver.unobserve(entry.target);
                }
            },
            {
                threshold: [postViewIntersectionThreshold]
            }
        );
    }

    for (const postElement of postElements) {
        if (!(postElement instanceof HTMLElement)) {
            continue;
        }
        if (postElement.dataset.viewBound === 'true') {
            continue;
        }

        postElement.dataset.viewBound = 'true';
        postViewObserver.observe(postElement);
    }
}


export function initPostLikeButtons(root = document) {
    const likeButtons = Array.from(root.querySelectorAll('.post-like-button'));
    const relIDsSet = new Set();

    for (const button of likeButtons) {
        if (button.dataset.likeBound === 'true') {
            continue;
        }
        button.dataset.likeBound = 'true';

        const relId = normalizeRelId(button.dataset.relId || '');
        if (relId === '') {
            setPostLikeButtonDisabled(button);
            continue;
        }
        button.dataset.relId = relId;
        button.classList.add('is-loading');
        relIDsSet.add(relId);

        button.addEventListener('click', () => {
            const isCurrentlyLiked = button.classList.contains('is-active');
            playInteractionToggleSound(!isCurrentlyLiked);
            void toggleLikeForRelID(root, relId);
        });
    }

    if (relIDsSet.size > 0) {
        void loadLikeStatesBatch(root, Array.from(relIDsSet));
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


export function initPostCommentButtons(root = document) {
    ensureCommentPopup();

    const commentButtons = Array.from(root.querySelectorAll('.post-comment-button'));
    for (const button of commentButtons) {
        if (button.dataset.commentBound === 'true') {
            continue;
        }
        button.dataset.commentBound = 'true';

        const relId = normalizeRelId(button.dataset.relId || '');
        if (relId === '') {
            button.classList.add('is-disabled');
            continue;
        }
        button.dataset.relId = relId;

        button.addEventListener('click', () => {
            void openCommentPopup(relId);
        });
    }
}


export function initPostShareButtons(root = document) {
    const shareButtons = Array.from(root.querySelectorAll('.post-share-button'));
    const relIDsSet = new Set();

    for (const button of shareButtons) {
        if (button.dataset.shareBound === 'true') {
            continue;
        }
        button.dataset.shareBound = 'true';

        const relId = normalizeRelId(button.dataset.relId || '');
        if (relId === '') {
            button.classList.add('is-disabled');
            continue;
        }
        button.dataset.relId = relId;
        button.classList.add('is-loading');
        relIDsSet.add(relId);

        button.addEventListener('click', () => {
            void handlePostShareClick(button);
        });
    }

    if (relIDsSet.size > 0) {
        void loadShareStatesBatch(root, Array.from(relIDsSet));
    }
}


async function loadShareStatesBatch(root, relIDs) {
    const stateMap = {};
    try {
        const response = await getShareStates(relIDs);
        const responseMap = response?.is_shared;
        if (responseMap && typeof responseMap === 'object') {
            for (const [relId, isShared] of Object.entries(responseMap)) {
                stateMap[normalizeRelId(relId)] = Boolean(isShared);
            }
        }
    } catch (_) {
    }

    const buttons = Array.from(root.querySelectorAll('.post-share-button'));
    for (const button of buttons) {
        const relId = normalizeRelId(button.dataset.relId || '');
        if (relId === '') {
            button.classList.add('is-disabled');
            continue;
        }

        setPostShareButtonState(button, Boolean(stateMap[relId]));
        button.classList.remove('is-loading');
    }
}

export function initPostMoreMenus(root = document) {
    ensurePostEditPopup();
    ensurePostReportPopup();

    const menuShells = Array.from(root.querySelectorAll('.post-more-menu-shell'));
    for (const menuShell of menuShells) {
        if (!(menuShell instanceof HTMLElement)) {
            continue;
        }
        if (menuShell.dataset.moreMenuBound === 'true') {
            continue;
        }
        menuShell.dataset.moreMenuBound = 'true';

        const toggleButton = menuShell.querySelector('.post-more-toggle');
        const menu = menuShell.querySelector('.post-more-menu');
        if (!toggleButton || !menu) {
            continue;
        }

        const closeMenu = () => {
            menu.hidden = true;
            toggleButton.setAttribute('aria-expanded', 'false');
            menuShell.classList.remove('is-open');
        };

        const openMenu = () => {
            closeAllPostMoreMenus();
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
            const actionButton = event.target.closest('.post-more-menu-item');
            if (!actionButton) {
                return;
            }

            const action = normalizeTextValue(actionButton.dataset.postAction);
            const profileUsername = normalizeTextValue(menuShell.dataset.postUsername);
            const profileId = normalizeRelId(menuShell.dataset.postProfileId || '');
            if (action === 'edit-post') {
                const postElement = menuShell.closest('.post');
                if (postElement instanceof HTMLElement) {
                    openPostEditPopup(postElement);
                }
                closeMenu();
                return;
            }

            if (action === 'view-profile') {
                if (profileUsername !== '') {
                    window.location.href = `/profile/${encodeURIComponent(profileUsername)}`;
                }
                closeMenu();
                return;
            }

            if (action === 'message') {
                if (profileUsername === '') {
                    showPostActionPopup('Unable to resolve username for message.', true);
                    closeMenu();
                    return;
                }

                window.location.href = `/chat?username=${encodeURIComponent(profileUsername)}`;
                closeMenu();
                return;
            }

            if (action === 'copy-link') {
                const relId = normalizeRelId(menuShell.dataset.postId || '');
                if (relId === '') {
                    showPostActionPopup('Unable to resolve post ID for link copy.', true);
                    closeMenu();
                    return;
                }

                await copyShareURL(buildPostShareURL(relId));
                showPostActionPopup('Link copied', false);
                closeMenu();
                return;
            }

            if (action === 'report') {
                const relId = normalizeRelId(menuShell.dataset.postId || '');
                if (relId === '') {
                    showPostActionPopup('Unable to resolve post ID for report.', true);
                    closeMenu();
                    return;
                }

                openPostReportPopup(relId);
                closeMenu();
                return;
            }

            if (action === 'block') {
                if (profileUsername === '') {
                    showPostActionPopup('Unable to resolve username for block.', true);
                    closeMenu();
                    return;
                }
                if (profileId === '') {
                    showPostActionPopup('Unable to resolve profile ID for block.', true);
                    closeMenu();
                    return;
                }

                actionButton.disabled = true;
                try {
                    await addBlock(profileId);
                    removeRenderedFeedPosts(profileId, profileUsername);
                    showPostActionPopup('Account blocked. You will no longer see this profile in feed or search.', false);
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unable to block account.';
                    showPostActionPopup(message, true);
                } finally {
                    actionButton.disabled = false;
                }
                closeMenu();
            }
        });
    }

    bindPostMoreMenuGlobalHandlers();
}

function bindPostMoreMenuGlobalHandlers() {
    if (postMoreMenuHandlersBound) {
        return;
    }
    postMoreMenuHandlersBound = true;

    document.addEventListener('click', (event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (target && target.closest('.post-more-menu-shell')) {
            return;
        }
        closeAllPostMoreMenus();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeAllPostMoreMenus();
            closePostEditPopup();
            closePostReportPopup();
        }
    });
}

function closeAllPostMoreMenus() {
    const menus = Array.from(document.querySelectorAll('.post-more-menu-shell'));
    for (const menuShell of menus) {
        const toggleButton = menuShell.querySelector('.post-more-toggle');
        const menu = menuShell.querySelector('.post-more-menu');
        if (!toggleButton || !menu) {
            continue;
        }
        menu.hidden = true;
        toggleButton.setAttribute('aria-expanded', 'false');
        menuShell.classList.remove('is-open');
    }
}

function removeRenderedFeedPosts(profileId, username) {
    const normalizedProfileId = normalizeRelId(profileId);
    const normalizedUsername = normalizeTextValue(username).toLowerCase();
    if (normalizedProfileId === '' && normalizedUsername === '') {
        return;
    }

    const feedContainers = Array.from(document.querySelectorAll('.feed-post-list'));
    if (feedContainers.length === 0) {
        return;
    }

    for (const feedContainer of feedContainers) {
        if (!(feedContainer instanceof HTMLElement)) {
            continue;
        }

        const renderedPosts = Array.from(feedContainer.querySelectorAll('.post'));
        for (const postElement of renderedPosts) {
            if (!(postElement instanceof HTMLElement)) {
                continue;
            }

            const menuShell = postElement.querySelector('.post-more-menu-shell');
            if (!(menuShell instanceof HTMLElement)) {
                continue;
            }

            const candidateProfileId = normalizeRelId(menuShell.dataset.postProfileId || '');
            const candidateUsername = normalizeTextValue(menuShell.dataset.postUsername || '').toLowerCase();

            const isProfileMatch = normalizedProfileId !== '' && candidateProfileId === normalizedProfileId;
            const isUsernameMatch = normalizedUsername !== '' && candidateUsername === normalizedUsername;
            if (isProfileMatch || isUsernameMatch) {
                postElement.remove();
            }
        }

        const remainingPosts = feedContainer.querySelectorAll('.post');
        if (remainingPosts.length > 0) {
            continue;
        }
        if (feedContainer.querySelector('.feed-empty-state')) {
            continue;
        }

        const emptyState = document.createElement('p');
        emptyState.className = 'search-page-status feed-empty-state';
        emptyState.textContent = 'No feed posts available yet.';
        feedContainer.appendChild(emptyState);
    }
}

function ensurePostActionPopup() {
    if (postActionPopupState.root && document.body.contains(postActionPopupState.root)) {
        return;
    }

    const popupRoot = document.createElement('div');
    popupRoot.className = 'post-action-popup';
    popupRoot.innerHTML = `
        <button type="button" class="post-action-popup-backdrop post-action-popup-close" aria-label="Close notification"></button>
        <section class="post-action-popup-card" role="dialog" aria-modal="true" aria-label="Action status">
            <button type="button" class="post-action-popup-close-button post-action-popup-close" aria-label="Close notification">×</button>
            <p class="post-action-popup-status"></p>
        </section>
    `;
    document.body.appendChild(popupRoot);

    postActionPopupState.root = popupRoot;
    postActionPopupState.status = popupRoot.querySelector('.post-action-popup-status');
    postActionPopupState.closeButtons = Array.from(popupRoot.querySelectorAll('.post-action-popup-close'));
    for (const closeButton of postActionPopupState.closeButtons) {
        closeButton.addEventListener('click', closePostActionPopup);
    }

    if (!postActionPopupKeyListenerBound) {
        postActionPopupKeyListenerBound = true;
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closePostActionPopup();
            }
        });
    }
}

function showPostActionPopup(message, isError) {
    ensurePostActionPopup();
    if (!postActionPopupState.root || !postActionPopupState.status) {
        return;
    }

    postActionPopupState.status.textContent = normalizeTextValue(message);
    postActionPopupState.status.classList.toggle('is-error', Boolean(isError));
    postActionPopupState.root.classList.add('is-active');
    document.body.classList.add('post-action-popup-open');
}

function closePostActionPopup() {
    if (!postActionPopupState.root) {
        return;
    }

    postActionPopupState.root.classList.remove('is-active');
    document.body.classList.remove('post-action-popup-open');
}

function ensurePostReportPopup() {
    if (postReportPopupState.root && document.body.contains(postReportPopupState.root)) {
        return;
    }

    const popupRoot = document.createElement('div');
    popupRoot.className = 'post-report-popup';
    popupRoot.innerHTML = `
        <button type="button" class="post-report-popup-backdrop post-report-popup-close" aria-label="Close report dialog"></button>
        <section class="post-report-popup-card" role="dialog" aria-modal="true" aria-labelledby="post-report-popup-title">
            <header class="post-report-popup-header">
                <h3 id="post-report-popup-title">Report Post</h3>
                <button type="button" class="post-report-popup-close-button post-report-popup-close" aria-label="Close report dialog">×</button>
            </header>
            <form class="post-report-popup-form">
                <label class="post-report-popup-field">
                    <span>Why are you reporting this post?</span>
                    <textarea class="post-report-popup-textarea" maxlength="${postReportReasonMaxChars}" placeholder="Explain the issue..." required></textarea>
                </label>
                <p class="post-report-popup-status" aria-live="polite"></p>
                <div class="post-report-popup-actions">
                    <button type="button" class="post-report-popup-cancel post-report-popup-close">Cancel</button>
                    <button type="submit" class="post-report-popup-submit">Submit report</button>
                </div>
            </form>
        </section>
    `;
    document.body.appendChild(popupRoot);

    postReportPopupState.root = popupRoot;
    postReportPopupState.form = popupRoot.querySelector('.post-report-popup-form');
    postReportPopupState.textarea = popupRoot.querySelector('.post-report-popup-textarea');
    postReportPopupState.status = popupRoot.querySelector('.post-report-popup-status');
    postReportPopupState.submitButton = popupRoot.querySelector('.post-report-popup-submit');
    postReportPopupState.closeButtons = Array.from(popupRoot.querySelectorAll('.post-report-popup-close'));

    for (const closeButton of postReportPopupState.closeButtons) {
        closeButton.addEventListener('click', closePostReportPopup);
    }
    if (postReportPopupState.form) {
        postReportPopupState.form.addEventListener('submit', (event) => {
            void handlePostReportSubmit(event);
        });
    }

    if (!postReportPopupKeyListenerBound) {
        postReportPopupKeyListenerBound = true;
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closePostReportPopup();
            }
        });
    }
}

function openPostReportPopup(relId) {
    const normalizedRelId = normalizeRelId(relId);
    if (normalizedRelId === '') {
        return;
    }

    ensurePostReportPopup();

    postReportPopupState.activeRelId = normalizedRelId;
    setPostReportPopupStatus('', false);
    setPostReportPopupBusy(false);
    if (postReportPopupState.textarea) {
        postReportPopupState.textarea.value = '';
    }

    if (postReportPopupState.root) {
        postReportPopupState.root.classList.add('is-active');
    }
    document.body.classList.add('post-report-popup-open');

    if (postReportPopupState.textarea) {
        postReportPopupState.textarea.focus();
    }
}

function closePostReportPopup() {
    postReportPopupState.activeRelId = '';
    if (postReportPopupState.root) {
        postReportPopupState.root.classList.remove('is-active');
    }
    document.body.classList.remove('post-report-popup-open');
    setPostReportPopupStatus('', false);
}

function setPostReportPopupStatus(message, isError) {
    if (!postReportPopupState.status) {
        return;
    }

    postReportPopupState.status.textContent = normalizeTextValue(message);
    postReportPopupState.status.classList.toggle('is-error', Boolean(isError));
}

function setPostReportPopupBusy(isBusy) {
    if (postReportPopupState.textarea) {
        postReportPopupState.textarea.disabled = Boolean(isBusy);
    }
    if (postReportPopupState.submitButton) {
        postReportPopupState.submitButton.disabled = Boolean(isBusy);
    }
}

async function handlePostReportSubmit(event) {
    event.preventDefault();

    const relId = normalizeRelId(postReportPopupState.activeRelId);
    if (relId === '' || !postReportPopupState.textarea) {
        return;
    }

    const reason = normalizeTextValue(postReportPopupState.textarea.value);
    if (reason === '') {
        setPostReportPopupStatus('Please provide a reason for this report.', true);
        return;
    }

    setPostReportPopupStatus('Submitting report...', false);
    setPostReportPopupBusy(true);
    try {
        await createReport(relId, 'post', reason);
        closePostReportPopup();
        showPostActionPopup('Post report submitted.', false);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to submit report.';
        setPostReportPopupStatus(message, true);
    } finally {
        setPostReportPopupBusy(false);
    }
}


async function loadLikeStatesBatch(root, relIDs) {
    const stateMap = {};
    try {
        const response = await getLikeStates(relIDs);
        const responseMap = response?.is_liked;
        if (responseMap && typeof responseMap === 'object') {
            for (const [relId, isLiked] of Object.entries(responseMap)) {
                stateMap[normalizeRelId(relId)] = Boolean(isLiked);
            }
        }
    } catch (_) {
    }

    const buttons = Array.from(root.querySelectorAll('.post-like-button'));
    for (const button of buttons) {
        const relId = normalizeRelId(button.dataset.relId || '');
        if (relId === '') {
            setPostLikeButtonDisabled(button);
            continue;
        }
        setPostLikeButtonState(button, Boolean(stateMap[relId]));
        button.classList.remove('is-loading');
    }
}


async function toggleLikeForRelID(root, relId) {
    const buttons = getPostLikeButtonsByRelID(root, relId);
    if (buttons.length === 0) {
        return;
    }

    if (buttons.some((button) => button.classList.contains('is-loading') || button.classList.contains('is-disabled'))) {
        return;
    }

    const isCurrentlyLiked = buttons.some((button) => button.classList.contains('is-active'));
    for (const button of buttons) {
        button.classList.add('is-loading');
    }

    try {
        const response = isCurrentlyLiked ? await removeLike(relId) : await addLike(relId);
        const isLiked = Boolean(response?.is_liked);
        const countDelta = isLiked === isCurrentlyLiked ? 0 : (isLiked ? 1 : -1);
        for (const button of buttons) {
            if (countDelta !== 0) {
                adjustPostActionCount(button, countDelta);
            }
            setPostLikeButtonState(button, isLiked);
        }
    } catch (_) {
    } finally {
        for (const button of buttons) {
            button.classList.remove('is-loading');
        }
    }
}


function getPostLikeButtonsByRelID(root, relId) {
    const normalizedRelId = normalizeRelId(relId);
    if (normalizedRelId === '') {
        return [];
    }

    const buttons = Array.from(root.querySelectorAll('.post-like-button'));
    return buttons.filter((button) => normalizeRelId(button.dataset.relId || '') === normalizedRelId);
}


function setPostLikeButtonState(button, isLiked) {
    if (!button) {
        return;
    }

    const icon = button.querySelector('.post-like-icon');

    if (isLiked) {
        button.classList.add('is-active');
        if (icon) {
            icon.classList.remove('fa-light');
            icon.classList.add('fa-solid');
        }
        return;
    }

    button.classList.remove('is-active');
    if (icon) {
        icon.classList.remove('fa-solid');
        icon.classList.add('fa-light');
    }
}


function setPostLikeButtonDisabled(button) {
    if (!button) {
        return;
    }
    button.classList.remove('is-active');
    button.classList.add('is-disabled');
}


function setPostShareButtonState(button, isShared) {
    if (!button) {
        return;
    }

    if (isShared) {
        button.classList.add('is-active');
        return;
    }

    button.classList.remove('is-active');
}


async function handlePostShareClick(button) {
    if (!button || button.classList.contains('is-disabled') || button.classList.contains('is-loading')) {
        return;
    }

    const relId = normalizeRelId(button.dataset.relId || '');
    if (relId === '') {
        button.classList.add('is-disabled');
        return;
    }

    const shareURL = buildPostShareURL(relId);
    const shareText = buildPostShareText(button.dataset.postUsername || '');
    const shouldCopyOnDesktop = isDesktopViewport();
    button.classList.add('is-loading');
    try {
        const wasShared = button.classList.contains('is-active');
        if (shouldCopyOnDesktop) {
            await copyShareURL(shareURL);
            showPostActionPopup('Link copied', false);
        } else if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
            const payload = {
                title: document.title,
                url: shareURL
            };
            if (shareText !== '') {
                payload.text = shareText;
            }
            await navigator.share(payload);
        } else {
            await copyShareURL(shareURL);
            showPostActionPopup('Link copied', false);
        }

        const response = await addShare(relId);
        const isShared = Boolean(response?.is_shared);
        setPostShareButtonState(button, isShared);
        if (isShared && !wasShared) {
            adjustPostActionCount(button, 1);
        }
    } catch (error) {
        if (!error || error.name !== 'AbortError') {
            await copyShareURL(shareURL);
            showPostActionPopup('Link copied', false);
        }
    } finally {
        button.classList.remove('is-loading');
    }
}


function buildPostShareURL(relId) {
    const normalizedRelId = normalizeRelId(relId);
    if (typeof window === 'undefined') {
        return '';
    }

    const currentURL = window.location.href.split('#')[0];
    if (normalizedRelId === '') {
        return currentURL;
    }
    return `${currentURL}#post-${encodeURIComponent(normalizedRelId)}`;
}


function buildPostShareText(rawUsername) {
    const username = normalizeTextValue(rawUsername);
    if (username === '') {
        return 'Check out this post';
    }
    return `Check out this post from @${username}`;
}


function isDesktopViewport() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    return window.matchMedia('(min-width: 800px)').matches;
}


async function copyShareURL(shareURL) {
    if (!shareURL) {
        return;
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(shareURL);
            return;
        } catch (_) {
        }
    }

    if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
        window.prompt('Copy this link:', shareURL);
    }
}


function ensurePostEditPopup() {
    if (postEditPopupState.root && document.body.contains(postEditPopupState.root)) {
        return;
    }

    const popupRoot = document.createElement('div');
    popupRoot.className = 'post-edit-popup';
    popupRoot.innerHTML = `
        <div class="post-edit-popup-backdrop post-edit-popup-close-trigger"></div>
        <section class="post-edit-popup-card" role="dialog" aria-modal="true" aria-labelledby="post-edit-popup-title">
            <header class="post-edit-popup-header">
                <h3 id="post-edit-popup-title">Edit post</h3>
                <button type="button" class="post-edit-popup-close-button post-edit-popup-close-trigger" aria-label="Close edit post">×</button>
            </header>
            <form class="post-edit-popup-form">
                <label class="post-edit-popup-field">
                    <span>Post text</span>
                    <textarea class="post-edit-popup-textarea" maxlength="${postEditTextMaxChars}" required></textarea>
                </label>
                <p class="post-edit-popup-status" aria-live="polite"></p>
                <div class="post-edit-popup-actions">
                    <button type="button" class="post-edit-popup-delete">Delete post</button>
                    <button type="submit" class="post-edit-popup-save">Save edits</button>
                </div>
            </form>
        </section>
    `;
    document.body.appendChild(popupRoot);

    postEditPopupState.root = popupRoot;
    postEditPopupState.form = popupRoot.querySelector('.post-edit-popup-form');
    postEditPopupState.textarea = popupRoot.querySelector('.post-edit-popup-textarea');
    postEditPopupState.status = popupRoot.querySelector('.post-edit-popup-status');
    postEditPopupState.saveButton = popupRoot.querySelector('.post-edit-popup-save');
    postEditPopupState.deleteButton = popupRoot.querySelector('.post-edit-popup-delete');
    postEditPopupState.closeButtons = Array.from(popupRoot.querySelectorAll('.post-edit-popup-close-trigger'));

    for (const closeButton of postEditPopupState.closeButtons) {
        closeButton.addEventListener('click', closePostEditPopup);
    }
    if (postEditPopupState.form) {
        postEditPopupState.form.addEventListener('submit', (event) => {
            void handlePostEditSave(event);
        });
    }
    if (postEditPopupState.deleteButton) {
        postEditPopupState.deleteButton.addEventListener('click', () => {
            void handlePostDelete();
        });
    }

    if (!postEditPopupKeyListenerBound) {
        postEditPopupKeyListenerBound = true;
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closePostEditPopup();
            }
        });
    }
}


function openPostEditPopup(postElement) {
    if (!(postElement instanceof HTMLElement)) {
        return;
    }

    ensurePostEditPopup();

    const postID = normalizeRelId(postElement.dataset.relId || '');
    if (postID === '') {
        return;
    }

    const postTextElement = postElement.querySelector('.post-text');
    const currentText = postTextElement ? String(postTextElement.textContent || '').trim() : '';

    postEditPopupState.activePostElement = postElement;
    postEditPopupState.activePostId = postID;
    if (postEditPopupState.textarea) {
        postEditPopupState.textarea.value = currentText;
    }
    setPostEditPopupStatus('', false);
    setPostEditPopupBusy(false);

    if (postEditPopupState.root) {
        postEditPopupState.root.classList.add('is-active');
        postEditPopupState.root.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.add('post-edit-popup-open');

    if (postEditPopupState.textarea) {
        postEditPopupState.textarea.focus();
        postEditPopupState.textarea.setSelectionRange(postEditPopupState.textarea.value.length, postEditPopupState.textarea.value.length);
    }
}


function closePostEditPopup() {
    if (postEditPopupState.root) {
        postEditPopupState.root.classList.remove('is-active');
        postEditPopupState.root.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('post-edit-popup-open');
    postEditPopupState.activePostElement = null;
    postEditPopupState.activePostId = '';
    setPostEditPopupStatus('', false);
}


function setPostEditPopupStatus(message, isError) {
    if (!postEditPopupState.status) {
        return;
    }

    postEditPopupState.status.textContent = normalizeTextValue(message);
    postEditPopupState.status.classList.toggle('is-error', Boolean(isError));
}


function setPostEditPopupBusy(isBusy) {
    if (postEditPopupState.textarea) {
        postEditPopupState.textarea.disabled = Boolean(isBusy);
    }
    if (postEditPopupState.saveButton) {
        postEditPopupState.saveButton.disabled = Boolean(isBusy);
    }
    if (postEditPopupState.deleteButton) {
        postEditPopupState.deleteButton.disabled = Boolean(isBusy);
    }
}


async function handlePostEditSave(event) {
    event.preventDefault();

    const postID = normalizeRelId(postEditPopupState.activePostId);
    const postElement = postEditPopupState.activePostElement;
    if (postID === '' || !(postElement instanceof HTMLElement) || !postEditPopupState.textarea) {
        return;
    }

    let postText = normalizeTextValue(postEditPopupState.textarea.value);
    if (postText === '') {
        setPostEditPopupStatus('Post text is required.', true);
        return;
    }
    if (postText.length > postEditTextMaxChars) {
        postText = postText.slice(0, postEditTextMaxChars);
    }

    setPostEditPopupStatus('Saving...', false);
    setPostEditPopupBusy(true);
    try {
        const response = await updatePost(postID, postText);
        const updatedText = normalizeTextValue(response?.post?.PostText);
        if (updatedText === '') {
            throw new Error('Unable to save post edits.');
        }
        const postTextElement = postElement.querySelector('.post-text');
        if (postTextElement) {
            postTextElement.textContent = updatedText;
        }
        closePostEditPopup();
    } catch (error) {
        const message = error?.message || 'Unable to save post edits.';
        setPostEditPopupStatus(message, true);
    } finally {
        setPostEditPopupBusy(false);
    }
}


async function handlePostDelete() {
    const postID = normalizeRelId(postEditPopupState.activePostId);
    const postElement = postEditPopupState.activePostElement;
    if (postID === '' || !(postElement instanceof HTMLElement)) {
        return;
    }

    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        const shouldDelete = window.confirm('Delete this post?');
        if (!shouldDelete) {
            return;
        }
    }

    setPostEditPopupStatus('Deleting...', false);
    setPostEditPopupBusy(true);
    try {
        await deletePost(postID);
        postElement.remove();
        if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
            document.dispatchEvent(new CustomEvent('post:deleted', {
                detail: {
                    postId: postID
                }
            }));
        }
        closePostEditPopup();
    } catch (error) {
        const message = error?.message || 'Unable to delete post.';
        setPostEditPopupStatus(message, true);
    } finally {
        setPostEditPopupBusy(false);
    }
}


function ensureCommentPopup() {
    if (commentPopupState.root && document.body.contains(commentPopupState.root)) {
        return;
    }

    const popupRoot = document.createElement('div');
    popupRoot.className = 'post-comment-popup';
    popupRoot.innerHTML = `
        <div class="post-comment-popup-backdrop"></div>
        <section class="post-comment-popup-card" role="dialog" aria-modal="true" aria-label="Comments">
            <header class="post-comment-popup-header">
                <h3>Comments</h3>
                <button type="button" class="post-comment-popup-close" aria-label="Close comments">×</button>
            </header>
            <div class="post-comment-popup-status" aria-live="polite"></div>
            <div class="post-comment-popup-list"></div>
            <form class="post-comment-popup-form">
                <input type="text" class="post-comment-popup-input" placeholder="Write a comment..." maxlength="500" />
                <button type="submit" class="post-comment-popup-submit">Post</button>
            </form>
        </section>
    `;
    document.body.appendChild(popupRoot);

    commentPopupState.root = popupRoot;
    commentPopupState.card = popupRoot.querySelector('.post-comment-popup-card');
    commentPopupState.status = popupRoot.querySelector('.post-comment-popup-status');
    commentPopupState.list = popupRoot.querySelector('.post-comment-popup-list');
    commentPopupState.form = popupRoot.querySelector('.post-comment-popup-form');
    commentPopupState.input = popupRoot.querySelector('.post-comment-popup-input');
    commentPopupState.submit = popupRoot.querySelector('.post-comment-popup-submit');
    commentPopupState.closeButton = popupRoot.querySelector('.post-comment-popup-close');

    const backdrop = popupRoot.querySelector('.post-comment-popup-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', closeCommentPopup);
    }
    if (commentPopupState.closeButton) {
        commentPopupState.closeButton.addEventListener('click', closeCommentPopup);
    }
    if (commentPopupState.form) {
        commentPopupState.form.addEventListener('submit', (event) => {
            void submitComment(event);
        });
    }

    if (!commentPopupKeyListenerBound) {
        commentPopupKeyListenerBound = true;
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && isCommentPopupOpen()) {
                closeCommentPopup();
            }
        });
    }
}


function isCommentPopupOpen() {
    return Boolean(commentPopupState.root && commentPopupState.root.classList.contains('is-active'));
}


async function openCommentPopup(relId) {
    const normalizedRelId = normalizeRelId(relId);
    if (normalizedRelId === '') {
        return;
    }

    ensureCommentPopup();

    commentPopupState.activeRelId = normalizedRelId;
    commentPopupState.comments = [];
    if (commentPopupState.root) {
        commentPopupState.root.classList.add('is-active');
        commentPopupState.root.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.add('post-comment-popup-open');

    if (commentPopupState.input) {
        commentPopupState.input.value = '';
    }

    setCommentPopupStatus('Loading comments...', false);
    renderCommentList([]);

    await loadCommentsForRelID(normalizedRelId);

    if (commentPopupState.input) {
        commentPopupState.input.focus();
    }
}


function closeCommentPopup() {
    commentPopupState.activeRelId = '';
    if (commentPopupState.root) {
        commentPopupState.root.classList.remove('is-active');
        commentPopupState.root.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('post-comment-popup-open');
}


async function loadCommentsForRelID(relId) {
    try {
        const response = await getComments(relId, commentFetchLimit);
        if (commentPopupState.activeRelId !== relId) {
            return;
        }

        const comments = Array.isArray(response?.comments) ? response.comments.map(normalizeComment).filter(Boolean) : [];
        commentPopupState.comments = comments;
        renderCommentList(comments);

        if (comments.length === 0) {
            setCommentPopupStatus('No comments yet. Start the thread.', false);
            return;
        }
        setCommentPopupStatus('', false);
    } catch (error) {
        setCommentPopupStatus(error?.message || 'Unable to load comments.', true);
    }
}


async function submitComment(event) {
    event.preventDefault();

    const relId = normalizeRelId(commentPopupState.activeRelId);
    if (relId === '' || !commentPopupState.input || !commentPopupState.submit) {
        return;
    }

    const commentContent = String(commentPopupState.input.value || '').trim();
    if (commentContent === '') {
        setCommentPopupStatus('Comment cannot be empty.', true);
        return;
    }

    commentPopupState.submit.disabled = true;
    commentPopupState.submit.classList.add('is-loading');
    commentPopupState.input.disabled = true;

    try {
        const response = await addComment(relId, commentContent);
        const newComment = normalizeComment(response?.comment);
        if (newComment) {
            commentPopupState.comments.push(newComment);
            renderCommentList(commentPopupState.comments);
            adjustPostCommentCountByRelID(relId, 1);
        }
        setCommentPopupStatus('', false);
        commentPopupState.input.value = '';
    } catch (error) {
        setCommentPopupStatus(error?.message || 'Unable to submit comment.', true);
    } finally {
        commentPopupState.submit.disabled = false;
        commentPopupState.submit.classList.remove('is-loading');
        commentPopupState.input.disabled = false;
        commentPopupState.input.focus();
    }
}


function normalizeComment(rawComment) {
    if (!rawComment || typeof rawComment !== 'object') {
        return null;
    }

    const relId = normalizeRelId(rawComment.rel_id || rawComment.RelID);
    const username = normalizeTextValue(rawComment.username || rawComment.Username);
    const commentContent = normalizeTextValue(rawComment.comment_content || rawComment.CommentContent);
    const time = normalizeUnixTime(rawComment.time || rawComment.Time);
    const id = normalizeRelId(rawComment._id || rawComment.id || rawComment.ID);

    if (commentContent === '') {
        return null;
    }

    return {
        id,
        relId,
        username: username || 'Unknown',
        commentContent,
        time
    };
}


function renderCommentList(comments) {
    if (!commentPopupState.list) {
        return;
    }

    commentPopupState.list.textContent = '';
    if (!Array.isArray(comments) || comments.length === 0) {
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const comment of comments) {
        const row = document.createElement('article');
        row.className = 'post-comment-row';

        const rowHeader = document.createElement('div');
        rowHeader.className = 'post-comment-row-header';

        const usernameNode = document.createElement('span');
        usernameNode.className = 'post-comment-row-username';
        usernameNode.textContent = comment.username;

        const timeNode = document.createElement('time');
        timeNode.className = 'post-comment-row-time';
        timeNode.textContent = formatCommentTime(comment.time);

        const contentNode = document.createElement('p');
        contentNode.className = 'post-comment-row-content';
        contentNode.textContent = comment.commentContent;

        rowHeader.appendChild(usernameNode);
        rowHeader.appendChild(timeNode);
        row.appendChild(rowHeader);
        row.appendChild(contentNode);
        fragment.appendChild(row);
    }

    commentPopupState.list.appendChild(fragment);
    commentPopupState.list.scrollTop = commentPopupState.list.scrollHeight;
}


function setCommentPopupStatus(message, isError) {
    if (!commentPopupState.status) {
        return;
    }

    const normalizedMessage = normalizeTextValue(message);
    commentPopupState.status.textContent = normalizedMessage;
    commentPopupState.status.classList.toggle('is-error', Boolean(isError));
}


function formatCommentTime(unixTime) {
    const parsedUnix = normalizeUnixTime(unixTime);
    if (parsedUnix <= 0) {
        return '';
    }

    try {
        return new Date(parsedUnix * 1000).toLocaleString();
    } catch (_) {
        return '';
    }
}


function normalizeActionCount(value) {
    return normalizeCount(value);
}


function formatActionCount(value) {
    return formatCompactCount(value);
}


function buildActionCountHoverTitle(actionLabel, value) {
    const normalizedLabel = normalizeTextValue(actionLabel);
    return formatCountHoverTitle(normalizedLabel, value);
}


function adjustPostActionCount(button, delta) {
    if (!(button instanceof HTMLElement)) {
        return;
    }

    const currentCount = normalizeActionCount(button.dataset.count || '0');
    const adjustedCount = Math.max(0, currentCount + delta);
    button.dataset.count = String(adjustedCount);

    const countNode = button.querySelector('.post-action-count');
    if (countNode) {
        countNode.textContent = formatActionCount(adjustedCount);
        const actionLabel = normalizeTextValue(button.dataset.actionLabel);
        if (actionLabel !== '') {
            countNode.setAttribute('title', buildActionCountHoverTitle(actionLabel, adjustedCount));
        } else {
            countNode.removeAttribute('title');
        }
    }

    const actionLabel = normalizeTextValue(button.dataset.actionLabel);
    if (actionLabel !== '') {
        button.setAttribute('title', buildActionCountHoverTitle(actionLabel, adjustedCount));
    } else {
        button.removeAttribute('title');
    }
}


function adjustPostCommentCountByRelID(relId, delta) {
    const normalizedRelId = normalizeRelId(relId);
    if (normalizedRelId === '') {
        return;
    }

    const buttons = Array.from(document.querySelectorAll('.post-comment-button'))
        .filter((button) => normalizeRelId(button.dataset.relId || '') === normalizedRelId);
    for (const button of buttons) {
        adjustPostActionCount(button, delta);
    }
}


function normalizeTextValue(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim();
}


function normalizePostAttachments(post) {
    const rawAttachments = Array.isArray(post?.Attachments) ? post.Attachments : [];
    const normalizedAttachments = [];
    for (const rawAttachment of rawAttachments) {
        if (!rawAttachment || typeof rawAttachment !== 'object') {
            continue;
        }

        const attachmentType = normalizeTextValue(rawAttachment.type).toLowerCase();
        if (attachmentType !== 'image' && attachmentType !== 'video') {
            continue;
        }

        const attachmentURL = normalizeTextValue(rawAttachment.url);
        if (attachmentURL === '') {
            continue;
        }

        normalizedAttachments.push({
            type: attachmentType,
            url: attachmentURL
        });
    }

    return normalizedAttachments;
}


function getCurrentUsernameForPosts() {
    return normalizeTextValue(getCurrentUsernameFromAuth());
}


function normalizeUnixTime(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return 0;
    }
    return parsed;
}

function escapeHTML(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function markPostAsViewed(postElement) {
    if (!(postElement instanceof HTMLElement)) {
        return;
    }

    const relId = normalizeRelId(postElement.dataset.relId || '');
    if (relId === '') {
        return;
    }
    if (viewedPostRelIDs.has(relId)) {
        return;
    }

    viewedPostRelIDs.add(relId);
    void recordPostView(relId).catch(() => {
    });
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
