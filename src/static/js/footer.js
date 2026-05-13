export function drawFooter(currentCategory, currentUser) {
    if (currentCategory === 'conversation') {
        return;
    }

    const currentUsername = normalizeUsername(currentUser?.id);
    const selectedCategory = resolveMobileFooterCategory(currentCategory, currentUsername);

    const tabs = [
        { href: '/', text: 'Feed', icon: '', category: ['feed'] },
        { href: '/search', text: 'Search', icon: '', category: ['search'] },
        { href: '/events', text: 'Events', icon: '', category: ['events'] },
        { href: '/recruit', text: 'Recruit', icon: '', category: ['recruit'] },
        { href: '/profile', text: 'Profile', icon: '', category: ['profile'] },
        { href: '/settings', text: 'Settings', icon: '', category: ['settings'] }
    ];

    const tabsHtml = tabs.map(tab => {
        let isSelected = false;
        if (Array.isArray(tab.category)) {
            isSelected = tab.category.includes(selectedCategory);
        }
        const selectedClass = isSelected ? ' selected' : '';

        return `<a href="${tab.href}" class="footer-tab${selectedClass}">
                    <div class="fa-solid">${tab.icon}</div>
                    <div class="tab-text">${tab.text}</div>
                </a>`;
    }).join('');

    const footerHtml = `<footer class="mobile-footer flex-container">${tabsHtml}</footer>`;
    document.body.insertAdjacentHTML('beforeend', footerHtml);
}

function resolveMobileFooterCategory(currentCategory, currentUsername) {
    if (currentCategory !== 'profile') {
        return currentCategory;
    }

    const profileUsername = normalizeUsername(getProfileUsernameFromPath(window.location.pathname));
    if (profileUsername === '') {
        return 'profile';
    }
    if (currentUsername !== '' && profileUsername === currentUsername) {
        return 'profile';
    }
    return 'search';
}

function getProfileUsernameFromPath(pathname) {
    const pathValue = String(pathname || '').trim();
    if (pathValue === '') {
        return '';
    }

    const segments = pathValue.split('/').filter(Boolean);
    if (segments.length === 0 || segments[0] !== 'profile') {
        return '';
    }
    if (segments.length < 2) {
        return '';
    }

    try {
        return decodeURIComponent(segments.slice(1).join('/')).trim();
    } catch (_) {
        return segments.slice(1).join('/').trim();
    }
}

function normalizeUsername(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim().toLowerCase();
}
