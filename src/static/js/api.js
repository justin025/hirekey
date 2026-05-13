export function getProfile(profileId) {
    return fetch(`/api/v1/profile/${profileId}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        });
}

export function getPost(profileId, offset = 0, limit = 10) {
    const parsedOffset = Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
    const parsedLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 10;
    return fetch(`/api/v1/post/${profileId}?offset=${parsedOffset}&limit=${parsedLimit}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        });
}

export function recordPostView(relId) {
    return fetch('/api/v1/post/view', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId
        })
    }).then(parseJSONResponse);
}


export function getFeedPosts(limit = 10, beforeId = '', excludeIDs = [], mode = 'for_you') {
    const parsedLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 10;
    const queryParams = new URLSearchParams();
    queryParams.set('limit', String(parsedLimit));
    queryParams.set('mode', mode === 'following' ? 'following' : 'for_you');

    const normalizedBeforeId = String(beforeId || '').trim();
    if (normalizedBeforeId !== '') {
        queryParams.set('before_id', normalizedBeforeId);
    }

    if (Array.isArray(excludeIDs) && excludeIDs.length > 0) {
        const normalizedExcludeIDs = excludeIDs
            .map((entry) => String(entry || '').trim())
            .filter((entry) => entry !== '');
        if (normalizedExcludeIDs.length > 0) {
            queryParams.set('exclude_ids', normalizedExcludeIDs.join(','));
        }
    }

    return fetch(`/api/v1/feed?${queryParams.toString()}`)
        .then(parseJSONResponse);
}


export function createFeedPost(postText, attachments = []) {
    return fetch('/api/v1/feed', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            post_text: postText,
            attachments: Array.isArray(attachments) ? attachments : []
        })
    }).then(parseJSONResponse);
}


export function updatePost(postId, postText) {
    return fetch('/api/v1/post/edit', {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            post_id: postId,
            post_text: postText
        })
    }).then(parseJSONResponse);
}


export function deletePost(postId) {
    return fetch('/api/v1/post/delete', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            post_id: postId
        })
    }).then(parseJSONResponse);
}


export function getRecruits(limit = 250) {
    const parsedLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 250;
    return fetch(`/api/v1/recruit?limit=${parsedLimit}`)
        .then(parseJSONResponse);
}

export function getMarketplaceListings(query = '', limit = 30) {
    const encodedQuery = encodeURIComponent(String(query || '').trim());
    const parsedLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 30;
    return fetch(`/api/v1/marketplace?query=${encodedQuery}&limit=${parsedLimit}`)
        .then(parseJSONResponse);
}


export function createMarketplaceListing(payload) {
    return fetch('/api/v1/marketplace', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload || {})
    }).then(parseJSONResponse);
}


export function getEvents(query = '', limit = 12) {
    const encodedQuery = encodeURIComponent(String(query || '').trim());
    const parsedLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 12;
    return fetch(`/api/v1/event?query=${encodedQuery}&limit=${parsedLimit}`)
        .then(parseJSONResponse);
}


export function getProfileEvents(profileId, limit = 30) {
    const encodedProfileId = encodeURIComponent(String(profileId || '').trim());
    const parsedLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 30;
    return fetch(`/api/v1/profile/events?profile_id=${encodedProfileId}&limit=${parsedLimit}`)
        .then(parseJSONResponse);
}

export function getStories(profileId = '', limit = 30) {
    const queryParams = new URLSearchParams();
    const normalizedProfileId = String(profileId || '').trim();
    const parsedLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 30;
    queryParams.set('limit', String(parsedLimit));
    if (normalizedProfileId !== '') {
        queryParams.set('profile_id', normalizedProfileId);
    }

    return fetch(`/api/v1/story?${queryParams.toString()}`)
        .then(parseJSONResponse);
}

export function createStory(payload) {
    return fetch('/api/v1/story', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload || {})
    }).then(parseJSONResponse);
}


export function createEvent(payload) {
    return fetch('/api/v1/event', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    }).then(parseJSONResponse);
}


export function toggleEventRsvp(eventId) {
    return fetch('/api/v1/event/rsvp', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            event_id: eventId
        })
    }).then(parseJSONResponse);
}


export function searchProfiles(query, limit = 100) {
    const encodedQuery = encodeURIComponent(query || '');
    return fetch(`/api/v1/search/profile?query=${encodedQuery}&limit=${limit}`)
        .then(parseJSONResponse);
}


export function getLikeState(relId) {
    const encodedRelId = encodeURIComponent(relId || '');
    return fetch(`/api/v1/like?rel_id=${encodedRelId}`)
        .then(parseJSONResponse);
}


export function toggleLike(relId) {
    return fetch('/api/v1/like', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId
        })
    }).then(parseJSONResponse);
}


export function getFollowState(relId) {
    const encodedRelId = encodeURIComponent(relId || '');
    return fetch(`/api/v1/follow?rel_id=${encodedRelId}`)
        .then(parseJSONResponse);
}


export function toggleFollow(relId) {
    return fetch('/api/v1/follow', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId
        })
    }).then(parseJSONResponse);
}


export function getLikeStates(relIds) {
    return fetch('/api/v1/like/state', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_ids: Array.isArray(relIds) ? relIds : []
        })
    }).then(parseJSONResponse);
}


export function addLike(relId) {
    return fetch('/api/v1/like/add', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId
        })
    }).then(parseJSONResponse);
}


export function removeLike(relId) {
    return fetch('/api/v1/like/remove', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId
        })
    }).then(parseJSONResponse);
}

export function getShareState(relId) {
    const encodedRelId = encodeURIComponent(relId || '');
    return fetch(`/api/v1/share?rel_id=${encodedRelId}`)
        .then(parseJSONResponse);
}

export function toggleShare(relId) {
    return fetch('/api/v1/share', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId
        })
    }).then(parseJSONResponse);
}

export function getShareStates(relIds) {
    return fetch('/api/v1/share/state', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_ids: Array.isArray(relIds) ? relIds : []
        })
    }).then(parseJSONResponse);
}

export function addShare(relId) {
    return fetch('/api/v1/share/add', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId
        })
    }).then(parseJSONResponse);
}

export function removeShare(relId) {
    return fetch('/api/v1/share/remove', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId
        })
    }).then(parseJSONResponse);
}

export function getRepostState(relId) {
    const encodedRelId = encodeURIComponent(relId || '');
    return fetch(`/api/v1/repost?rel_id=${encodedRelId}`)
        .then(parseJSONResponse);
}

export function toggleRepost(relId) {
    return fetch('/api/v1/repost', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId
        })
    }).then(parseJSONResponse);
}

export function getRepostStates(relIds) {
    return fetch('/api/v1/repost/state', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_ids: Array.isArray(relIds) ? relIds : []
        })
    }).then(parseJSONResponse);
}

export function addRepost(relId) {
    return fetch('/api/v1/repost/add', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId
        })
    }).then(parseJSONResponse);
}

export function removeRepost(relId) {
    return fetch('/api/v1/repost/remove', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId
        })
    }).then(parseJSONResponse);
}

export function getSaveState(relId) {
    const encodedRelId = encodeURIComponent(relId || '');
    return fetch(`/api/v1/save?rel_id=${encodedRelId}`)
        .then(parseJSONResponse);
}

export function toggleSave(relId) {
    return fetch('/api/v1/save', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId
        })
    }).then(parseJSONResponse);
}

export function getSaveStates(relIds) {
    return fetch('/api/v1/save/state', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_ids: Array.isArray(relIds) ? relIds : []
        })
    }).then(parseJSONResponse);
}

export function addSave(relId) {
    return fetch('/api/v1/save/add', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId
        })
    }).then(parseJSONResponse);
}

export function removeSave(relId) {
    return fetch('/api/v1/save/remove', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId
        })
    }).then(parseJSONResponse);
}


export function getFollowStates(relIds) {
    return fetch('/api/v1/follow/state', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_ids: Array.isArray(relIds) ? relIds : []
        })
    }).then(parseJSONResponse);
}


export function addFollow(relId) {
    return fetch('/api/v1/follow/add', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId
        })
    }).then(parseJSONResponse);
}


export function removeFollow(relId) {
    return fetch('/api/v1/follow/remove', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId
        })
    }).then(parseJSONResponse);
}

export function toggleBlock(relId) {
    return fetch('/api/v1/block', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId
        })
    }).then(parseJSONResponse);
}

export function addBlock(relId) {
    return fetch('/api/v1/block/add', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId
        })
    }).then(parseJSONResponse);
}

export function removeBlock(relId) {
    return fetch('/api/v1/block/remove', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId
        })
    }).then(parseJSONResponse);
}

export function getBlockedUsers() {
    return fetch('/api/v1/block/list')
        .then(parseJSONResponse);
}

export function createReport(relId, entityType, reason = '') {
    return fetch('/api/v1/report', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId,
            entity_type: entityType,
            reason
        })
    }).then(parseJSONResponse);
}


export function getComments(relId, limit = 100) {
    const encodedRelId = encodeURIComponent(relId || '');
    const parsedLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 100;
    return fetch(`/api/v1/comment?rel_id=${encodedRelId}&limit=${parsedLimit}`)
        .then(parseJSONResponse);
}


export function addComment(relId, commentContent) {
    return fetch('/api/v1/comment', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            rel_id: relId,
            comment_content: commentContent
        })
    }).then(parseJSONResponse);
}

async function parseJSONResponse(response) {
    if (response.ok) {
        return response.json();
    }

    let errorMessage = `HTTP error! status: ${response.status}`;
    try {
        const payload = await response.json();
        if (payload && typeof payload.error === 'string' && payload.error.trim() !== '') {
            errorMessage = payload.error.trim();
        }
    } catch (_) {
    }
    throw new Error(errorMessage);
}

export function getChatMessages(limit = 50) {
    return fetch(`/api/v1/chat/message?limit=${limit}`)
        .then(parseJSONResponse);
}

export function sendChatMessage(payload) {
    return fetch('/api/v1/chat/message', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    }).then(parseJSONResponse);
}

export function markChatConversationRead(payload) {
    return fetch('/api/v1/chat/message', {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    }).then(parseJSONResponse);
}

export function getUnreadChatCount() {
    return fetch('/api/v1/chat/unread')
        .then(parseJSONResponse);
}


export function getSettingsAccount() {
    return fetch('/api/v1/settings/account')
        .then(parseJSONResponse);
}


export function updateSettingsAccount(payload) {
    return fetch('/api/v1/settings/account', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    }).then(parseJSONResponse);
}


export function updateSettingsPassword(payload) {
    return fetch('/api/v1/settings/password', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    }).then(parseJSONResponse);
}


export function logoutSettingsSession() {
    return fetch('/api/v1/settings/logout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    }).then(parseJSONResponse);
}


export function deleteSettingsAccount() {
    return fetch('/api/v1/settings/account/delete', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    }).then(parseJSONResponse);
}
