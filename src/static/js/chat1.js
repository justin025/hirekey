export function drawChat() {
    // Check if main-container exists, if not create it
    let mainContainer = document.querySelector('.main-container');
    if (!mainContainer) {
        mainContainer = document.createElement('div');
        mainContainer.className = 'main-container';
        document.body.appendChild(mainContainer);
    }



// Sample data
const conversations = [
    {
        id: 1,
        name: "Alice Johnson",
        avatar: "https://picsum.photos/seed/alice/100/100",
        lastMessage: "Hey! How are you doing?",
        time: "2 min ago",
        unread: 2,
        online: true,
        messages: [
            { text: "Hi there!", sent: false, time: "10:00 AM" },
            { text: "Hello Alice! Good to hear from you", sent: true, time: "10:02 AM" },
            { text: "How have you been?", sent: true, time: "10:02 AM" },
            { text: "I've been great! Just got back from vacation", sent: false, time: "10:05 AM" },
            { text: "Hey! How are you doing?", sent: false, time: "10:06 AM" }
        ]
    },
    {
        id: 2,
        name: "Bob Smith",
        avatar: "https://picsum.photos/seed/bob/100/100",
        lastMessage: "Can we schedule a meeting?",
        time: "15 min ago",
        unread: 0,
        online: false,
        messages: [
            { text: "Hi Bob", sent: true, time: "9:30 AM" },
            { text: "Good morning!", sent: false, time: "9:32 AM" },
            { text: "Can we schedule a meeting?", sent: false, time: "9:35 AM" }
        ]
    },
    {
        id: 3,
        name: "Carol Davis",
        avatar: "https://picsum.photos/seed/carol/100/100",
        lastMessage: "Thanks for your help!",
        time: "1 hour ago",
        unread: 1,
        online: true,
        messages: [
            { text: "I need some help with the project", sent: false, time: "8:00 AM" },
            { text: "Sure, what do you need?", sent: true, time: "8:15 AM" },
            { text: "Thanks for your help!", sent: false, time: "8:45 AM" }
        ]
    },
    {
        id: 4,
        name: "David Wilson",
        avatar: "https://picsum.photos/seed/david/100/100",
        lastMessage: "See you tomorrow!",
        time: "Yesterday",
        unread: 0,
        online: false,
        messages: [
            { text: "Are we still on for tomorrow?", sent: true, time: "Yesterday" },
            { text: "Yes, absolutely!", sent: false, time: "Yesterday" },
            { text: "See you tomorrow!", sent: false, time: "Yesterday" }
        ]
    },
    {
        id: 5,
        name: "Emma Thompson",
        avatar: "https://picsum.photos/seed/emma/100/100",
        lastMessage: "Great idea! Let's do it",
        time: "2 days ago",
        unread: 0,
        online: true,
        messages: [
            { text: "What do you think about the new proposal?", sent: true, time: "2 days ago" },
            { text: "Great idea! Let's do it", sent: false, time: "2 days ago" }
        ]
    }
];

let currentConversation = null;
let typingTimeout = null;

// Set the HTML content
mainContainer.innerHTML = `
<style>
    :root {
        --primary-color: #0084ff;
        --primary-dark: #0066cc;
        --bg-primary: #ffffff;
        --bg-secondary: #f0f2f5;
        --bg-chat: #e5ddd5;
        --text-primary: #111b21;
        --text-secondary: #667781;
        --border-color: #e9edef;
        --shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
        --shadow-hover: 0 14px 28px rgba(0,0,0,0.25), 0 10px 10px rgba(0,0,0,0.22);
        --online-color: #4fc3f7;
        --typing-color: #0084ff;
    }

    [data-theme="dark"] {
        --bg-primary: #1a1d21;
        --bg-secondary: #202327;
        --bg-chat: #0b141a;
        --text-primary: #e9edef;
        --text-secondary: #8696a0;
        --border-color: #2a2f33;
    }

    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }

    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        background-color: var(--bg-secondary);
        color: var(--text-primary);
        height: 100vh;
        overflow: hidden;
    }

    .app-container {
        display: grid;
        grid-template-columns: 350px 1fr;
        height: 100vh;
        position: relative;
    }

    .sidebar {
        background-color: var(--bg-primary);
        border-right: 1px solid var(--border-color);
        display: flex;
        flex-direction: column;
        transition: transform 0.3s ease;
    }

    .sidebar-header {
        padding: 1rem;
        background-color: var(--primary-color);
        color: white;
        display: flex;
        align-items: center;
        gap: 1rem;
        box-shadow: var(--shadow);
    }

    .user-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        cursor: pointer;
        transition: transform 0.2s;
    }

    .user-avatar:hover {
        transform: scale(1.05);
    }

    .search-container {
        padding: 0.75rem;
        background-color: var(--bg-primary);
        position: relative;
    }

    .search-box {
        width: 100%;
        padding: 0.75rem 2.5rem 0.75rem 1rem;
        border: none;
        border-radius: 1.5rem;
        background-color: var(--bg-secondary);
        color: var(--text-primary);
        font-size: 0.9rem;
        outline: none;
        transition: background-color 0.2s;
    }

    .search-box:focus {
        background-color: var(--border-color);
    }

    .search-icon {
        position: absolute;
        right: 1.5rem;
        top: 50%;
        transform: translateY(-50%);
        color: var(--text-secondary);
    }

    .conversation-list {
        flex: 1;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: var(--border-color) transparent;
    }

    .conversation-list::-webkit-scrollbar {
        width: 6px;
    }

    .conversation-list::-webkit-scrollbar-track {
        background: transparent;
    }

    .conversation-list::-webkit-scrollbar-thumb {
        background-color: var(--border-color);
        border-radius: 3px;
    }

    .conversation-item {
        display: flex;
        align-items: center;
        padding: 1rem;
        cursor: pointer;
        transition: background-color 0.2s;
        position: relative;
    }

    .conversation-item:hover {
        background-color: var(--bg-secondary);
    }

    .conversation-item.active {
        background-color: var(--bg-secondary);
    }

    .conversation-avatar {
        width: 50px;
        height: 50px;
        border-radius: 50%;
        margin-right: 1rem;
        position: relative;
        flex-shrink: 0;
    }

    .conversation-avatar img {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: cover;
    }

    .online-indicator {
        position: absolute;
        bottom: 2px;
        right: 2px;
        width: 12px;
        height: 12px;
        background-color: var(--online-color);
        border: 2px solid var(--bg-primary);
        border-radius: 50%;
    }

    .conversation-details {
        flex: 1;
        min-width: 0;
    }

    .conversation-name {
        font-weight: 600;
        margin-bottom: 0.25rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .conversation-message {
        color: var(--text-secondary);
        font-size: 0.9rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .conversation-time {
        color: var(--text-secondary);
        font-size: 0.75rem;
    }

    .unread-badge {
        background-color: var(--primary-color);
        color: white;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.75rem;
        font-weight: bold;
    }

    .chat-area {
        display: flex;
        flex-direction: column;
        background-color: var(--bg-chat);
        position: relative;
    }

    .chat-header {
        background-color: var(--bg-primary);
        padding: 1rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-shadow: var(--shadow);
        z-index: 10;
    }

    .chat-header-info {
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .back-button {
        display: none;
        background: none;
        border: none;
        color: var(--text-primary);
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0.25rem;
    }

    .chat-actions {
        display: flex;
        gap: 1rem;
    }

    .action-button {
        background: none;
        border: none;
        color: var(--text-primary);
        font-size: 1.25rem;
        cursor: pointer;
        padding: 0.5rem;
        border-radius: 50%;
        transition: background-color 0.2s;
    }

    .action-button:hover {
        background-color: var(--bg-secondary);
    }

    .messages-container {
        flex: 1;
        overflow-y: auto;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23e5ddd5" opacity="0.05"/><path d="M0 0L100 100M100 0L0 100" stroke="%23000" stroke-width="0.5" opacity="0.03"/></svg>');
    }

    .message {
        display: flex;
        max-width: 70%;
        animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .message.sent {
        align-self: flex-end;
        flex-direction: row-reverse;
    }

    .message.received {
        align-self: flex-start;
    }

    .message-content {
        background-color: var(--bg-primary);
        padding: 0.75rem 1rem;
        border-radius: 0.75rem;
        box-shadow: 0 1px 0.5px rgba(0,0,0,0.13);
        position: relative;
    }

    .message.sent .message-content {
        background-color: #dcf8c6;
    }

    [data-theme="dark"] .message.sent .message-content {
        background-color: #005c4b;
    }

    .message-text {
        word-wrap: break-word;
        line-height: 1.4;
    }

    .message-info {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        margin-top: 0.25rem;
        font-size: 0.75rem;
        color: var(--text-secondary);
    }

    .message.sent .message-info {
        justify-content: flex-end;
    }

    .message-status {
        color: #4fc3f7;
    }

    .typing-indicator {
        display: none;
        align-items: center;
        gap: 0.25rem;
        padding: 0.75rem 1rem;
        background-color: var(--bg-primary);
        border-radius: 0.75rem;
        box-shadow: 0 1px 0.5px rgba(0,0,0,0.13);
        max-width: 100px;
    }

    .typing-indicator.active {
        display: flex;
    }

    .typing-dot {
        width: 8px;
        height: 8px;
        background-color: var(--text-secondary);
        border-radius: 50%;
        animation: typing 1.4s infinite;
    }

    .typing-dot:nth-child(2) {
        animation-delay: 0.2s;
    }

    .typing-dot:nth-child(3) {
        animation-delay: 0.4s;
    }

    @keyframes typing {
        0%, 60%, 100% {
            transform: translateY(0);
        }
        30% {
            transform: translateY(-10px);
        }
    }

    .message-input-container {
        background-color: var(--bg-primary);
        padding: 1rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        box-shadow: 0 -1px 3px rgba(0,0,0,0.12);
    }

    .input-action-button {
        background: none;
        border: none;
        color: var(--text-secondary);
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0.5rem;
        border-radius: 50%;
        transition: all 0.2s;
    }

    .input-action-button:hover {
        color: var(--primary-color);
        background-color: var(--bg-secondary);
    }

    .message-input {
        flex: 1;
        padding: 0.75rem 1rem;
        border: none;
        border-radius: 2rem;
        background-color: var(--bg-secondary);
        color: var(--text-primary);
        font-size: 1rem;
        outline: none;
        transition: background-color 0.2s;
    }

    .message-input:focus {
        background-color: var(--border-color);
    }

    .send-button {
        background-color: var(--primary-color);
        color: white;
        border: none;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
    }

    .send-button:hover {
        background-color: var(--primary-dark);
        transform: scale(1.05);
    }

    .send-button:active {
        transform: scale(0.95);
    }

    .theme-toggle {
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background-color: var(--primary-color);
        color: white;
        border: none;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: var(--shadow);
        transition: all 0.3s;
        z-index: 1000;
    }

    .theme-toggle:hover {
        transform: scale(1.1);
        box-shadow: var(--shadow-hover);
    }

    @media (max-width: 768px) {
        .app-container {
            grid-template-columns: 1fr;
        }

        .sidebar {
            position: absolute;
            left: 0;
            top: 0;
            height: 100%;
            width: 100%;
            z-index: 100;
            transform: translateX(0);
        }

        .sidebar.hidden {
            transform: translateX(-100%);
        }

        .chat-area {
            display: none;
        }

        .chat-area.active {
            display: flex;
        }

        .back-button {
            display: block;
        }

        .theme-toggle {
            bottom: 1rem;
            right: 1rem;
        }

        .message {
            max-width: 85%;
        }
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--text-secondary);
        text-align: center;
        padding: 2rem;
    }

    .empty-state-icon {
        font-size: 4rem;
        margin-bottom: 1rem;
        opacity: 0.5;
    }

    .empty-state-text {
        font-size: 1.25rem;
        margin-bottom: 0.5rem;
    }

    .empty-state-subtext {
        font-size: 0.9rem;
    }
</style>

<div class="app-container">
    <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
            <div class="user-avatar">U</div>
            <h2 style="flex: 1;">Messages</h2>
            <button class="action-button" onclick="createNewChat()">✏️</button>
        </div>
        
        <div class="search-container">
            <input type="text" class="search-box" placeholder="Search conversations..." onkeyup="searchConversations(this.value)">
            <span class="search-icon">🔍</span>
        </div>
        
        <div class="conversation-list" id="conversationList"></div>
    </aside>

    <main class="chat-area" id="chatArea">
        <div class="empty-state" id="emptyState">
            <div class="empty-state-icon">💬</div>
            <div class="empty-state-text">Welcome to Chat Messenger</div>
            <div class="empty-state-subtext">Select a conversation to start messaging</div>
        </div>
        
        <div id="chatContent" style="display: none; height: 100%; flex-direction: column;">
            <div class="chat-header">
                <button class="back-button" onclick="backToList()">←</button>
                <div class="chat-header-info">
                    <div class="conversation-avatar">
                        <img id="chatAvatar" src="" alt="">
                        <div class="online-indicator"></div>
                    </div>
                    <div>
                        <div id="chatName" style="font-weight: 600;"></div>
                        <div id="chatStatus" style="font-size: 0.85rem; color: var(--text-secondary);">Online</div>
                    </div>
                </div>
                <div class="chat-actions">
                    <button class="action-button">📞</button>
                    <button class="action-button">📹</button>
                    <button class="action-button">ℹ️</button>
                </div>
            </div>
            
            <div class="messages-container" id="messagesContainer"></div>
            
            <div class="message-input-container">
                <button class="input-action-button">😊</button>
                <button class="input-action-button">📎</button>
                <input type="text" class="message-input" id="messageInput" placeholder="Type a message..." onkeypress="handleKeyPress(event)">
                <button class="send-button" onclick="sendMessage()">➤</button>
            </div>
        </div>
    </main>
</div>

<button class="theme-toggle" onclick="toggleTheme()">🌙</button>
`;

// All JavaScript functions
function init() {
    renderConversations();
    checkMobileView();
}

function renderConversations(searchTerm = '') {
    const listContainer = document.getElementById('conversationList');
    const filteredConversations = conversations.filter(conv => 
        conv.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conv.lastMessage.toLowerCase().includes(searchTerm.toLowerCase())
    );

    listContainer.innerHTML = filteredConversations.map(conv => `
        <div class="conversation-item ${currentConversation?.id === conv.id ? 'active' : ''}" onclick="openConversation(${conv.id})">
            <div class="conversation-avatar">
                <img src="${conv.avatar}" alt="${conv.name}">
                ${conv.online ? '<div class="online-indicator"></div>' : ''}
            </div>
            <div class="conversation-details">
                <div class="conversation-name">
                    <span>${conv.name}</span>
                    <span class="conversation-time">${conv.time}</span>
                </div>
                <div class="conversation-message">${conv.lastMessage}</div>
            </div>
            ${conv.unread > 0 ? `<div class="unread-badge">${conv.unread}</div>` : ''}
        </div>
    `).join('');
}

function openConversation(conversationId) {
    currentConversation = conversations.find(c => c.id === conversationId);
    
    if (!currentConversation) return;

    document.getElementById('chatName').textContent = currentConversation.name;
    document.getElementById('chatAvatar').src = currentConversation.avatar;
    document.getElementById('chatStatus').textContent = currentConversation.online ? 'Online' : 'Offline';
    
    currentConversation.unread = 0;
    renderConversations();

    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('chatContent').style.display = 'flex';
    document.getElementById('chatContent').style.height = '100%';
    document.getElementById('chatContent').style.flexDirection = 'column';

    renderMessages();

    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.add('hidden');
        document.getElementById('chatArea').classList.add('active');
    }

    document.getElementById('messageInput').focus();
}

function renderMessages() {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';

    currentConversation.messages.forEach((msg, index) => {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${msg.sent ? 'sent' : 'received'}`;
        messageEl.innerHTML = `
            <div class="message-content">
                <div class="message-text">${msg.text}</div>
                <div class="message-info">
                    <span>${msg.time}</span>
                    ${msg.sent ? '<span class="message-status">✓✓</span>' : ''}
                </div>
            </div>
        `;
        container.appendChild(messageEl);
    });

    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    typingIndicator.id = 'typingIndicator';
    typingIndicator.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    `;
    container.appendChild(typingIndicator);

    container.scrollTop = container.scrollHeight;
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text || !currentConversation) return;

    const newMessage = {
        text: text,
        sent: true,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    currentConversation.messages.push(newMessage);
    currentConversation.lastMessage = text;
    currentConversation.time = 'Just now';

    input.value = '';

    renderMessages();
    renderConversations();

    simulateResponse();
}

function simulateResponse() {
    const typingIndicator = document.getElementById('typingIndicator');
    typingIndicator.classList.add('active');

    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;

    setTimeout(() => {
        typingIndicator.classList.remove('active');

        const responses = [
            "That's interesting!",
            "I totally agree with you.",
            "Let me think about that...",
            "Great point!",
            "Thanks for sharing!",
            "How does that make you feel?",
            "I see what you mean.",
            "That's a good question!"
        ];

        const responseText = responses[Math.floor(Math.random() * responses.length)];
        
        const response = {
            text: responseText,
            sent: false,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        currentConversation.messages.push(response);
        currentConversation.lastMessage = responseText;
        currentConversation.time = 'Just now';

        renderMessages();
        renderConversations();

        if (document.hidden || !currentConversation) {
            showNotification(currentConversation.name, responseText);
        }
    }, 2000);
}

function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function searchConversations(searchTerm) {
    renderConversations(searchTerm);
}

function backToList() {
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('chatArea').classList.remove('active');
}

function createNewChat() {
    const name = prompt("Enter contact name:");
    if (name) {
        const newConv = {
            id: conversations.length + 1,
            name: name,
            avatar: `https://picsum.photos/seed/${name}/100/100`,
            lastMessage: "Start a conversation",
            time: "Now",
            unread: 0,
            online: Math.random() > 0.5,
            messages: []
        };
        conversations.unshift(newConv);
        renderConversations();
        openConversation(newConv.id);
    }
}

function toggleTheme() {
    const body = document.body;
    const themeToggle = document.querySelector('.theme-toggle');
    
    if (body.getAttribute('data-theme') === 'dark') {
        body.removeAttribute('data-theme');
        themeToggle.textContent = '🌙';
        localStorage.setItem('theme', 'light');
    } else {
        body.setAttribute('data-theme', 'dark');
        themeToggle.textContent = '☀️';
        localStorage.setItem('theme', 'dark');
    }
}

function checkMobileView() {
    if (window.innerWidth <= 768 && currentConversation) {
        document.getElementById('sidebar').classList.add('hidden');
        document.getElementById('chatArea').classList.add('active');
    }
}

function showNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: 'https://picsum.photos/seed/icon/100/100'
        });
    }
}

// Initialize the app
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// Load saved theme
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
    document.body.setAttribute('data-theme', 'dark');
    document.querySelector('.theme-toggle').textContent = '☀️';
}

// Initialize on load
init();

// Event listeners
window.addEventListener('resize', checkMobileView);

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentConversation) {
        currentConversation.unread = 0;
        renderConversations();
    }
});



}

// Call the function to create the app
}
