import { drawHeader } from './header.js';
import { drawFooter } from './footer.js';
import { drawProfile } from './profile.js';
import { drawSearchPage } from './search.js';
import { drawEventsPage } from './events.js';
import { drawMarketplacePage } from './marketplace.js';
import { drawSettings } from './settings.js';
import { createMapListView } from './recruit.js';
import { getFeedPosts, getProfile, getPost, getProfileEvents, getRecruits } from './api.js';
import { drawChat } from './chat.js';
import { drawFeed } from './feed.js';
import { getCurrentUserFromAuth } from './auth.js';

const menuClickAudioSrc = '/static/audio/menu_click.mp3';
const footerClickAudioSrc = '/static/audio/footer_click.mp3';
const menuClickNavigationDelayMs = 90;
const menuClickReplayGuardMs = 220;
const menuClickSelector = [
    '.nav-link',
    '.mobile-header a',
    '.mobile-header button',
    '.footer-tab',
    '.feed-header-icon-button',
    '.feed-header-tab-label',
    '.tab-label',
    '.toggle-btn',
    '.recruit-control-btn',
    '.conversation-back-button',
    '.conversation-primary-button',
    '.conversation-icon-button',
    '.conversation-list-item',
    '.post-more-toggle',
    '.post-more-menu-item',
    '.profile-more-toggle',
    '.profile-more-menu-item'
].join(', ');

let menuClickAudio = null;
let footerClickAudio = null;
let menuClickAudioBound = false;
let menuClickNavigationTimerID = 0;
let menuClickLastPlayTimeMs = 0;
let footerClickLastPlayTimeMs = 0;


document.addEventListener('DOMContentLoaded', main);


async function main() {
    registerServiceWorker();
    initMenuClickAudio();

    const pathSegments = window.location.pathname.split('/');
    const rawCategory = pathSegments[1] || 'feed';
    const currentCategory = rawCategory === 'home' ? 'feed' : rawCategory;
    const currentUser = await getCurrentUserForUi();

    if (currentCategory === "2fa") {
        initTwoFactorInputFlow();
        return;
    }

    if (currentCategory === "login") {
        return;
    }

    drawHeader(currentCategory, currentUser);


    if (currentCategory === "feed") {
        drawFeed([], [], { isLoading: true });

        let forYouPosts = [];
        let followingPosts = [];

        const feedResponses = await Promise.allSettled([
            getFeedPosts(10, '', [], 'for_you'),
            getFeedPosts(10, '', [], 'following')
        ]);

        if (feedResponses[0].status === 'fulfilled') {
            forYouPosts = Array.isArray(feedResponses[0].value) ? feedResponses[0].value : [];
        } else {
            console.error('Unable to load For You feed posts:', feedResponses[0].reason);
        }

        if (feedResponses[1].status === 'fulfilled') {
            followingPosts = Array.isArray(feedResponses[1].value) ? feedResponses[1].value : [];
        } else {
            console.error('Unable to load Following feed posts:', feedResponses[1].reason);
        }

        drawFeed(forYouPosts, followingPosts, { isLoading: false });
    }
    if (currentCategory === "profile") {
        renderProfileLoadingState();
        await drawProfileView(pathSegments, currentUser)
    }
    if (currentCategory === "settings") {
        await drawSettings(currentUser)
//        posts.forEach(post => drawPost(post));
    }
    if (currentCategory === "chat") {
        drawChat()
    }

    if (currentCategory === "recruit") {
        renderRecruitLoadingState();
        let recruits = [];
        try {
            recruits = await getRecruits(250);
        } catch (error) {
            console.error('Unable to load recruits:', error);
        }
        createMapListView(recruits);
    }

    if (currentCategory === "search") {
        drawSearchPage();
    }
    if (currentCategory === "events") {
        drawEventsPage();
    }
    if (currentCategory === "marketplace") {
        drawMarketplacePage();
    }

    drawFooter(currentCategory, currentUser);
}

function initMenuClickAudio() {
    if (menuClickAudioBound) {
        return;
    }
    menuClickAudioBound = true;
    if (menuClickAudio == null) {
        menuClickAudio = new Audio(menuClickAudioSrc);
        menuClickAudio.preload = 'auto';
        menuClickAudio.load();
    }
    if (footerClickAudio == null) {
        footerClickAudio = new Audio(footerClickAudioSrc);
        footerClickAudio.preload = 'auto';
        footerClickAudio.load();
    }

    const shouldHandleMenuTarget = (eventTarget) => {
        const target = eventTarget instanceof Element ? eventTarget : null;
        if (!target) {
            return null;
        }
        const menuTarget = target.closest(menuClickSelector);
        if (!menuTarget) {
            return null;
        }
        return menuTarget;
    };

    // Play as early as possible so navigation does not cut it off.
    document.addEventListener('pointerdown', (event) => {
        const menuTarget = shouldHandleMenuTarget(event.target);
        if (!menuTarget) {
            return;
        }
        playMenuClickAudio(menuTarget);
    }, { capture: true });

    document.addEventListener('click', (event) => {
        const menuTarget = shouldHandleMenuTarget(event.target);
        if (!menuTarget) {
            return;
        }
        maybeReplayMenuClickAudio(menuTarget);

        const target = event.target instanceof Element ? event.target : null;
        if (!target) {
            return;
        }

        const anchorElement = menuTarget instanceof HTMLAnchorElement ? menuTarget : menuTarget.closest('a[href]');
        if (!(anchorElement instanceof HTMLAnchorElement)) {
            return;
        }
        if (shouldDelayMenuNavigation(event, anchorElement) === false) {
            return;
        }

        event.preventDefault();
        scheduleMenuNavigation(anchorElement.href);
    }, { capture: true });
}

function isFooterMenuTarget(menuTarget) {
    if (!(menuTarget instanceof Element)) {
        return false;
    }
    return menuTarget.closest('.footer-tab') != null;
}

function playMenuClickAudio(menuTarget) {
    const useFooterAudio = isFooterMenuTarget(menuTarget);
    let audioElement = useFooterAudio ? footerClickAudio : menuClickAudio;
    if (audioElement == null) {
        audioElement = new Audio(useFooterAudio ? footerClickAudioSrc : menuClickAudioSrc);
        audioElement.preload = 'auto';
        if (useFooterAudio) {
            footerClickAudio = audioElement;
        } else {
            menuClickAudio = audioElement;
        }
    }

    try {
        audioElement.currentTime = 0;
        const playPromise = audioElement.play();
        if (useFooterAudio) {
            footerClickLastPlayTimeMs = Date.now();
        } else {
            menuClickLastPlayTimeMs = Date.now();
        }
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {
            });
        }
    } catch (_) {
    }
}

function maybeReplayMenuClickAudio(menuTarget) {
    const now = Date.now();
    const useFooterAudio = isFooterMenuTarget(menuTarget);
    const lastPlayTimeMs = useFooterAudio ? footerClickLastPlayTimeMs : menuClickLastPlayTimeMs;
    if ((now - lastPlayTimeMs) < menuClickReplayGuardMs) {
        return;
    }
    playMenuClickAudio(menuTarget);
}

function shouldDelayMenuNavigation(event, anchorElement) {
    if (!(anchorElement instanceof HTMLAnchorElement)) {
        return false;
    }
    if (event.defaultPrevented) {
        return false;
    }
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return false;
    }

    const targetAttr = String(anchorElement.getAttribute('target') || '').trim().toLowerCase();
    if (targetAttr !== '' && targetAttr !== '_self') {
        return false;
    }
    if (anchorElement.hasAttribute('download')) {
        return false;
    }

    const rawHref = String(anchorElement.getAttribute('href') || '').trim();
    if (rawHref === '' || rawHref.startsWith('#') || rawHref.toLowerCase().startsWith('javascript:')) {
        return false;
    }

    let destinationURL;
    try {
        destinationURL = new URL(anchorElement.href, window.location.href);
    } catch (_) {
        return false;
    }

    if (destinationURL.origin !== window.location.origin) {
        return false;
    }
    return true;
}

function scheduleMenuNavigation(targetURL) {
    if (typeof targetURL !== 'string' || targetURL.trim() === '') {
        return;
    }

    if (menuClickNavigationTimerID !== 0) {
        window.clearTimeout(menuClickNavigationTimerID);
        menuClickNavigationTimerID = 0;
    }

    menuClickNavigationTimerID = window.setTimeout(() => {
        menuClickNavigationTimerID = 0;
        window.location.href = targetURL;
    }, menuClickNavigationDelayMs);
}


function renderProfileLoadingState() {
    let mainContainer = document.querySelector('.main-container');
    if (!mainContainer) {
        mainContainer = document.createElement('div');
        mainContainer.className = 'main-container';
        document.body.appendChild(mainContainer);
    }

    mainContainer.innerHTML = `
        <section class="profile-loading-shell">
            <div class="profile-loading-banner loading-skeleton"></div>
            <div class="white-container">
                <div class="profile-loading-header">
                    <div class="profile-loading-avatar loading-skeleton"></div>
                    <div class="profile-loading-title-block">
                        <div class="loading-skeleton-line loading-skeleton-line-wide loading-skeleton"></div>
                        <div class="loading-skeleton-line loading-skeleton-line-medium loading-skeleton"></div>
                    </div>
                </div>
                <div class="profile-loading-posts">
                    <div class="profile-loading-post loading-skeleton"></div>
                    <div class="profile-loading-post loading-skeleton"></div>
                    <div class="profile-loading-post loading-skeleton"></div>
                </div>
            </div>
        </section>
    `;
}


function renderRecruitLoadingState() {
    let mainContainer = document.querySelector('.main-container');
    if (!mainContainer) {
        mainContainer = document.createElement('div');
        mainContainer.className = 'main-container';
        document.body.appendChild(mainContainer);
    }

    mainContainer.innerHTML = `
        <section class="recruit-loading-shell">
            <div class="recruit-loading-map loading-skeleton"></div>
            <div class="recruit-loading-list">
                <div class="recruit-loading-item loading-skeleton"></div>
                <div class="recruit-loading-item loading-skeleton"></div>
                <div class="recruit-loading-item loading-skeleton"></div>
                <div class="recruit-loading-item loading-skeleton"></div>
            </div>
        </section>
    `;
}


function registerServiceWorker() {
    if (typeof window === 'undefined') {
        return;
    }
    if (!('serviceWorker' in navigator)) {
        return;
    }

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/static/sw.js').catch((error) => {
            console.error('Service worker registration failed:', error);
        });
    });
}


async function drawProfileView(pathSegments, currentUser) {
    const requestedUsername = getRequestedProfileUsername(pathSegments, currentUser)
    if (requestedUsername === '') {
        renderProfileError('Unable to determine profile username.')
        return
    }

    let profileData
    try {
        profileData = await getProfile(requestedUsername)
    } catch (error) {
        console.error('Unable to load profile:', error)
        renderProfileError('Unable to load profile.')
        return
    }

    const profileId = getProfileIdFromPayload(profileData)
    let posts = []
    let events = []
    if (profileId !== '') {
        const profileResponses = await Promise.allSettled([
            getPost(profileId, 0, 10),
            getProfileEvents(profileId, 30)
        ])

        if (profileResponses[0].status === 'fulfilled') {
            posts = Array.isArray(profileResponses[0].value) ? profileResponses[0].value : []
        } else {
            console.error('Unable to load profile posts:', profileResponses[0].reason)
        }

        if (profileResponses[1].status === 'fulfilled') {
            const eventsPayload = profileResponses[1].value
            events = Array.isArray(eventsPayload?.events) ? eventsPayload.events : []
        } else {
            console.error('Unable to load profile events:', profileResponses[1].reason)
        }
    }

    drawProfile(profileData, posts, events, {
        currentUsername: currentUser?.id || ''
    })
    updateProfileHeaderName(profileData)
}


function getRequestedProfileUsername(pathSegments, currentUser) {
    const rawPathUsername = pathSegments.length > 2 ? pathSegments.slice(2).join('/') : ''
    const trimmedPathUsername = rawPathUsername.trim()
    if (trimmedPathUsername !== '') {
        try {
            return decodeURIComponent(trimmedPathUsername).trim()
        } catch (_) {
            return trimmedPathUsername
        }
    }

    return (currentUser && currentUser.id) ? String(currentUser.id).trim() : ''
}


function getProfileIdFromPayload(profilePayload) {
    if (!profilePayload || typeof profilePayload !== 'object') {
        return ''
    }

    const candidates = [
        profilePayload.Id,
        profilePayload.ID,
        profilePayload.id,
        profilePayload._id
    ]

    for (const value of candidates) {
        if (typeof value === 'string' && value.trim() !== '') {
            return value.trim()
        }
    }

    return ''
}


function renderProfileError(message) {
    let mainContainer = document.querySelector('.main-container')
    if (!mainContainer) {
        mainContainer = document.createElement('div')
        mainContainer.className = 'main-container'
        document.body.appendChild(mainContainer)
    }

    mainContainer.innerHTML = `
        <section class="search-page">
            <p class="search-page-status">${message}</p>
        </section>
    `
}


function updateProfileHeaderName(profileData) {
    const headerCenter = document.querySelector('.mobile-header .mobile-header-center');
    if (!headerCenter) {
        return;
    }

    const firstName = String(profileData?.FirstName || profileData?.first_name || '').trim();
    const lastName = String(profileData?.LastName || profileData?.last_name || '').trim();
    const username = String(profileData?.Username || profileData?.username || '').trim();
    const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || username;
    if (displayName === '') {
        return;
    }

    headerCenter.textContent = displayName;
}


async function getCurrentUserForUi() {
    return getCurrentUserFromAuth();
}

function initTwoFactorInputFlow() {
    const codeInputs = Array.from(document.querySelectorAll('.auth-code-digit'));
    if (codeInputs.length === 0) {
        return;
    }

    codeInputs.forEach((input, index) => {
        input.addEventListener('input', (event) => {
            const rawValue = event.target.value || '';
            const digitsOnly = rawValue.replace(/\D/g, '');

            if (digitsOnly.length === 0) {
                event.target.value = '';
                return;
            }

            event.target.value = digitsOnly.slice(-1);
            const nextInput = codeInputs[index + 1];
            if (nextInput) {
                nextInput.focus();
                nextInput.select();
            }
        });

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Backspace' && input.value === '') {
                const previousInput = codeInputs[index - 1];
                if (previousInput) {
                    previousInput.focus();
                    previousInput.select();
                }
            }
        });

        input.addEventListener('paste', (event) => {
            const pastedText = (event.clipboardData || window.clipboardData).getData('text');
            const digits = pastedText.replace(/\D/g, '');
            if (digits.length === 0) {
                return;
            }

            event.preventDefault();
            for (let i = 0; i < codeInputs.length; i += 1) {
                codeInputs[i].value = digits[i] || '';
            }

            const focusIndex = Math.min(digits.length, codeInputs.length) - 1;
            if (focusIndex >= 0 && codeInputs[focusIndex]) {
                codeInputs[focusIndex].focus();
                codeInputs[focusIndex].select();
            }
        });
    });
}
