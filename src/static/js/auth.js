const authCookieName = 'auth';


export function getCurrentUserFromAuth() {
    const payload = getAuthPayload();
    if (!payload) {
        return {
            id: '',
            firstName: '',
            lastName: '',
            profilePictureURL: ''
        };
    }

    return {
        id: payload.username,
        firstName: payload.firstName,
        lastName: payload.lastName,
        profilePictureURL: payload.profilePictureURL
    };
}


export function getSettingsFromAuth() {
    const payload = getAuthPayload();
    if (!payload) {
        return null;
    }

    return {
        username: payload.username,
        first_name: payload.firstName,
        last_name: payload.lastName,
        email: payload.email,
        phone_number: payload.phoneNumber,
        profile_picture_url: payload.profilePictureURL
    };
}


export function getCurrentUsernameFromAuth() {
    const payload = getAuthPayload();
    if (!payload) {
        return '';
    }
    return payload.username;
}


export function getAuthPayload() {
    if (typeof document === 'undefined') {
        return null;
    }

    const rawCookie = readCookieValue(authCookieName);
    if (rawCookie === '') {
        return null;
    }

    const decoded = decodeBase64URLJSON(rawCookie);
    if (!decoded || typeof decoded !== 'object') {
        return null;
    }

    const expiryTime = normalizeUnixTime(decoded.expiry_time);
    if (expiryTime > 0 && Date.now() >= (expiryTime * 1000)) {
        return null;
    }

    return {
        uid: normalizeString(decoded.uid),
        username: normalizeString(decoded.username),
        firstName: normalizeString(decoded.first_name),
        lastName: normalizeString(decoded.last_name),
        email: normalizeString(decoded.email),
        phoneNumber: normalizeString(decoded.phone_number),
        profilePictureURL: normalizeString(decoded.profile_picture_url),
        expiryTime
    };
}


function readCookieValue(name) {
    const encodedName = `${encodeURIComponent(name)}=`;
    const cookies = String(document.cookie || '').split(';');
    for (const cookieEntry of cookies) {
        const trimmed = cookieEntry.trim();
        if (trimmed.startsWith(encodedName)) {
            const rawValue = trimmed.slice(encodedName.length);
            return decodeURIComponent(rawValue);
        }
    }
    return '';
}


function decodeBase64URLJSON(value) {
    const normalized = normalizeBase64URL(value);
    if (normalized === '') {
        return null;
    }

    try {
        const binary = atob(normalized);
        let text = '';
        for (let index = 0; index < binary.length; index += 1) {
            text += `%${binary.charCodeAt(index).toString(16).padStart(2, '0')}`;
        }
        return JSON.parse(decodeURIComponent(text));
    } catch (_) {
        return null;
    }
}


function normalizeBase64URL(value) {
    const normalized = normalizeString(value).replace(/-/g, '+').replace(/_/g, '/');
    if (normalized === '') {
        return '';
    }

    const remainder = normalized.length % 4;
    if (remainder === 0) {
        return normalized;
    }
    if (remainder === 2) {
        return `${normalized}==`;
    }
    if (remainder === 3) {
        return `${normalized}=`;
    }
    return '';
}


function normalizeString(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim();
}


function normalizeUnixTime(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return 0;
    }
    return parsed;
}
