import {
    getProfile,
    searchProfiles,
    getChatMessages,
    markChatConversationRead,
    sendChatMessage
} from './api.js';

const CHAT_TEMPLATE = `
<div class="conversation-page" id="conversation-page">
    <aside class="conversation-sidebar">
        <div class="conversation-sidebar-header">
            <h2>Messages</h2>
            <button type="button" class="conversation-primary-button conversation-icon-button" id="conversation-create-button" aria-label="Message a new user" title="Message a new user">
                <span class="conversation-icon-glyph fa-solid" aria-hidden="true">&#xf044;</span>
            </button>
        </div>

        <p class="conversation-status-message conversation-hidden" id="conversation-status-message" role="status" aria-live="polite"></p>

        <div class="conversation-empty-state conversation-hidden" id="conversation-empty-state">
            <h3>No chats yet</h3>
            <p>Start your first conversation.</p>
            <button type="button" class="conversation-primary-button" id="conversation-create-button-empty">
                <span class="conversation-button-icon conversation-icon-glyph fa-solid" aria-hidden="true">&#xf044;</span>
                <span>Message a new user</span>
            </button>
        </div>

        <ul class="conversation-list" id="conversation-list"></ul>
    </aside>

    <section class="conversation-window">
        <div class="conversation-window-empty" id="conversation-window-empty">
            <h3 id="conversation-window-empty-title">No chats yet</h3>
            <p id="conversation-window-empty-message">Start a conversation and your messages will show up here.</p>
            <button type="button" class="conversation-primary-button" id="conversation-create-button-window">
                <span class="conversation-button-icon conversation-icon-glyph fa-solid" aria-hidden="true">&#xf044;</span>
                <span>Message a new user</span>
            </button>
        </div>

        <div class="conversation-window-body conversation-hidden" id="conversation-window-body">
            <header class="conversation-window-header">
                <button type="button" class="conversation-back-button" id="conversation-back-button" aria-label="Back to conversations" title="Back to conversations">
                    <span class="conversation-icon-glyph fa-solid" aria-hidden="true">&#xf060;</span>
                </button>
                <div class="conversation-window-identity">
                    <span class="conversation-header-avatar-shell" id="conversation-active-avatar"></span>
                    <h3 id="conversation-active-title">Conversation</h3>
                </div>
            </header>

            <div class="conversation-messages" id="conversation-messages"></div>

            <form class="conversation-message-form" id="conversation-message-form">
                <input
                    id="conversation-message-input"
                    class="conversation-message-input"
                    type="text"
                    maxlength="2000"
                    placeholder="Type a message..."
                    autocomplete="off"
                />
                <button type="submit" class="conversation-send-button conversation-icon-button" id="conversation-send-button" aria-label="Send message" title="Send message">
                    <span class="conversation-icon-glyph fa-solid" aria-hidden="true">&#xf1d8;</span>
                </button>
            </form>
        </div>
    </section>

    <div class="conversation-popup conversation-hidden" id="conversation-create-popup" role="dialog" aria-modal="true" aria-labelledby="conversation-create-title">
        <button type="button" class="conversation-popup-backdrop" id="conversation-create-backdrop" aria-label="Close"></button>
        <div class="conversation-popup-card" role="document">
            <h3 id="conversation-create-title">Message a new user</h3>
            <p>Enter the username of the person you want to message.</p>
            <form id="conversation-create-form" class="conversation-popup-form">
                <input
                    id="conversation-create-username"
                    class="conversation-popup-input"
                    type="text"
                    maxlength="64"
                    placeholder="Username"
                    autocomplete="off"
                    required
                />
                <ul class="conversation-popup-suggestions conversation-hidden" id="conversation-create-suggestions" role="listbox" aria-label="Suggested users"></ul>
                <div class="conversation-popup-actions">
                    <button type="button" class="conversation-popup-cancel" id="conversation-create-cancel">Cancel</button>
                    <button type="submit" class="conversation-primary-button">Start chat</button>
                </div>
            </form>
        </div>
    </div>
</div>
`;

const CHAT_POLL_INTERVAL_MS = 3000;
const MOBILE_CHAT_BREAKPOINT = 800;
const MOBILE_KEYBOARD_THRESHOLD_PX = 48;
const COMPOSE_SEARCH_MIN_CHARS = 3;
const COMPOSE_SEARCH_LIMIT = 8;
const COMPOSE_SEARCH_DEBOUNCE_MS = 180;


export function drawChat() {
    let mainContainer = document.querySelector('.main-container');
    if (!mainContainer) {
        mainContainer = document.createElement('div');
        mainContainer.className = 'main-container';
        document.body.appendChild(mainContainer);
    }

    mainContainer.innerHTML = CHAT_TEMPLATE;

    const pageEl = mainContainer.querySelector('#conversation-page');
    const conversationListEl = mainContainer.querySelector('#conversation-list');
    const sidebarEmptyStateEl = mainContainer.querySelector('#conversation-empty-state');
    const statusEl = mainContainer.querySelector('#conversation-status-message');
    const windowEmptyEl = mainContainer.querySelector('#conversation-window-empty');
    const windowEmptyTitleEl = mainContainer.querySelector('#conversation-window-empty-title');
    const windowEmptyMessageEl = mainContainer.querySelector('#conversation-window-empty-message');
    const windowBodyEl = mainContainer.querySelector('#conversation-window-body');
    const activeAvatarEl = mainContainer.querySelector('#conversation-active-avatar');
    const activeTitleEl = mainContainer.querySelector('#conversation-active-title');
    const messagesEl = mainContainer.querySelector('#conversation-messages');
    const messageFormEl = mainContainer.querySelector('#conversation-message-form');
    const messageInputEl = mainContainer.querySelector('#conversation-message-input');
    const sendButtonEl = mainContainer.querySelector('#conversation-send-button');
    const backButtonEl = mainContainer.querySelector('#conversation-back-button');

    const createButtons = [
        mainContainer.querySelector('#conversation-create-button'),
        mainContainer.querySelector('#conversation-create-button-empty'),
        mainContainer.querySelector('#conversation-create-button-window')
    ];

    const createPopupEl = mainContainer.querySelector('#conversation-create-popup');
    const createBackdropEl = mainContainer.querySelector('#conversation-create-backdrop');
    const createFormEl = mainContainer.querySelector('#conversation-create-form');
    const createInputEl = mainContainer.querySelector('#conversation-create-username');
    const createSuggestionsEl = mainContainer.querySelector('#conversation-create-suggestions');
    const createCancelEl = mainContainer.querySelector('#conversation-create-cancel');
    const visualViewport = window.visualViewport || null;

    const state = {
        currentProfileID: '',
        currentUsername: '',
        messages: [],
        activeConversationKey: '',
        activePeerProfileID: '',
        activePeerUsername: '',
        activePeerDisplayName: '',
        activePeerProfilePictureURL: '',
        pollTimerID: 0,
        pollInFlight: false,
        readUpdateInFlight: false,
        mobileConversationOpen: false,
        mobileKeyboardOpen: false,
        profilePictureURLsByProfileID: {},
        profileUsernamesByProfileID: {},
        profileDisplayNamesByProfileID: {},
        composeSuggestions: [],
        composeSelectedSuggestion: null,
        composeSearchTimerID: 0,
        composeSearchRequestID: 0
    };
    let launchUsername = readLaunchUsernameFromQuery();

    createButtons.forEach((button) => {
        if (button) {
            button.addEventListener('click', openCreateConversationPopup);
        }
    });

    createBackdropEl.addEventListener('click', closeCreateConversationPopup);
    createCancelEl.addEventListener('click', closeCreateConversationPopup);
    createInputEl.addEventListener('input', handleCreateInputChange);
    createInputEl.addEventListener('keydown', handleCreateInputKeydown);
    createSuggestionsEl.addEventListener('click', handleCreateSuggestionClick);
    createSuggestionsEl.addEventListener('mousedown', handleCreateSuggestionsMouseDown);

    createFormEl.addEventListener('submit', async (event) => {
        event.preventDefault();

        const receivingUsername = resolveComposeReceivingUsername();
        if (!receivingUsername) {
            showStatus('Select a valid user from search suggestions.', true);
            return;
        }

        if (state.currentUsername && equalUsername(receivingUsername, state.currentUsername)) {
            showStatus('You cannot start a conversation with yourself.', true);
            return;
        }

        const receivingDisplayName = state.composeSelectedSuggestion
            ? sanitizePersonName(state.composeSelectedSuggestion.displayName)
            : '';

        const existingConversation = buildConversations().find((conversation) => {
            return equalUsername(conversation.peerUsername, receivingUsername);
        });

        if (existingConversation) {
            setActiveConversation(existingConversation.conversationKey, existingConversation.peerProfileID, existingConversation.peerUsername, receivingDisplayName);
        } else {
            setActiveConversation(buildDraftConversationKey(receivingUsername), '', receivingUsername, receivingDisplayName);
            await hydrateActiveConversationPeer();
        }

        hideStatus();
        closeCreateConversationPopup();
        renderAll();
        setMobileConversationOpen(true);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !createPopupEl.classList.contains('conversation-hidden')) {
            closeCreateConversationPopup();
        }
    });
    document.addEventListener('mousedown', handleDocumentMouseDown);

    conversationListEl.addEventListener('click', (event) => {
        const item = event.target.closest('[data-conversation-key]');
        if (!item) {
            return;
        }

        const conversationKey = readString(item.getAttribute('data-conversation-key'), '');
        const peerProfileID = sanitizeProfileID(item.getAttribute('data-peer-profile-id'));
        const peerUsername = sanitizeUsername(item.getAttribute('data-peer-username'));
        if (!conversationKey) {
            return;
        }

        setActiveConversation(conversationKey, peerProfileID, peerUsername);
        renderAll();
        setMobileConversationOpen(true);
    });

    backButtonEl.addEventListener('click', () => {
        setMobileConversationOpen(false);
    });

    messageFormEl.addEventListener('submit', handleMessageSubmit);
    messageInputEl.addEventListener('focus', handleMessageInputFocus);
    messageInputEl.addEventListener('blur', handleMessageInputBlur);

    window.addEventListener('resize', () => {
        if (window.innerWidth >= MOBILE_CHAT_BREAKPOINT) {
            setMobileConversationOpen(false);
            return;
        }
        syncMobileViewportState();
    });
    if (visualViewport) {
        visualViewport.addEventListener('resize', syncMobileViewportState);
        visualViewport.addEventListener('scroll', syncMobileViewportState);
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('beforeunload', () => {
        stopPolling();
        unlockMobilePageScroll();
    });

    setMobileConversationBodyState(false);
    initialize();

    async function initialize() {
        await loadMessages();
        applyLaunchConversationPreference();
        await hydrateActiveConversationPeer();

        const conversations = buildConversations();
        if (!state.activeConversationKey && window.innerWidth >= MOBILE_CHAT_BREAKPOINT && conversations.length > 0) {
            const firstConversation = conversations[0];
            setActiveConversation(firstConversation.conversationKey, firstConversation.peerProfileID, firstConversation.peerUsername);
        }

        renderAll();
        startPolling();
    }

    function readLaunchUsernameFromQuery() {
        if (typeof window === 'undefined' || !window.location) {
            return '';
        }

        const searchParams = new URLSearchParams(readString(window.location.search, ''));
        const username = sanitizeUsername(searchParams.get('username'));
        if (!username) {
            return '';
        }
        return username;
    }

    function applyLaunchConversationPreference() {
        const targetUsername = sanitizeUsername(launchUsername);
        if (!targetUsername) {
            return;
        }
        launchUsername = '';

        if (state.currentUsername && equalUsername(targetUsername, state.currentUsername)) {
            return;
        }

        const existingConversation = buildConversations().find((conversation) => {
            return equalUsername(conversation.peerUsername, targetUsername);
        });

        if (existingConversation) {
            setActiveConversation(existingConversation.conversationKey, existingConversation.peerProfileID, existingConversation.peerUsername);
        } else {
            setActiveConversation(buildDraftConversationKey(targetUsername), '', targetUsername);
        }

        if (window.innerWidth < MOBILE_CHAT_BREAKPOINT) {
            setMobileConversationOpen(true);
        }
    }

    async function hydrateActiveConversationPeer() {
        const activeUsername = sanitizeUsername(state.activePeerUsername);
        if (!activeUsername) {
            return;
        }
        if (state.activePeerProfileID && getProfilePictureURLForProfileID(state.activePeerProfileID) !== '') {
            return;
        }

        try {
            const profilePayload = await getProfile(activeUsername);
            const resolvedProfileID = sanitizeProfileID(profilePayload?.Id || profilePayload?._id || profilePayload?.id);
            const resolvedUsername = sanitizeUsername(profilePayload?.Username || profilePayload?.username || activeUsername);
            const resolvedFirstName = sanitizePersonName(profilePayload?.FirstName || profilePayload?.first_name);
            const resolvedLastName = sanitizePersonName(profilePayload?.LastName || profilePayload?.last_name);
            const resolvedProfilePictureURL = readString(profilePayload?.ProfilePictureURL || profilePayload?.profile_picture_url, '').trim();
            const resolvedDisplayName = buildDisplayNameFromParts(resolvedFirstName, resolvedLastName, resolvedUsername);

            if (resolvedProfilePictureURL !== '') {
                state.activePeerProfilePictureURL = resolvedProfilePictureURL;
            }

            if (resolvedProfileID) {
                state.activePeerProfileID = resolvedProfileID;
                if (resolvedUsername) {
                    state.profileUsernamesByProfileID[resolvedProfileID] = resolvedUsername;
                }
                if (resolvedDisplayName) {
                    state.profileDisplayNamesByProfileID[resolvedProfileID] = resolvedDisplayName;
                    state.activePeerDisplayName = resolvedDisplayName;
                }
                if (resolvedProfilePictureURL !== '') {
                    state.profilePictureURLsByProfileID[resolvedProfileID] = resolvedProfilePictureURL;
                }

                if (state.currentProfileID) {
                    state.activeConversationKey = buildConversationKey(state.currentProfileID, resolvedProfileID);
                }
            }
            if (!state.activePeerUsername && resolvedUsername) {
                state.activePeerUsername = resolvedUsername;
            }
        } catch (_) {
        }
    }

    async function loadMessages() {
        try {
            const payload = await getChatMessages(50);
            const messages = normalizeMessages(payload?.messages);
            const profilePictureURLs = normalizeProfilePictureURLs(payload?.profile_picture_urls);
            const profileUsernames = normalizeProfileUsernames(payload?.profile_usernames);
            const profileDisplayNames = normalizeProfileDisplayNames(payload?.profile_display_names);

            state.currentProfileID = sanitizeProfileID(payload?.current_profile_id);
            state.currentUsername = sanitizeUsername(payload?.current_username);
            state.messages = messages;
            state.profilePictureURLsByProfileID = profilePictureURLs;
            state.profileUsernamesByProfileID = profileUsernames;
            state.profileDisplayNamesByProfileID = profileDisplayNames;
            refreshActivePeerFromLookup();
            sortMessagesInPlace(state.messages);
            hideStatus();
        } catch (_) {
            state.messages = [];
            state.profilePictureURLsByProfileID = {};
            state.profileUsernamesByProfileID = {};
            state.profileDisplayNamesByProfileID = {};
            showStatus('Unable to load chat messages from the backend.', true);
        }
    }

    function startPolling() {
        stopPolling();
        state.pollTimerID = window.setInterval(() => {
            pollForIncomingMessages(false);
        }, CHAT_POLL_INTERVAL_MS);
    }

    function stopPolling() {
        if (!state.pollTimerID) {
            return;
        }
        window.clearInterval(state.pollTimerID);
        state.pollTimerID = 0;
    }

    function handleVisibilityChange() {
        if (!document.hidden) {
            pollForIncomingMessages(true);
        }
    }

    function handleWindowFocus() {
        pollForIncomingMessages(true);
    }

    function handleMessageInputFocus() {
        if (!state.mobileConversationOpen) {
            return;
        }

        syncMobileViewportState();
        window.setTimeout(syncMobileViewportState, 80);
    }

    function handleMessageInputBlur() {
        if (!state.mobileConversationOpen) {
            return;
        }

        window.setTimeout(syncMobileViewportState, 80);
    }

    async function pollForIncomingMessages(force) {
        if (state.pollInFlight) {
            return;
        }
        if (document.hidden && !force) {
            return;
        }

        state.pollInFlight = true;
        try {
            const payload = await getChatMessages(50);
            const incomingMessages = normalizeMessages(payload?.messages);
            const incomingProfilePictureURLs = normalizeProfilePictureURLs(payload?.profile_picture_urls);
            const incomingProfileUsernames = normalizeProfileUsernames(payload?.profile_usernames);
            const incomingProfileDisplayNames = normalizeProfileDisplayNames(payload?.profile_display_names);
            const incomingCurrentProfileID = sanitizeProfileID(payload?.current_profile_id);
            const incomingCurrentUsername = sanitizeUsername(payload?.current_username);

            if (incomingCurrentProfileID) {
                state.currentProfileID = incomingCurrentProfileID;
            }
            if (incomingCurrentUsername) {
                state.currentUsername = incomingCurrentUsername;
            }

            const mergedMessages = mergeLocalAndIncomingMessages(state.messages, incomingMessages);
            const mergedProfilePictureURLs = mergeLookupMap(state.profilePictureURLsByProfileID, incomingProfilePictureURLs);
            const mergedProfileUsernames = mergeLookupMap(state.profileUsernamesByProfileID, incomingProfileUsernames);
            const mergedProfileDisplayNames = mergeLookupMap(state.profileDisplayNamesByProfileID, incomingProfileDisplayNames);
            const messagesChanged = didMessageCollectionChange(state.messages, mergedMessages);
            const profilePicturesChanged = didLookupMapChange(state.profilePictureURLsByProfileID, mergedProfilePictureURLs);
            const profileUsernamesChanged = didLookupMapChange(state.profileUsernamesByProfileID, mergedProfileUsernames);
            const profileDisplayNamesChanged = didLookupMapChange(state.profileDisplayNamesByProfileID, mergedProfileDisplayNames);

            state.messages = mergedMessages;
            state.profilePictureURLsByProfileID = mergedProfilePictureURLs;
            state.profileUsernamesByProfileID = mergedProfileUsernames;
            state.profileDisplayNamesByProfileID = mergedProfileDisplayNames;
            refreshActivePeerFromLookup();
            sortMessagesInPlace(state.messages);

            if (messagesChanged || profilePicturesChanged || profileUsernamesChanged || profileDisplayNamesChanged) {
                renderAll();
            }
        } catch (_) {
        } finally {
            state.pollInFlight = false;
        }
    }

    function renderAll() {
        renderConversationList();
        renderWindow();
    }

    function renderConversationList() {
        const conversations = buildConversations();

        if (conversations.length === 0) {
            conversationListEl.innerHTML = '';
            conversationListEl.classList.add('conversation-hidden');
            sidebarEmptyStateEl.classList.remove('conversation-hidden');
            return;
        }

        conversationListEl.classList.remove('conversation-hidden');
        sidebarEmptyStateEl.classList.add('conversation-hidden');

        conversationListEl.innerHTML = conversations.map((conversation) => {
            const isActive = conversation.conversationKey === state.activeConversationKey;
            const itemClass = isActive ? 'conversation-list-item is-active' : 'conversation-list-item';
            const title = resolvePeerDisplayName(conversation.peerProfileID, conversation.peerUsername);
            const preview = conversation.lastMessage || 'No messages yet';
            const unreadDot = conversation.hasUnread ? '<span class="conversation-unread-dot" aria-label="Unread messages"></span>' : '';
            const avatarHTML = buildConversationAvatarHTML(
                title,
                getProfilePictureURLForProfileID(conversation.peerProfileID),
                'conversation-list-avatar'
            );

            return `
                <li>
                    <button
                        type="button"
                        class="${itemClass}"
                        data-conversation-key="${escapeHTML(conversation.conversationKey)}"
                        data-peer-profile-id="${escapeHTML(conversation.peerProfileID)}"
                        data-peer-username="${escapeHTML(conversation.peerUsername)}"
                    >
                        <span class="conversation-list-item-main">
                            ${avatarHTML}
                            <span class="conversation-list-item-content">
                                <span class="conversation-list-item-title-row">
                                    <span class="conversation-list-item-title">${escapeHTML(title)}</span>
                                    ${unreadDot}
                                </span>
                                <span class="conversation-list-item-preview">${escapeHTML(preview)}</span>
                            </span>
                        </span>
                    </button>
                </li>
            `;
        }).join('');
    }

    function renderWindow() {
        if (!state.activeConversationKey) {
            renderWindowEmpty();
            return;
        }

        const activeConversation = findConversationByKey(state.activeConversationKey);
        if (activeConversation) {
            setActiveConversation(activeConversation.conversationKey, activeConversation.peerProfileID, activeConversation.peerUsername);
        }

        const activeMessages = getActiveMessages();
        const hasDraft = !activeConversation && state.activePeerUsername !== '';

        if (!activeConversation && !hasDraft) {
            renderWindowEmpty();
            return;
        }

        if (window.innerWidth < MOBILE_CHAT_BREAKPOINT && !state.mobileConversationOpen) {
            setMobileConversationOpen(true);
        }

        windowEmptyEl.classList.add('conversation-hidden');
        windowBodyEl.classList.remove('conversation-hidden');

        const title = state.activePeerDisplayName || resolvePeerDisplayName(state.activePeerProfileID, state.activePeerUsername) || state.activePeerProfileID || 'Conversation';
        const activePeerProfilePictureURL = state.activePeerProfileID
            ? getProfilePictureURLForProfileID(state.activePeerProfileID)
            : readString(state.activePeerProfilePictureURL, '');
        activeTitleEl.textContent = title;
        activeAvatarEl.innerHTML = buildConversationAvatarHTML(
            title,
            activePeerProfilePictureURL,
            'conversation-header-avatar'
        );

        const canSend = state.activePeerUsername !== '';
        messageInputEl.disabled = !canSend;
        sendButtonEl.disabled = !canSend;

        renderMessages(activeMessages);
        markActiveConversationRead(activeMessages);
    }

    function renderWindowEmpty() {
        windowBodyEl.classList.add('conversation-hidden');
        windowEmptyEl.classList.remove('conversation-hidden');

        if (buildConversations().length === 0) {
            windowEmptyTitleEl.textContent = 'No chats yet';
            windowEmptyMessageEl.textContent = 'Start a conversation and your messages will show up here.';
        } else {
            windowEmptyTitleEl.textContent = 'Select a conversation';
            windowEmptyMessageEl.textContent = 'Choose a conversation to open messages.';
        }

        activeAvatarEl.innerHTML = '';
        messageInputEl.disabled = true;
        sendButtonEl.disabled = true;
    }

    function renderMessages(messages) {
        if (messages.length === 0) {
            messagesEl.innerHTML = '<p class="conversation-no-messages">No messages yet. Send the first one.</p>';
            scrollMessagesToBottom();
            return;
        }

        const latestSentMessageID = getLatestSentMessageID(messages);

        messagesEl.innerHTML = messages.map((message) => {
            const isSent = isSentByCurrentUser(message);
            const className = isSent ? 'conversation-message is-sent' : 'conversation-message is-received';
            const statusText = message.failed
                ? 'Failed to send'
                : message.pending
                    ? 'Sending...'
                    : formatMessageTime(message.sent_time);
            const showReceipt = readString(message._id, '') === latestSentMessageID;
            const isReadReceipt = readUnix(message.read_time) > 0;
            const receiptClass = isReadReceipt ? 'conversation-message-receipt conversation-message-receipt-read fa-solid' : 'conversation-message-receipt fa-solid';
            const receiptText = isReadReceipt ? '&#xf560;' : '&#xf00c;';
            const readTimeTooltip = formatMessageHoverTime(message.read_time);
            const sentTimeTooltip = formatMessageHoverTime(message.sent_time);
            const receiptTitle = isReadReceipt
                ? (readTimeTooltip ? `Read ${readTimeTooltip}` : 'Read')
                : (sentTimeTooltip ? `Sent ${sentTimeTooltip} (not read yet)` : 'Not read yet');

            const textHTML = message.message_content
                ? `<p class="conversation-message-text">${escapeHTML(message.message_content)}</p>`
                : '';

            const attachmentHTML = message.is_attachment && message.attachment_url
                ? `<p class="conversation-message-attachment"><a href="${escapeHTML(message.attachment_url)}" target="_blank" rel="noreferrer noopener">${escapeHTML(message.attachment_url)}</a></p>`
                : '';

            return `
                <div class="${className}">
                    <div class="conversation-message-bubble">
                        ${textHTML}
                        ${attachmentHTML}
                        <span class="conversation-message-meta">
                            <span class="conversation-message-time">${escapeHTML(statusText)}</span>
                            ${showReceipt ? `<span class="${receiptClass}" aria-label="${isReadReceipt ? 'Read' : 'Sent'}" title="${escapeHTML(receiptTitle)}">${receiptText}</span>` : ''}
                        </span>
                    </div>
                </div>
            `;
        }).join('');

        scrollMessagesToBottom();
    }

    function getLatestSentMessageID(messages) {
        let latestMessage = null;
        for (const message of messages) {
            if (!isSentByCurrentUser(message)) {
                continue;
            }
            if (message.pending || message.failed) {
                continue;
            }

            if (!latestMessage) {
                latestMessage = message;
                continue;
            }

            if (readUnix(message.sent_time) > readUnix(latestMessage.sent_time)) {
                latestMessage = message;
                continue;
            }
            if (
                readUnix(message.sent_time) === readUnix(latestMessage.sent_time) &&
                readString(message._id, '') > readString(latestMessage._id, '')
            ) {
                latestMessage = message;
            }
        }

        if (!latestMessage) {
            return '';
        }
        return readString(latestMessage._id, '');
    }

    function getActiveMessages() {
        if (!state.activeConversationKey) {
            return [];
        }

        return state.messages
            .filter((message) => {
                return buildConversationKey(message.sender_profile_id, message.receiving_profile_id) === state.activeConversationKey;
            })
            .sort((left, right) => {
                if (left.sent_time !== right.sent_time) {
                    return left.sent_time - right.sent_time;
                }
                return left._id.localeCompare(right._id);
            });
    }

    function buildConversations() {
        const map = new Map();

        for (const message of state.messages) {
            const conversationKey = buildConversationKey(message.sender_profile_id, message.receiving_profile_id);
            if (!conversationKey) {
                continue;
            }

            const peerProfileID = getPeerProfileID(message);
            if (!peerProfileID) {
                continue;
            }

            const peerUsername = resolvePeerUsername(message, peerProfileID);
            const existing = map.get(conversationKey);
            const lastMessage = message.message_content || (message.is_attachment ? 'Attachment' : 'No messages yet');
            const hasUnread = isUnreadMessageForCurrentUser(message, state.currentProfileID);

            if (!existing || message.sent_time > existing.lastOrder || (message.sent_time === existing.lastOrder && message._id > existing.lastMessageID)) {
                map.set(conversationKey, {
                    conversationKey,
                    peerProfileID,
                    peerUsername,
                    lastMessage,
                    lastOrder: message.sent_time,
                    lastMessageID: message._id,
                    hasUnread: existing ? existing.hasUnread || hasUnread : hasUnread
                });
            } else if (existing && hasUnread) {
                existing.hasUnread = true;
            }
        }

        return Array.from(map.values()).sort((left, right) => {
            if (left.lastOrder !== right.lastOrder) {
                return right.lastOrder - left.lastOrder;
            }
            return right.lastMessageID.localeCompare(left.lastMessageID);
        });
    }

    function findConversationByKey(conversationKey) {
        return buildConversations().find((conversation) => conversation.conversationKey === conversationKey) || null;
    }

    function resolvePeerUsername(message, peerProfileID) {
        const mappedUsername = getUsernameByProfileID(peerProfileID);
        if (mappedUsername) {
            return mappedUsername;
        }

        if (equalProfileID(message.sender_profile_id, peerProfileID)) {
            return sanitizeUsername(message.sender_username);
        }
        if (equalProfileID(message.receiving_profile_id, peerProfileID)) {
            return sanitizeUsername(message.receiving_username);
        }

        return '';
    }

    function getUsernameByProfileID(profileID) {
        const normalizedProfileID = sanitizeProfileID(profileID);
        if (!normalizedProfileID) {
            return '';
        }

        const username = sanitizeUsername(state.profileUsernamesByProfileID[normalizedProfileID]);
        if (!username) {
            return '';
        }
        return username;
    }

    function getDisplayNameByProfileID(profileID) {
        const normalizedProfileID = sanitizeProfileID(profileID);
        if (!normalizedProfileID) {
            return '';
        }

        const displayName = sanitizePersonName(state.profileDisplayNamesByProfileID[normalizedProfileID]);
        if (!displayName) {
            return '';
        }
        return displayName;
    }

    function resolvePeerDisplayName(peerProfileID, peerUsername) {
        const mappedDisplayName = getDisplayNameByProfileID(peerProfileID);
        if (mappedDisplayName) {
            return mappedDisplayName;
        }

        const normalizedUsername = sanitizeUsername(peerUsername);
        if (!normalizedUsername) {
            return '';
        }
        return normalizedUsername;
    }

    function resolveProfileIDByUsername(username) {
        const normalizedUsername = sanitizeUsername(username);
        if (!normalizedUsername) {
            return '';
        }

        const entries = Object.entries(state.profileUsernamesByProfileID);
        for (const [profileID, candidateUsername] of entries) {
            if (equalUsername(normalizedUsername, candidateUsername)) {
                return sanitizeProfileID(profileID);
            }
        }

        return '';
    }

    function getPeerProfileID(message) {
        const senderProfileID = sanitizeProfileID(message.sender_profile_id);
        const receivingProfileID = sanitizeProfileID(message.receiving_profile_id);

        if (state.currentProfileID) {
            if (equalProfileID(senderProfileID, state.currentProfileID)) {
                return receivingProfileID;
            }
            if (equalProfileID(receivingProfileID, state.currentProfileID)) {
                return senderProfileID;
            }
        }

        return receivingProfileID || senderProfileID;
    }

    function getProfilePictureURLForProfileID(profileID) {
        const normalizedProfileID = sanitizeProfileID(profileID);
        if (!normalizedProfileID) {
            return '';
        }

        return readString(state.profilePictureURLsByProfileID[normalizedProfileID], '');
    }

    function buildConversationAvatarHTML(label, profilePictureURL, avatarClassName) {
        const displayLabel = readString(label, '').trim() || 'User';
        const avatarLabel = escapeHTML(getAvatarLabel(displayLabel));
        const safeProfilePictureURL = readString(profilePictureURL, '').trim();

        if (safeProfilePictureURL === '') {
            return `
                <span class="conversation-avatar ${avatarClassName} conversation-avatar-fallback" aria-label="${escapeHTML(displayLabel)}">
                    <span class="conversation-avatar-fallback-text">${avatarLabel}</span>
                </span>
            `;
        }

        return `
            <span class="conversation-avatar ${avatarClassName}" aria-label="${escapeHTML(displayLabel)}">
                <img src="${escapeHTML(safeProfilePictureURL)}" alt="${escapeHTML(displayLabel)}" loading="lazy" />
            </span>
        `;
    }

    function isSentByCurrentUser(message) {
        if (!state.currentProfileID) {
            return false;
        }
        return equalProfileID(message.sender_profile_id, state.currentProfileID);
    }

    function setActiveConversation(conversationKey, peerProfileID, peerUsername, peerDisplayName = '') {
        state.activeConversationKey = readString(conversationKey, '');
        state.activePeerProfileID = sanitizeProfileID(peerProfileID);
        state.activePeerUsername = sanitizeUsername(peerUsername);
        state.activePeerDisplayName = sanitizePersonName(peerDisplayName);
        state.activePeerProfilePictureURL = '';

        if (!state.activePeerProfileID && state.activePeerUsername) {
            state.activePeerProfileID = resolveProfileIDByUsername(state.activePeerUsername);
        }
        if (!state.activePeerUsername && state.activePeerProfileID) {
            state.activePeerUsername = getUsernameByProfileID(state.activePeerProfileID);
        }
        if (!state.activePeerDisplayName && state.activePeerProfileID) {
            state.activePeerDisplayName = getDisplayNameByProfileID(state.activePeerProfileID);
        }
        if (state.activePeerProfileID) {
            state.activePeerProfilePictureURL = getProfilePictureURLForProfileID(state.activePeerProfileID);
        }
    }

    function refreshActivePeerFromLookup() {
        if (!state.activePeerProfileID && state.activePeerUsername) {
            state.activePeerProfileID = resolveProfileIDByUsername(state.activePeerUsername);
        }
        if (!state.activePeerUsername && state.activePeerProfileID) {
            state.activePeerUsername = getUsernameByProfileID(state.activePeerProfileID);
        }
        if (!state.activePeerDisplayName && state.activePeerProfileID) {
            state.activePeerDisplayName = getDisplayNameByProfileID(state.activePeerProfileID);
        }
    }

    async function markActiveConversationRead(activeMessages) {
        if (state.readUpdateInFlight) {
            return;
        }
        if (!state.currentProfileID || !state.activePeerProfileID) {
            return;
        }

        const unreadIncoming = activeMessages.filter((message) => {
            return !isSentByCurrentUser(message) && isUnreadMessageForCurrentUser(message, state.currentProfileID);
        });
        if (unreadIncoming.length === 0) {
            return;
        }

        state.readUpdateInFlight = true;
        try {
            const payload = await markChatConversationRead({
                peer_profile_id: state.activePeerProfileID
            });
            const readTime = readUnix(payload?.read_time) || Math.floor(Date.now() / 1000);

            for (const message of state.messages) {
                if (!equalProfileID(message.sender_profile_id, state.activePeerProfileID)) {
                    continue;
                }
                if (!equalProfileID(message.receiving_profile_id, state.currentProfileID)) {
                    continue;
                }
                if (readUnix(message.read_time) > 0) {
                    continue;
                }
                message.read_time = readTime;
            }

            renderAll();
        } catch (_) {
        } finally {
            state.readUpdateInFlight = false;
        }
    }

    function openCreateConversationPopup() {
        createInputEl.value = '';
        state.composeSelectedSuggestion = null;
        clearComposeSuggestions();
        createPopupEl.classList.remove('conversation-hidden');
        createInputEl.focus();
    }

    function closeCreateConversationPopup() {
        createPopupEl.classList.add('conversation-hidden');
        state.composeSelectedSuggestion = null;
        clearComposeSuggestions();
    }

    function handleDocumentMouseDown(event) {
        if (createPopupEl.classList.contains('conversation-hidden')) {
            return;
        }
        if (createPopupEl.contains(event.target)) {
            return;
        }
        clearComposeSuggestions();
    }

    function handleCreateSuggestionsMouseDown(event) {
        event.preventDefault();
    }

    function handleCreateInputKeydown(event) {
        if (event.key !== 'Enter') {
            return;
        }
        if (state.composeSelectedSuggestion) {
            return;
        }
        if (state.composeSuggestions.length === 1) {
            applyComposeSuggestion(state.composeSuggestions[0]);
        }
    }

    function handleCreateSuggestionClick(event) {
        const suggestionButton = event.target.closest('[data-compose-username]');
        if (!suggestionButton) {
            return;
        }

        const username = sanitizeUsername(suggestionButton.getAttribute('data-compose-username'));
        if (!username) {
            return;
        }

        const suggestion = state.composeSuggestions.find((entry) => {
            return equalUsername(entry.username, username);
        });
        if (!suggestion) {
            return;
        }

        applyComposeSuggestion(suggestion);
    }

    function applyComposeSuggestion(suggestion) {
        state.composeSelectedSuggestion = suggestion;
        createInputEl.value = suggestion.displayName;
        clearComposeSuggestions();
    }

    function handleCreateInputChange() {
        const rawQuery = sanitizeSearchQuery(createInputEl.value);
        if (!state.composeSelectedSuggestion || sanitizeSearchQuery(state.composeSelectedSuggestion.displayName) !== rawQuery) {
            state.composeSelectedSuggestion = null;
        }

        if (state.composeSearchTimerID) {
            window.clearTimeout(state.composeSearchTimerID);
            state.composeSearchTimerID = 0;
        }

        if (countSearchQueryCharacters(rawQuery) < COMPOSE_SEARCH_MIN_CHARS) {
            clearComposeSuggestions();
            return;
        }

        state.composeSearchTimerID = window.setTimeout(() => {
            fetchComposeSuggestions(rawQuery);
        }, COMPOSE_SEARCH_DEBOUNCE_MS);
    }

    async function fetchComposeSuggestions(query) {
        state.composeSearchRequestID += 1;
        const requestID = state.composeSearchRequestID;

        try {
            const payload = await searchProfiles(query, COMPOSE_SEARCH_LIMIT);
            if (requestID !== state.composeSearchRequestID) {
                return;
            }

            const suggestions = normalizeComposeSuggestions(payload?.results, state.currentUsername);
            state.composeSuggestions = suggestions;
            renderComposeSuggestions();
        } catch (_) {
            if (requestID !== state.composeSearchRequestID) {
                return;
            }
            clearComposeSuggestions();
        }
    }

    function normalizeComposeSuggestions(source, currentUsername) {
        if (!Array.isArray(source)) {
            return [];
        }

        const currentUsernameNormalized = sanitizeUsername(currentUsername);
        const deduplicatedSuggestions = [];
        const seenUsernames = new Set();

        for (const entry of source) {
            if (!entry || typeof entry !== 'object') {
                continue;
            }

            const username = sanitizeUsername(entry.username);
            if (!username) {
                continue;
            }
            if (currentUsernameNormalized && equalUsername(username, currentUsernameNormalized)) {
                continue;
            }

            const dedupeKey = username.toLowerCase();
            if (seenUsernames.has(dedupeKey)) {
                continue;
            }
            seenUsernames.add(dedupeKey);

            const firstName = sanitizePersonName(entry.first_name);
            const lastName = sanitizePersonName(entry.last_name);
            const profilePictureURL = readString(entry.profile_picture_url, '').trim();
            const displayName = buildDisplayNameFromParts(firstName, lastName, username);

            deduplicatedSuggestions.push({
                username,
                displayName,
                profilePictureURL
            });
        }

        return deduplicatedSuggestions;
    }

    function renderComposeSuggestions() {
        if (state.composeSuggestions.length === 0) {
            createSuggestionsEl.innerHTML = '';
            createSuggestionsEl.classList.add('conversation-hidden');
            return;
        }

        createSuggestionsEl.innerHTML = state.composeSuggestions.map((suggestion) => {
            const avatarHTML = buildConversationAvatarHTML(
                suggestion.displayName,
                suggestion.profilePictureURL,
                'conversation-popup-suggestion-avatar'
            );

            return `
                <li class="conversation-popup-suggestion-item">
                    <button type="button" class="conversation-popup-suggestion-button" data-compose-username="${escapeHTML(suggestion.username)}">
                        ${avatarHTML}
                        <span class="conversation-popup-suggestion-text">
                            <span class="conversation-popup-suggestion-name">${escapeHTML(suggestion.displayName)}</span>
                            <span class="conversation-popup-suggestion-username">@${escapeHTML(suggestion.username)}</span>
                        </span>
                    </button>
                </li>
            `;
        }).join('');
        createSuggestionsEl.classList.remove('conversation-hidden');
    }

    function clearComposeSuggestions() {
        if (state.composeSearchTimerID) {
            window.clearTimeout(state.composeSearchTimerID);
            state.composeSearchTimerID = 0;
        }

        state.composeSearchRequestID += 1;
        state.composeSuggestions = [];
        createSuggestionsEl.innerHTML = '';
        createSuggestionsEl.classList.add('conversation-hidden');
    }

    function resolveComposeReceivingUsername() {
        if (state.composeSelectedSuggestion && state.composeSelectedSuggestion.username) {
            return sanitizeUsername(state.composeSelectedSuggestion.username);
        }

        const rawValue = readString(createInputEl.value, '').trim();
        const normalizedUsername = sanitizeUsername(rawValue);
        if (normalizedUsername && !rawValue.includes(' ')) {
            return normalizedUsername;
        }

        if (state.composeSuggestions.length === 1) {
            return sanitizeUsername(state.composeSuggestions[0].username);
        }

        const normalizedQuery = sanitizeSearchQuery(rawValue);
        if (!normalizedQuery) {
            return '';
        }

        const exactUsernameMatch = state.composeSuggestions.find((entry) => {
            return sanitizeUsername(entry.username).toLowerCase() === normalizedQuery.replace(/\s+/g, '').toLowerCase();
        });
        if (exactUsernameMatch) {
            return sanitizeUsername(exactUsernameMatch.username);
        }

        const exactDisplayMatches = state.composeSuggestions.filter((entry) => {
            return sanitizeSearchQuery(entry.displayName) === normalizedQuery;
        });
        if (exactDisplayMatches.length === 1) {
            return sanitizeUsername(exactDisplayMatches[0].username);
        }

        return '';
    }

    async function handleMessageSubmit(event) {
        event.preventDefault();

        if (!state.activePeerUsername) {
            showStatus('Could not determine receiving username.', true);
            return;
        }

        const messageContent = messageInputEl.value.trim();
        if (!messageContent) {
            return;
        }

        if (!state.currentProfileID) {
            showStatus('Could not determine your account profile ID.', true);
            return;
        }

        messageInputEl.value = '';

        let optimisticMessage = null;
        if (state.activePeerProfileID) {
            optimisticMessage = {
                _id: `temp-${Date.now()}`,
                sender_profile_id: state.currentProfileID,
                receiving_profile_id: state.activePeerProfileID,
                sender_username: state.currentUsername,
                receiving_username: state.activePeerUsername,
                read_time: 0,
                sent_time: Math.floor(Date.now() / 1000),
                message_content: messageContent,
                is_attachment: false,
                attachment_url: '',
                pending: true,
                failed: false
            };

            state.messages.push(optimisticMessage);
            sortMessagesInPlace(state.messages);
            renderAll();
            setMobileConversationOpen(true);
        }

        try {
            const payload = await sendChatMessage({
                receiving_username: state.activePeerUsername,
                message_content: messageContent,
                is_attachment: false,
                attachment_url: ''
            });

            const incomingCurrentProfileID = sanitizeProfileID(payload?.current_profile_id);
            if (incomingCurrentProfileID) {
                state.currentProfileID = incomingCurrentProfileID;
            }

            const incomingCurrentUsername = sanitizeUsername(payload?.current_username);
            if (incomingCurrentUsername) {
                state.currentUsername = incomingCurrentUsername;
            }

            const incomingProfilePictureURLs = normalizeProfilePictureURLs(payload?.profile_picture_urls);
            const incomingProfileUsernames = normalizeProfileUsernames(payload?.profile_usernames);
            const incomingProfileDisplayNames = normalizeProfileDisplayNames(payload?.profile_display_names);
            state.profilePictureURLsByProfileID = mergeLookupMap(state.profilePictureURLsByProfileID, incomingProfilePictureURLs);
            state.profileUsernamesByProfileID = mergeLookupMap(state.profileUsernamesByProfileID, incomingProfileUsernames);
            state.profileDisplayNamesByProfileID = mergeLookupMap(state.profileDisplayNamesByProfileID, incomingProfileDisplayNames);

            const persistedMessage = normalizeMessage(payload?.message);
            if (!persistedMessage) {
                throw new Error('Invalid backend response');
            }

            if (optimisticMessage) {
                const optimisticIndex = state.messages.findIndex((message) => message._id === optimisticMessage._id);
                if (optimisticIndex >= 0) {
                    state.messages[optimisticIndex] = persistedMessage;
                } else {
                    state.messages.push(persistedMessage);
                }
            } else {
                state.messages.push(persistedMessage);
            }

            const peerProfileID = getPeerProfileID(persistedMessage);
            const peerUsername = resolvePeerUsername(persistedMessage, peerProfileID);
            setActiveConversation(
                buildConversationKey(persistedMessage.sender_profile_id, persistedMessage.receiving_profile_id),
                peerProfileID,
                peerUsername
            );

            hideStatus();
        } catch (_) {
            if (optimisticMessage) {
                optimisticMessage.pending = false;
                optimisticMessage.failed = true;
            }
            showStatus('Failed to send message.', true);
        }

        sortMessagesInPlace(state.messages);
        renderAll();
    }

    function setMobileConversationOpen(isOpen) {
        const mobileFooter = document.querySelector('.mobile-footer');
        state.mobileConversationOpen = Boolean(isOpen);

        if (window.innerWidth >= MOBILE_CHAT_BREAKPOINT) {
            state.mobileConversationOpen = false;
            pageEl.classList.remove('mobile-chat-active');
            setMobileConversationBodyState(false);
            if (mobileFooter) {
                mobileFooter.style.display = '';
            }
            unlockMobilePageScroll();
            resetMobileViewportStyles();
            return;
        }

        pageEl.classList.toggle('mobile-chat-active', state.mobileConversationOpen);
        setMobileConversationBodyState(state.mobileConversationOpen);

        if (mobileFooter) {
            mobileFooter.style.display = state.mobileConversationOpen ? 'none' : '';
        }

        if (!state.mobileConversationOpen) {
            unlockMobilePageScroll();
            resetMobileViewportStyles();
            return;
        }

        lockMobilePageScroll();
        syncMobileViewportState();
        scrollMessagesToBottom();
        window.setTimeout(scrollMessagesToBottom, 80);
        window.setTimeout(scrollMessagesToBottom, 160);
    }

    function setMobileConversationBodyState(isActive) {
        document.body.classList.toggle('conversation-mobile-active', Boolean(isActive));
    }

    function syncMobileViewportState() {
        if (window.innerWidth >= MOBILE_CHAT_BREAKPOINT || !state.mobileConversationOpen) {
            return;
        }

        const wasKeyboardOpen = state.mobileKeyboardOpen;
        const mobileHeaderHeight = readMobileHeaderHeight();
        const viewportHeight = readMobileViewportHeight();
        const keyboardOpen = viewportHeight + MOBILE_KEYBOARD_THRESHOLD_PX < window.innerHeight;
        state.mobileKeyboardOpen = keyboardOpen;

        pageEl.style.setProperty('--conversation-mobile-header-offset', `${mobileHeaderHeight}px`);
        pageEl.style.setProperty('--conversation-mobile-height', `${viewportHeight}px`);
        pageEl.classList.toggle('mobile-keyboard-open', keyboardOpen);

        if (keyboardOpen) {
            scrollMessagesToBottom();
        }
        if (!wasKeyboardOpen && keyboardOpen) {
            window.setTimeout(scrollMessagesToBottom, 80);
            window.setTimeout(scrollMessagesToBottom, 160);
        }
    }

    function resetMobileViewportStyles() {
        pageEl.style.removeProperty('--conversation-mobile-header-offset');
        pageEl.style.removeProperty('--conversation-mobile-height');
        pageEl.classList.remove('mobile-keyboard-open');
        state.mobileKeyboardOpen = false;
    }

    function lockMobilePageScroll() {
        document.documentElement.classList.add('conversation-scroll-lock');
        document.body.classList.add('conversation-scroll-lock');
    }

    function unlockMobilePageScroll() {
        document.documentElement.classList.remove('conversation-scroll-lock');
        document.body.classList.remove('conversation-scroll-lock');
        if (!state.mobileConversationOpen) {
            setMobileConversationBodyState(false);
        }
    }

    function readMobileHeaderHeight() {
        const mobileHeader = document.querySelector('.mobile-header');
        if (!mobileHeader) {
            return 0;
        }

        const headerBox = mobileHeader.getBoundingClientRect();
        if (!Number.isFinite(headerBox.height)) {
            return 0;
        }

        return Math.max(0, Math.round(headerBox.height));
    }

    function readMobileViewportHeight() {
        if (visualViewport && Number.isFinite(visualViewport.height) && visualViewport.height > 0) {
            return Math.round(visualViewport.height);
        }

        if (Number.isFinite(window.innerHeight) && window.innerHeight > 0) {
            return Math.round(window.innerHeight);
        }

        return 0;
    }

    function scrollMessagesToBottom() {
        if (windowBodyEl.classList.contains('conversation-hidden')) {
            return;
        }

        messagesEl.scrollTop = messagesEl.scrollHeight;
        window.requestAnimationFrame(() => {
            messagesEl.scrollTop = messagesEl.scrollHeight;
        });
    }

    function showStatus(message, isError) {
        statusEl.textContent = message;
        statusEl.classList.remove('conversation-hidden');
        statusEl.classList.toggle('conversation-status-error', Boolean(isError));
    }

    function hideStatus() {
        statusEl.textContent = '';
        statusEl.classList.add('conversation-hidden');
        statusEl.classList.remove('conversation-status-error');
    }
}


function normalizeMessages(source) {
    if (!Array.isArray(source)) {
        return [];
    }

    return source
        .map((entry) => normalizeMessage(entry))
        .filter((entry) => entry !== null);
}


function normalizeMessage(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const id = normalizeID(entry._id);
    const senderProfileID = sanitizeProfileID(entry.sender_profile_id);
    const receivingProfileID = sanitizeProfileID(entry.receiving_profile_id);
    const senderUsername = sanitizeUsername(entry.sender_username);
    const receivingUsername = sanitizeUsername(entry.receiving_username);
    const messageContent = readString(entry.message_content, '');
    const isAttachment = Boolean(entry.is_attachment);
    const attachmentURL = readString(entry.attachment_url, '');

    let sentTime = readUnix(entry.sent_time);
    if (sentTime <= 0) {
        sentTime = resolveMessageSentTime(id);
    }

    const readTime = readUnix(entry.read_time);

    if (!id || !senderProfileID || !receivingProfileID) {
        return null;
    }

    return {
        _id: id,
        sender_profile_id: senderProfileID,
        receiving_profile_id: receivingProfileID,
        sender_username: senderUsername,
        receiving_username: receivingUsername,
        read_time: readTime,
        sent_time: sentTime,
        message_content: messageContent,
        is_attachment: isAttachment,
        attachment_url: attachmentURL,
        pending: false,
        failed: false
    };
}


function normalizeID(value) {
    if (typeof value === 'string' && value !== '') {
        return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    return '';
}


function readUnix(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.floor(value);
    }

    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return 0;
}


function resolveMessageSentTime(id) {
    if (/^[a-fA-F0-9]{24}$/.test(id)) {
        const timestampHex = id.slice(0, 8);
        const timestampSeconds = Number.parseInt(timestampHex, 16);
        if (Number.isFinite(timestampSeconds)) {
            return timestampSeconds;
        }
    }

    return Math.floor(Date.now() / 1000);
}


function sanitizeProfileID(value) {
    let rawValue = '';
    if (typeof value === 'string') {
        rawValue = value;
    } else if (value && typeof value === 'object') {
        if (typeof value.$oid === 'string') {
            rawValue = value.$oid;
        } else if (typeof value.id === 'string') {
            rawValue = value.id;
        } else {
            rawValue = readString(value, '');
        }
    } else {
        rawValue = readString(value, '');
    }

    const normalizedValue = rawValue.trim().toLowerCase();
    if (/^[a-f0-9]{24}$/.test(normalizedValue)) {
        return normalizedValue;
    }
    return '';
}


function buildConversationKey(profileIDA, profileIDB) {
    const leftProfileID = sanitizeProfileID(profileIDA);
    const rightProfileID = sanitizeProfileID(profileIDB);
    if (!leftProfileID || !rightProfileID) {
        return '';
    }

    if (leftProfileID <= rightProfileID) {
        return `${leftProfileID}::${rightProfileID}`;
    }
    return `${rightProfileID}::${leftProfileID}`;
}


function buildDraftConversationKey(username) {
    const normalizedUsername = sanitizeUsername(username).toLowerCase();
    if (!normalizedUsername) {
        return '';
    }
    return `draft:${normalizedUsername}`;
}


function isUnreadMessageForCurrentUser(message, currentProfileID) {
    if (!message || !currentProfileID) {
        return false;
    }
    if (!equalProfileID(message.receiving_profile_id, currentProfileID)) {
        return false;
    }
    return readUnix(message.read_time) <= 0;
}


function sortMessagesInPlace(messages) {
    messages.sort((left, right) => {
        if (left.sent_time !== right.sent_time) {
            return left.sent_time - right.sent_time;
        }
        return left._id.localeCompare(right._id);
    });
}


function mergeLocalAndIncomingMessages(localMessages, incomingMessages) {
    const mergedByID = new Map();
    for (const incomingMessage of incomingMessages) {
        mergedByID.set(incomingMessage._id, {
            ...incomingMessage,
            pending: false,
            failed: false
        });
    }

    for (const localMessage of localMessages) {
        if (!isLocalOnlyMessage(localMessage, incomingMessages)) {
            continue;
        }

        if (!mergedByID.has(localMessage._id)) {
            mergedByID.set(localMessage._id, localMessage);
        }
    }

    return Array.from(mergedByID.values());
}


function isLocalOnlyMessage(localMessage, incomingMessages) {
    if (!localMessage || typeof localMessage !== 'object') {
        return false;
    }

    if (!readString(localMessage._id, '').startsWith('temp-')) {
        return false;
    }

    if (localMessage.failed) {
        return true;
    }

    const match = incomingMessages.some((incomingMessage) => isSameMessagePayload(localMessage, incomingMessage));
    return !match;
}


function isSameMessagePayload(leftMessage, rightMessage) {
    if (!leftMessage || !rightMessage) {
        return false;
    }

    if (!equalProfileID(leftMessage.sender_profile_id, rightMessage.sender_profile_id)) {
        return false;
    }
    if (!equalProfileID(leftMessage.receiving_profile_id, rightMessage.receiving_profile_id)) {
        return false;
    }

    if (readString(leftMessage.message_content, '') !== readString(rightMessage.message_content, '')) {
        return false;
    }
    if (Boolean(leftMessage.is_attachment) !== Boolean(rightMessage.is_attachment)) {
        return false;
    }
    if (readString(leftMessage.attachment_url, '') !== readString(rightMessage.attachment_url, '')) {
        return false;
    }

    return Math.abs(readUnix(leftMessage.sent_time) - readUnix(rightMessage.sent_time)) <= 20;
}


function didMessageCollectionChange(previousMessages, nextMessages) {
    if (!Array.isArray(previousMessages) || !Array.isArray(nextMessages)) {
        return true;
    }
    if (previousMessages.length !== nextMessages.length) {
        return true;
    }

    const previousSignatures = previousMessages.map((message) => messageSignature(message)).sort();
    const nextSignatures = nextMessages.map((message) => messageSignature(message)).sort();

    for (let index = 0; index < previousSignatures.length; index += 1) {
        if (previousSignatures[index] !== nextSignatures[index]) {
            return true;
        }
    }
    return false;
}


function normalizeProfilePictureURLs(source) {
    const profilePictureURLsByProfileID = {};
    if (!source || typeof source !== 'object') {
        return profilePictureURLsByProfileID;
    }

    for (const [profileID, profilePictureURL] of Object.entries(source)) {
        const normalizedProfileID = sanitizeProfileID(profileID);
        if (!normalizedProfileID) {
            continue;
        }

        const normalizedURL = readString(profilePictureURL, '').trim();
        if (normalizedURL === '') {
            continue;
        }

        profilePictureURLsByProfileID[normalizedProfileID] = normalizedURL;
    }

    return profilePictureURLsByProfileID;
}


function normalizeProfileUsernames(source) {
    const profileUsernamesByProfileID = {};
    if (!source || typeof source !== 'object') {
        return profileUsernamesByProfileID;
    }

    for (const [profileID, username] of Object.entries(source)) {
        const normalizedProfileID = sanitizeProfileID(profileID);
        if (!normalizedProfileID) {
            continue;
        }

        const normalizedUsername = sanitizeUsername(username);
        if (!normalizedUsername) {
            continue;
        }

        profileUsernamesByProfileID[normalizedProfileID] = normalizedUsername;
    }

    return profileUsernamesByProfileID;
}


function normalizeProfileDisplayNames(source) {
    const profileDisplayNamesByProfileID = {};
    if (!source || typeof source !== 'object') {
        return profileDisplayNamesByProfileID;
    }

    for (const [profileID, displayName] of Object.entries(source)) {
        const normalizedProfileID = sanitizeProfileID(profileID);
        if (!normalizedProfileID) {
            continue;
        }

        const normalizedDisplayName = sanitizePersonName(displayName);
        if (!normalizedDisplayName) {
            continue;
        }

        profileDisplayNamesByProfileID[normalizedProfileID] = normalizedDisplayName;
    }

    return profileDisplayNamesByProfileID;
}


function mergeLookupMap(previousMap, nextMap) {
    return {
        ...previousMap,
        ...nextMap
    };
}


function didLookupMapChange(previousMap, nextMap) {
    const previousKeys = Object.keys(previousMap).sort();
    const nextKeys = Object.keys(nextMap).sort();

    if (previousKeys.length !== nextKeys.length) {
        return true;
    }

    for (let index = 0; index < previousKeys.length; index += 1) {
        const previousKey = previousKeys[index];
        const nextKey = nextKeys[index];
        if (previousKey !== nextKey) {
            return true;
        }
        if (readString(previousMap[previousKey], '') !== readString(nextMap[nextKey], '')) {
            return true;
        }
    }

    return false;
}


function messageSignature(message) {
    return [
        readString(message && message._id, ''),
        readUnix(message && message.sent_time),
        readUnix(message && message.read_time),
        message && message.pending ? '1' : '0',
        message && message.failed ? '1' : '0'
    ].join(':');
}


function sanitizePersonName(value) {
    return readString(value, '').trim().replace(/\s+/g, ' ');
}


function buildDisplayNameFromParts(firstName, lastName, username) {
    const normalizedFirstName = sanitizePersonName(firstName);
    const normalizedLastName = sanitizePersonName(lastName);
    const fullName = sanitizePersonName(`${normalizedFirstName} ${normalizedLastName}`);
    if (fullName) {
        return fullName;
    }

    return sanitizeUsername(username);
}


function sanitizeSearchQuery(value) {
    return readString(value, '').trim().replace(/\s+/g, ' ').toLowerCase();
}


function countSearchQueryCharacters(value) {
    return sanitizeSearchQuery(value).replace(/\s+/g, '').length;
}


function sanitizeUsername(value) {
    return readString(value, '').trim().replace(/\s+/g, '');
}


function getAvatarLabel(label) {
    const normalizedUsername = sanitizeUsername(label);
    if (normalizedUsername !== '') {
        return normalizedUsername.slice(0, 2).toUpperCase();
    }

    const normalizedProfileID = sanitizeProfileID(label);
    if (normalizedProfileID !== '') {
        return normalizedProfileID.slice(0, 2).toUpperCase();
    }

    return '?';
}


function equalUsername(leftValue, rightValue) {
    return sanitizeUsername(leftValue).toLowerCase() === sanitizeUsername(rightValue).toLowerCase();
}


function equalProfileID(leftValue, rightValue) {
    return sanitizeProfileID(leftValue) === sanitizeProfileID(rightValue);
}


function readString(value, fallback) {
    if (typeof value === 'string') {
        return value;
    }

    if (value === null || value === undefined) {
        return fallback;
    }

    return String(value);
}


function formatMessageTime(unixSeconds) {
    if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) {
        return '';
    }

    const date = new Date(unixSeconds * 1000);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });
}


function formatMessageHoverTime(unixSeconds) {
    if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) {
        return '';
    }

    const date = new Date(unixSeconds * 1000);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}


function escapeHTML(value) {
    const source = readString(value, '');

    return source
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
