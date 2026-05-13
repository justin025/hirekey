export function drawHeader(currentCategory, user) {
    const allowedCategories = ['search', 'events', 'marketplace', 'profile', 'conversation'];
    if (allowedCategories.includes(currentCategory)) {
        const firstName = String(user?.firstName || '').trim();
        const lastName = String(user?.lastName || '').trim();
        const profileName = `${firstName} ${lastName}`.trim();
        const hideMobileBackButton = currentCategory === 'profile' && isOwnProfilePath(user);

        let headerCenter = '';
        if (currentCategory === 'profile') {
            headerCenter = `<div class="mobile-header-center">${profileName}</div>`;
        } else if (currentCategory === 'search' || currentCategory === 'events' || currentCategory === 'marketplace') {
            headerCenter = '<input class="mobile-search-box mobile-header-center" type="text" placeholder="Search..." />';
        } else if (currentCategory === 'conversation') {
            headerCenter = '<h2><strong>Sara Johnson</strong></h2>';
        }

        let headerRight = '';
        if (['search', 'events', 'marketplace', 'profile'].includes(currentCategory)) {
            headerRight = '<a href="/search" class="fa-solid" title="Search"></a>';
        } else if (currentCategory === 'conversation') {
            headerRight = '<a href="/" class="fa-solid" title="More Actions"></a>';
        }

        const headerHtml = `
            <div class="mobile-header">
                <div class="mobile-header-left">
                    ${hideMobileBackButton ? '' : '<a href="/" class="fa-solid" title="Go Back"></a>'}
                </div>
                ${headerCenter}
                <div class="mobile-header-right">
                    ${headerRight}
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('afterbegin', headerHtml);
    }

    const navItems = [
        { href: '/', text: 'Feed', icon: '', category: 'feed' },
        { href: '/recruit', text: 'Recruit', icon: '', category: ['recruit'] },
        { href: '/settings', text: 'Settings', icon: '', category: 'settings' },
        { href: `/profile/${user.id || ''}`, text: 'Profile', icon: '', category: 'profile' }
    ];

    const navLinksHtml = navItems.map(item => {
        let isSelected = false;
        if (Array.isArray(item.category)) {
            isSelected = item.category.includes(currentCategory);
        } else if (typeof item.category === 'string') {
            isSelected = item.category === currentCategory;
        }
        const selectedClass = isSelected ? ' selected' : '';
        return `<li><a href="${item.href}" class="nav-link${selectedClass}">${item.text}</a></li>`;
    }).join('');

    const desktopNavHtml = `
        <nav class="top-nav">
            <div class="nav-content">
                <form class="search-container" action="/search" method="GET">
                    <input type="text" class="search-box" name="q" placeholder="Search..." autocomplete="off">
                </form>
                <ul class="nav-links">
                    ${navLinksHtml}
                </ul>
            </div>
        </nav>
    `;

    document.body.insertAdjacentHTML('afterbegin', desktopNavHtml);

    const searchInput = document.querySelector('.top-nav .search-box');
    if (searchInput) {
        const searchQuery = new URLSearchParams(window.location.search).get('q') || '';
        searchInput.value = searchQuery;
    }
}


function isOwnProfilePath(user) {
    const currentUsername = normalizeUsername(user?.id);
    if (currentUsername === '') {
        return false;
    }

    const profileUsername = normalizeUsername(getProfileUsernameFromPath(window.location.pathname));
    if (profileUsername === '') {
        return true;
    }

    return profileUsername === currentUsername;
}


function getProfileUsernameFromPath(pathname) {
    const pathValue = String(pathname || '').trim();
    if (pathValue === '') {
        return '';
    }

    const segments = pathValue.split('/').filter(Boolean);
    if (segments.length === 0 || segments[0].toLowerCase() !== 'profile') {
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
