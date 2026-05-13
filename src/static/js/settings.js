import {
    deleteSettingsAccount,
    getBlockedUsers,
    logoutSettingsSession,
    removeBlock,
    updateSettingsAccount,
    updateSettingsPassword
} from './api.js';
import { getSettingsFromAuth } from './auth.js';


const settingsTemplate = `
    <div class="settings-main-content">
        <div class="settings-section active" id="settings-general">
            <div class="settings-section-header">
                <h1 class="settings-section-title">General Account Settings</h1>
                <p class="settings-section-description">Update your account details and manage your session.</p>
            </div>

            <div class="settings-card settings-profile-card">
                <div class="settings-profile-tile">
                    <span class="settings-profile-avatar-shell" aria-hidden="true">
                        <img id="settings-profile-picture" class="settings-profile-picture settings-hidden" alt="Profile picture">
                        <span id="settings-profile-fallback" class="settings-profile-fallback">U</span>
                    </span>
                    <div class="settings-profile-content">
                        <h2 id="settings-profile-display-name" class="settings-profile-display-name">Loading...</h2>
                        <p id="settings-profile-username" class="settings-profile-username">@user</p>
                    </div>
                </div>
            </div>

            <div id="settings-account-actions-status" class="status-message">Session actions are available below.</div>

            <div class="settings-card">
                <h2 class="settings-card-title">Account Actions</h2>
                <div class="settings-button-group">
                    <button id="settings-banned-users-button" class="settings-button settings-button-secondary" type="button">Banned Users</button>
                    <button id="settings-logout-button" class="settings-button settings-button-secondary" type="button">Log Out</button>
                    <button id="settings-delete-button" class="settings-button settings-button-danger" type="button">Delete Account</button>
                </div>
            </div>

            <div id="settings-account-status" class="status-message">Loading account details...</div>

            <div class="settings-card">
                <h2 class="settings-card-title">Account Details</h2>
                <form id="settings-account-form">
                    <div class="settings-form-group">
                        <label for="settings-username" class="settings-form-label">Username</label>
                        <input id="settings-username" class="settings-form-input" type="text" readonly>
                    </div>

                    <div class="settings-form-group">
                        <label for="settings-first-name" class="settings-form-label">First Name</label>
                        <input id="settings-first-name" class="settings-form-input" type="text" required>
                    </div>

                    <div class="settings-form-group">
                        <label for="settings-last-name" class="settings-form-label">Last Name</label>
                        <input id="settings-last-name" class="settings-form-input" type="text" required>
                    </div>

                    <div class="settings-form-group">
                        <label for="settings-email" class="settings-form-label">Email</label>
                        <input id="settings-email" class="settings-form-input" type="email" required>
                    </div>

                    <div class="settings-form-group">
                        <label for="settings-phone-number" class="settings-form-label">Phone Number</label>
                        <input id="settings-phone-number" class="settings-form-input" type="tel" required>
                    </div>

                    <div class="settings-button-group">
                        <button id="settings-account-save" class="settings-button settings-button-primary" type="submit">Save Changes</button>
                        <button id="settings-account-reset" class="settings-button settings-button-secondary" type="button">Reset</button>
                    </div>
                </form>
            </div>

            <div class="settings-card">
                <h2 class="settings-card-title">Appearance</h2>
                <div class="settings-info-box">
                    <div class="settings-info-box-title">Theme: Auto</div>
                    <div class="settings-info-box-text">Theme follows your browser or device light/dark preference.</div>
                </div>
            </div>

            <div id="settings-password-status" class="status-message">Use the form below to change your password.</div>

            <div class="settings-card">
                <h2 class="settings-card-title">Change Password</h2>
                <form id="settings-password-form">
                    <div class="settings-form-group">
                        <label for="settings-current-password" class="settings-form-label">Current Password</label>
                        <input id="settings-current-password" class="settings-form-input" type="password" autocomplete="current-password" required>
                    </div>

                    <div class="settings-form-group">
                        <label for="settings-new-password" class="settings-form-label">New Password</label>
                        <input id="settings-new-password" class="settings-form-input" type="password" autocomplete="new-password" required>
                    </div>

                    <div class="settings-form-group">
                        <label for="settings-confirm-password" class="settings-form-label">Confirm New Password</label>
                        <input id="settings-confirm-password" class="settings-form-input" type="password" autocomplete="new-password" required>
                    </div>

                    <div class="settings-button-group">
                        <button id="settings-password-save" class="settings-button settings-button-primary" type="submit">Update Password</button>
                        <button id="settings-password-clear" class="settings-button settings-button-secondary" type="button">Clear</button>
                    </div>
                </form>
            </div>
        </div>
        <div id="settings-banned-users-popup" class="settings-banned-users-popup" hidden>
            <button id="settings-banned-users-backdrop" class="settings-banned-users-backdrop" type="button" aria-label="Close blocked users list"></button>
            <section class="settings-banned-users-card" role="dialog" aria-modal="true" aria-labelledby="settings-banned-users-title">
                <header class="settings-banned-users-header">
                    <h2 id="settings-banned-users-title">Banned Users</h2>
                    <button id="settings-banned-users-close" class="settings-banned-users-close" type="button" aria-label="Close blocked users list">×</button>
                </header>
                <p id="settings-banned-users-status" class="settings-banned-users-status" aria-live="polite"></p>
                <div id="settings-banned-users-list" class="settings-banned-users-list"></div>
            </section>
        </div>
    </div>
`;


export async function drawSettings(currentUser = null) {
    let mainContainer = document.querySelector('.main-container');
    if (!mainContainer) {
        mainContainer = document.createElement('div');
        mainContainer.className = 'main-container';
        document.body.appendChild(mainContainer);
    }

    mainContainer.innerHTML = settingsTemplate;

    const form = document.getElementById('settings-account-form');
    const saveButton = document.getElementById('settings-account-save');
    const resetButton = document.getElementById('settings-account-reset');
    const statusElement = document.getElementById('settings-account-status');
    const accountActionsStatusElement = document.getElementById('settings-account-actions-status');
    const bannedUsersButton = document.getElementById('settings-banned-users-button');
    const logoutButton = document.getElementById('settings-logout-button');
    const deleteButton = document.getElementById('settings-delete-button');
    const bannedUsersPopup = {
        root: document.getElementById('settings-banned-users-popup'),
        backdrop: document.getElementById('settings-banned-users-backdrop'),
        close: document.getElementById('settings-banned-users-close'),
        status: document.getElementById('settings-banned-users-status'),
        list: document.getElementById('settings-banned-users-list')
    };
    const passwordForm = document.getElementById('settings-password-form');
    const passwordSaveButton = document.getElementById('settings-password-save');
    const passwordClearButton = document.getElementById('settings-password-clear');
    const passwordStatusElement = document.getElementById('settings-password-status');
    const fields = {
        username: document.getElementById('settings-username'),
        firstName: document.getElementById('settings-first-name'),
        lastName: document.getElementById('settings-last-name'),
        email: document.getElementById('settings-email'),
        phoneNumber: document.getElementById('settings-phone-number')
    };
    const profileElements = {
        picture: document.getElementById('settings-profile-picture'),
        fallback: document.getElementById('settings-profile-fallback'),
        displayName: document.getElementById('settings-profile-display-name'),
        username: document.getElementById('settings-profile-username')
    };

    const state = {
        initialValues: {
            username: '',
            firstName: '',
            lastName: '',
            email: '',
            phoneNumber: '',
            profilePictureURL: ''
        }
    };

    attachSettingsHandlers(form, saveButton, resetButton, statusElement, fields, profileElements, state);
    attachAccountActionHandlers(bannedUsersButton, logoutButton, deleteButton, accountActionsStatusElement);
    attachPasswordHandlers(passwordForm, passwordSaveButton, passwordClearButton, passwordStatusElement);
    attachBannedUsersHandlers(bannedUsersButton, bannedUsersPopup);
    await loadSettingsAccount(fields, profileElements, statusElement, state, saveButton, resetButton);
}


function attachSettingsHandlers(form, saveButton, resetButton, statusElement, fields, profileElements, state) {
    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const payload = readSettingsForm(fields);
        if (!payload.first_name || !payload.last_name || !payload.email || !payload.phone_number) {
            showSettingsStatus(statusElement, 'All fields are required.', true);
            return;
        }
        if (!payload.email.includes('@')) {
            showSettingsStatus(statusElement, 'Enter a valid email address.', true);
            return;
        }

        setButtonsDisabled(saveButton, resetButton, true);
        showSettingsStatus(statusElement, 'Saving account changes...', false);

        try {
            const response = await updateSettingsAccount(payload);
            const values = {
                username: response.username || state.initialValues.username,
                firstName: response.first_name || payload.first_name,
                lastName: response.last_name || payload.last_name,
                email: response.email || payload.email,
                phoneNumber: response.phone_number || payload.phone_number,
                profilePictureURL: response.profile_picture_url || state.initialValues.profilePictureURL
            };

            writeSettingsForm(fields, values);
            writeSettingsProfileTile(profileElements, values);
            state.initialValues = values;
            showSettingsStatus(statusElement, 'Account settings updated.', false);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to save settings.';
            showSettingsStatus(statusElement, message, true);
        } finally {
            setButtonsDisabled(saveButton, resetButton, false);
        }
    });

    resetButton.addEventListener('click', () => {
        writeSettingsForm(fields, state.initialValues);
        writeSettingsProfileTile(profileElements, state.initialValues);
        showSettingsStatus(statusElement, 'Changes reset.', false);
    });
}


function attachAccountActionHandlers(bannedUsersButton, logoutButton, deleteButton, statusElement) {
    if (!logoutButton || !deleteButton || !statusElement) {
        return;
    }

    logoutButton.addEventListener('click', async () => {
        setButtonsDisabled(logoutButton, deleteButton, true, bannedUsersButton);
        showSettingsStatus(statusElement, 'Signing out...', false);

        try {
            await logoutSettingsSession();
            window.location.href = `/login?msg=${encodeURIComponent('Signed out successfully.')}`;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to sign out.';
            showSettingsStatus(statusElement, message, true);
            setButtonsDisabled(logoutButton, deleteButton, false, bannedUsersButton);
        }
    });

    deleteButton.addEventListener('click', async () => {
        const shouldDelete = window.confirm('Delete your account permanently? This action cannot be undone.');
        if (!shouldDelete) {
            return;
        }

        setButtonsDisabled(logoutButton, deleteButton, true, bannedUsersButton);
        showSettingsStatus(statusElement, 'Deleting account...', false);

        try {
            await deleteSettingsAccount();
            window.location.href = `/login?msg=${encodeURIComponent('Account deleted.')}`;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to delete account.';
            showSettingsStatus(statusElement, message, true);
            setButtonsDisabled(logoutButton, deleteButton, false, bannedUsersButton);
        }
    });
}

function attachBannedUsersHandlers(openButton, popupRefs) {
    if (!openButton || !popupRefs || !popupRefs.root || !popupRefs.status || !popupRefs.list) {
        return;
    }

    const closePopup = () => {
        popupRefs.root.hidden = true;
        popupRefs.root.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('settings-banned-users-popup-open');
    };

    const openPopup = async () => {
        popupRefs.root.hidden = false;
        popupRefs.root.setAttribute('aria-hidden', 'false');
        document.body.classList.add('settings-banned-users-popup-open');
        await loadBannedUsers(popupRefs);
    };

    openButton.addEventListener('click', () => {
        void openPopup();
    });

    if (popupRefs.backdrop) {
        popupRefs.backdrop.addEventListener('click', closePopup);
    }
    if (popupRefs.close) {
        popupRefs.close.addEventListener('click', closePopup);
    }

    popupRefs.list.addEventListener('click', async (event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target) {
            return;
        }

        const unblockButton = target.closest('.settings-banned-user-unblock');
        if (!unblockButton || !(unblockButton instanceof HTMLButtonElement)) {
            return;
        }

        const relId = (unblockButton.dataset.relId || '').trim();
        if (relId === '') {
            return;
        }

        unblockButton.disabled = true;
        popupRefs.status.textContent = 'Unblocking user...';
        popupRefs.status.classList.remove('is-error');
        try {
            await removeBlock(relId);
            popupRefs.status.textContent = 'User unblocked.';
            popupRefs.status.classList.remove('is-error');
            await loadBannedUsers(popupRefs);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to unblock user.';
            popupRefs.status.textContent = message;
            popupRefs.status.classList.add('is-error');
            unblockButton.disabled = false;
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') {
            return;
        }
        if (popupRefs.root.hidden) {
            return;
        }
        closePopup();
    });
}

async function loadBannedUsers(popupRefs) {
    if (!popupRefs || !popupRefs.status || !popupRefs.list) {
        return;
    }

    popupRefs.status.textContent = 'Loading banned users...';
    popupRefs.status.classList.remove('is-error');
    popupRefs.list.textContent = '';

    try {
        const response = await getBlockedUsers();
        const blockedProfiles = Array.isArray(response?.blocked_profiles) ? response.blocked_profiles : [];
        renderBannedUsersList(popupRefs.list, blockedProfiles);
        if (blockedProfiles.length === 0) {
            popupRefs.status.textContent = 'No banned users.';
            return;
        }
        popupRefs.status.textContent = `${blockedProfiles.length} banned users.`;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load banned users.';
        popupRefs.status.textContent = message;
        popupRefs.status.classList.add('is-error');
    }
}

function renderBannedUsersList(listElement, blockedProfiles) {
    listElement.textContent = '';
    if (!Array.isArray(blockedProfiles) || blockedProfiles.length === 0) {
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const profile of blockedProfiles) {
        const relId = String(profile?.rel_id || '').trim();
        if (relId === '') {
            continue;
        }

        const username = String(profile?.username || '').trim();
        const firstName = String(profile?.first_name || '').trim();
        const lastName = String(profile?.last_name || '').trim();
        const profilePictureURL = String(profile?.profile_picture_url || '').trim();
        const displayName = buildSettingsDisplayName(firstName, lastName, username);
        const initials = buildSettingsInitials(firstName, lastName, username);

        const row = document.createElement('article');
        row.className = 'settings-banned-user-row';

        const identity = document.createElement('div');
        identity.className = 'settings-banned-user-identity';

        const avatarShell = document.createElement('span');
        avatarShell.className = 'settings-banned-user-avatar-shell';

        if (profilePictureURL !== '') {
            const avatar = document.createElement('img');
            avatar.className = 'settings-banned-user-avatar';
            avatar.src = profilePictureURL;
            avatar.alt = `${displayName} profile picture`;
            avatar.loading = 'lazy';
            avatarShell.appendChild(avatar);
        } else {
            const avatarFallback = document.createElement('span');
            avatarFallback.className = 'settings-banned-user-avatar-fallback';
            avatarFallback.textContent = initials;
            avatarShell.appendChild(avatarFallback);
        }

        const text = document.createElement('div');
        text.className = 'settings-banned-user-text';

        const nameElement = document.createElement('p');
        nameElement.className = 'settings-banned-user-name';
        nameElement.textContent = displayName;

        const usernameElement = document.createElement('p');
        usernameElement.className = 'settings-banned-user-username';
        usernameElement.textContent = username ? `@${username}` : '';

        text.appendChild(nameElement);
        text.appendChild(usernameElement);
        identity.appendChild(avatarShell);
        identity.appendChild(text);

        const unblockButton = document.createElement('button');
        unblockButton.type = 'button';
        unblockButton.className = 'settings-button settings-button-secondary settings-banned-user-unblock';
        unblockButton.textContent = 'Unblock';
        unblockButton.dataset.relId = relId;

        row.appendChild(identity);
        row.appendChild(unblockButton);
        fragment.appendChild(row);
    }

    listElement.appendChild(fragment);
}


function attachPasswordHandlers(form, saveButton, clearButton, statusElement) {
    if (!form) {
        return;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const payload = readPasswordForm();
        if (!payload.current_password || !payload.new_password || !payload.confirm_password) {
            showSettingsStatus(statusElement, 'All password fields are required.', true);
            return;
        }
        if (payload.new_password !== payload.confirm_password) {
            showSettingsStatus(statusElement, 'New passwords do not match.', true);
            return;
        }
        if (payload.current_password === payload.new_password) {
            showSettingsStatus(statusElement, 'New password must be different.', true);
            return;
        }

        setButtonsDisabled(saveButton, clearButton, true);
        showSettingsStatus(statusElement, 'Updating password...', false);

        try {
            await updateSettingsPassword(payload);
            clearPasswordForm();
            showSettingsStatus(statusElement, 'Password updated.', false);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to update password.';
            showSettingsStatus(statusElement, message, true);
        } finally {
            setButtonsDisabled(saveButton, clearButton, false);
        }
    });

    clearButton.addEventListener('click', () => {
        clearPasswordForm();
        showSettingsStatus(statusElement, 'Password form cleared.', false);
    });
}


async function loadSettingsAccount(fields, profileElements, statusElement, state, saveButton, resetButton) {
    setButtonsDisabled(saveButton, resetButton, true);
    showSettingsStatus(statusElement, 'Loading account details...', false);

    try {
        const response = getSettingsFromAuth();
        if (!response) {
            throw new Error('Unable to read auth payload.');
        }

        const values = {
            username: response.username || '',
            firstName: response.first_name || '',
            lastName: response.last_name || '',
            email: response.email || '',
            phoneNumber: response.phone_number || '',
            profilePictureURL: response.profile_picture_url || ''
        };

        writeSettingsForm(fields, values);
        writeSettingsProfileTile(profileElements, values);
        state.initialValues = values;
        showSettingsStatus(statusElement, 'Account details loaded.', false);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load settings.';
        showSettingsStatus(statusElement, message, true);
    } finally {
        setButtonsDisabled(saveButton, resetButton, false);
    }
}


function readSettingsForm(fields) {
    return {
        first_name: (fields.firstName.value || '').trim(),
        last_name: (fields.lastName.value || '').trim(),
        email: (fields.email.value || '').trim(),
        phone_number: (fields.phoneNumber.value || '').trim()
    };
}


function readPasswordForm() {
    const currentPasswordInput = document.getElementById('settings-current-password');
    const newPasswordInput = document.getElementById('settings-new-password');
    const confirmPasswordInput = document.getElementById('settings-confirm-password');
    return {
        current_password: (currentPasswordInput?.value || '').trim(),
        new_password: (newPasswordInput?.value || '').trim(),
        confirm_password: (confirmPasswordInput?.value || '').trim()
    };
}


function clearPasswordForm() {
    const currentPasswordInput = document.getElementById('settings-current-password');
    const newPasswordInput = document.getElementById('settings-new-password');
    const confirmPasswordInput = document.getElementById('settings-confirm-password');
    if (currentPasswordInput) {
        currentPasswordInput.value = '';
    }
    if (newPasswordInput) {
        newPasswordInput.value = '';
    }
    if (confirmPasswordInput) {
        confirmPasswordInput.value = '';
    }
}


function writeSettingsForm(fields, values) {
    fields.username.value = values.username || '';
    fields.firstName.value = values.firstName || '';
    fields.lastName.value = values.lastName || '';
    fields.email.value = values.email || '';
    fields.phoneNumber.value = values.phoneNumber || '';
}


function writeSettingsProfileTile(profileElements, values) {
    const displayName = buildSettingsDisplayName(values.firstName, values.lastName, values.username);
    const username = (values.username || '').trim();
    const profilePictureURL = (values.profilePictureURL || '').trim();
    const initials = buildSettingsInitials(values.firstName, values.lastName, username);

    profileElements.displayName.textContent = displayName;
    profileElements.username.textContent = username ? `@${username}` : '@user';
    profileElements.fallback.textContent = initials;

    if (profilePictureURL !== '') {
        profileElements.picture.src = profilePictureURL;
        profileElements.picture.classList.remove('settings-hidden');
        profileElements.fallback.classList.add('settings-hidden');
        return;
    }

    profileElements.picture.removeAttribute('src');
    profileElements.picture.classList.add('settings-hidden');
    profileElements.fallback.classList.remove('settings-hidden');
}


function buildSettingsDisplayName(firstName, lastName, username) {
    const joinedName = `${firstName || ''} ${lastName || ''}`.trim();
    if (joinedName !== '') {
        return joinedName;
    }

    const cleanUsername = (username || '').trim();
    if (cleanUsername !== '') {
        return cleanUsername;
    }

    return 'User';
}


function buildSettingsInitials(firstName, lastName, username) {
    const first = (firstName || '').trim();
    const last = (lastName || '').trim();
    const cleanUsername = (username || '').trim();

    if (first !== '' && last !== '') {
        return `${first.slice(0, 1)}${last.slice(0, 1)}`.toUpperCase();
    }
    if (first !== '') {
        return first.slice(0, 2).toUpperCase();
    }
    if (cleanUsername !== '') {
        return cleanUsername.slice(0, 2).toUpperCase();
    }
    return 'U';
}


function showSettingsStatus(statusElement, message, isError) {
    if (!statusElement) {
        return;
    }

    if (isError) {
        statusElement.textContent = `Error: ${message}`;
    } else {
        statusElement.textContent = message;
    }
}


function setButtonsDisabled(saveButton, resetButton, isDisabled, extraButton = null) {
    if (saveButton) {
        saveButton.disabled = isDisabled;
    }
    if (resetButton) {
        resetButton.disabled = isDisabled;
    }
    if (extraButton) {
        extraButton.disabled = isDisabled;
    }
}
