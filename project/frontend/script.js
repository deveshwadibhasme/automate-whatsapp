

let currentSession = null;
let sessionStatusInterval = null;
let availableContacts = [];

// DOM elements
const senderNameInput = document.getElementById('senderName');
const startSessionBtn = document.getElementById('startSessionBtn');
const startSessionText = document.getElementById('startSessionText');
const startSessionLoader = document.getElementById('startSessionLoader');
const sessionStatus = document.getElementById('sessionStatus');
const statusIcon = document.getElementById('statusIcon');
const statusText = document.getElementById('statusText');

const qrContainer = document.getElementById('qrContainer');
const qrPlaceholder = document.getElementById('qrPlaceholder');
const qrCodeImg = document.getElementById('qrCodeImg');
const qrLoader = document.getElementById('qrLoader');
const sessionReady = document.getElementById('sessionReady');

const recipientsInput = document.getElementById('recipients');
const messageTextArea = document.getElementById('messageText');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const sendMessageText = document.getElementById('sendMessageText');
const sendMessageLoader = document.getElementById('sendMessageLoader');

const showContactsBtn = document.getElementById('showContactsBtn');
const contactsList = document.getElementById('contactsList');
const contactsGrid = document.getElementById('contactsGrid');
const resultsSection = document.getElementById('resultsSection');
const resultsContent = document.getElementById('resultsContent');
const statusMessages = document.getElementById('statusMessages');

// API base URL (fallback to server port if opened from file or another port)
const API_BASE = (() => {
    const origin = window.location.origin || '';
    if (!origin.startsWith('http')) return 'http://localhost:3001';
    if (origin.includes('localhost:3001') || origin.includes('127.0.0.1:3001')) return origin;
    // Force backend port during dev
    return 'http://localhost:3001';
})();

// Utility functions
function showStatusMessage(message, type = 'info', duration = 5000) {
    const statusDiv = document.createElement('div');
    statusDiv.className = `p-4 rounded-lg shadow-lg border transform transition-all duration-300 translate-x-full`;

    const colors = {
        success: 'bg-green-50 text-green-800 border-green-200',
        error: 'bg-red-50 text-red-800 border-red-200',
        info: 'bg-blue-50 text-blue-800 border-blue-200',
        warning: 'bg-yellow-50 text-yellow-800 border-yellow-200'
    };

    statusDiv.className += ` ${colors[type] || colors.info}`;
    statusDiv.textContent = message;

    statusMessages.appendChild(statusDiv);

    // Animate in
    setTimeout(() => {
        statusDiv.classList.remove('translate-x-full');
    }, 100);

    // Auto remove
    setTimeout(() => {
        statusDiv.classList.add('translate-x-full');
        setTimeout(() => {
            if (statusDiv.parentNode) {
                statusDiv.parentNode.removeChild(statusDiv);
            }
        }, 300);
    }, duration);
}

function setButtonLoading(button, textElement, loaderElement, isLoading) {
    if (isLoading) {
        button.disabled = true;
        loaderElement.classList.remove('hidden');
    } else {
        button.disabled = false;
        loaderElement.classList.add('hidden');
    }
}

function showSessionStatus(status, message, type = 'info') {
    sessionStatus.classList.remove('hidden');

    const colors = {
        success: 'bg-green-50 text-green-800',
        error: 'bg-red-50 text-red-800',
        info: 'bg-blue-50 text-blue-800',
        warning: 'bg-yellow-50 text-yellow-800'
    };

    const iconColors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500',
        warning: 'bg-yellow-500'
    };

    sessionStatus.className = `p-4 rounded-lg ${colors[type] || colors.info}`;
    statusIcon.className = `w-3 h-3 rounded-full mr-2 ${iconColors[type] || iconColors.info}`;
    statusText.textContent = message;
}

// Load available contacts
async function loadContacts() {
    try {
        const response = await fetch(`${API_BASE}/api/contacts`);
        const data = await response.json();

        if (data.success) {
            availableContacts = data.contacts;
            renderContactsGrid();
        }
    } catch (error) {
        console.error('Error loading contacts:', error);
    }
}

function renderContactsGrid() {
    contactsGrid.innerHTML = '';

    availableContacts.forEach(contact => {
        const contactBtn = document.createElement('button');
        contactBtn.className = 'text-xs bg-white border border-gray-300 hover:border-blue-500 hover:text-blue-600 px-2 py-1 rounded transition-colors';
        contactBtn.textContent = contact.name;
        contactBtn.onclick = () => addContactToRecipients(contact.name);
        contactsGrid.appendChild(contactBtn);
    });
}

function addContactToRecipients(contactName) {
    const currentValue = recipientsInput.value.trim();
    const recipients = currentValue ? currentValue.split(',').map(name => name.trim()) : [];

    if (!recipients.includes(contactName)) {
        recipients.push(contactName);
        recipientsInput.value = recipients.join(', ');
    }
}

// Session management
async function startSession() {
    const senderName = senderNameInput.value.trim();

    if (!senderName) {
        showStatusMessage('Please enter a session name', 'error');
        return;
    }

    setButtonLoading(startSessionBtn, startSessionText, startSessionLoader, true);
    showQrLoader();

    try {
        const response = await fetch(`${API_BASE}/api/start-session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ senderName })
        });

        const data = await response.json();

        if (data.success) {
            currentSession = senderName;

            if (data.sessionReady) {
                showSessionReady();
                showSessionStatus('ready', 'Session is connected and ready', 'success');
                showStatusMessage('Session is ready to send messages!', 'success');
            } else if (data.qrCode) {
                showQrCode(data.qrCode);
                showSessionStatus('qr-ready', 'QR Code generated - please scan', 'info');
                showStatusMessage('QR Code generated! Please scan with WhatsApp', 'info');
                startSessionStatusPolling();
            } else {
                // If no QR code yet, start polling immediately
                showSessionStatus('starting', 'Generating QR Code...', 'info');
                showStatusMessage('Generating QR Code, please wait...', 'info');
                startSessionStatusPolling();
            }
        } else {
            throw new Error(data.error || 'Failed to start session');
        }
    } catch (error) {
        console.error('Error starting session:', error);
        showStatusMessage('Failed to start session: ' + error.message, 'error');
        showSessionStatus('error', 'Failed to start session', 'error');
        showQrPlaceholder();
    } finally {
        setButtonLoading(startSessionBtn, startSessionText, startSessionLoader, false);
    }
}

// Add a function to get QR code if not received initially
async function getQrCode() {
    if (!currentSession) return;

    try {
        const response = await fetch(`${API_BASE}/api/get-qr/${currentSession}`);
        const data = await response.json();

        if (data.success && data.qrCode) {
            showQrCode(data.qrCode);
            showSessionStatus('qr-ready', 'QR Code ready - please scan', 'info');
        }
    } catch (error) {
        console.error('Error getting QR code:', error);
    }
}

function startSessionStatusPolling() {
    if (sessionStatusInterval) {
        clearInterval(sessionStatusInterval);
    }

    sessionStatusInterval = setInterval(async () => {
        if (!currentSession) return;

        try {
            const response = await fetch(`${API_BASE}/api/session-status/${currentSession}`);
            const data = await response.json();

            if (data.success) {
                if (data.sessionReady) {
                    showSessionReady();
                    showSessionStatus('ready', 'Session connected and ready', 'success');
                    showStatusMessage('WhatsApp session connected successfully!', 'success');
                    clearInterval(sessionStatusInterval);
                } else if (data.qrCode && qrCodeImg.classList.contains('hidden')) {
                    // Show QR code if we didn't have it before
                    showQrCode(data.qrCode);
                    showSessionStatus('qr-ready', 'QR Code ready - please scan', 'info');
                } else if (data.status === 'not-logged') {
                    showSessionStatus('not-logged', 'Please scan the QR code', 'warning');
                }
            }
        } catch (error) {
            console.error('Error polling session status:', error);
        }
    }, 3000);
}

// QR Code display functions
function showQrPlaceholder() {
    qrPlaceholder.classList.remove('hidden');
    qrCodeImg.classList.add('hidden');
    qrLoader.classList.add('hidden');
    sessionReady.classList.add('hidden');
}

function showQrLoader() {
    qrPlaceholder.classList.add('hidden');
    qrCodeImg.classList.add('hidden');
    qrLoader.classList.remove('hidden');
    sessionReady.classList.add('hidden');
}

function showQrCode(qrCodeData) {
    qrPlaceholder.classList.add('hidden');
    qrLoader.classList.add('hidden');
    sessionReady.classList.add('hidden');
    qrCodeImg.src = qrCodeData;
    qrCodeImg.classList.remove('hidden');
}

function showSessionReady() {
    qrPlaceholder.classList.add('hidden');
    qrCodeImg.classList.add('hidden');
    qrLoader.classList.add('hidden');
    sessionReady.classList.remove('hidden');
}

// Message sending
async function sendMessages() {
    if (!currentSession) {
        showStatusMessage('Please start a session first', 'error');
        return;
    }

    const recipients = recipientsInput.value.trim();
    const message = messageTextArea.value.trim();

    if (!recipients || !message) {
        showStatusMessage('Please enter recipients and message', 'error');
        return;
    }

    setButtonLoading(sendMessageBtn, sendMessageText, sendMessageLoader, true);

    try {
        const response = await fetch(`${API_BASE}/api/send-message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                senderName: currentSession,
                names: recipients,
                message: message
            })
        });

        const data = await response.json();

        if (data.success) {
            showResults(data.results, data.summary);
            showStatusMessage(`Messages sent: ${data.summary.sent}/${data.summary.total}`, 'success');
        } else {
            throw new Error(data.error || 'Failed to send messages');
        }
    } catch (error) {
        console.error('Error sending messages:', error);
        showStatusMessage('Failed to send messages: ' + error.message, 'error');
    } finally {
        setButtonLoading(sendMessageBtn, sendMessageText, sendMessageLoader, false);
    }
}

function showResults(results, summary) {
    resultsSection.classList.remove('hidden');

    const html = `
        <div class="mb-6 p-4 bg-gray-50 rounded-lg border">
            <h3 class="font-medium text-gray-900 mb-2">Summary</h3>
            <div class="grid grid-cols-3 gap-4 text-center">
                <div>
                    <div class="text-2xl font-bold text-gray-900">${summary.total}</div>
                    <div class="text-sm text-gray-500">Total</div>
                </div>
                <div>
                    <div class="text-2xl font-bold text-green-600">${summary.sent}</div>
                    <div class="text-sm text-gray-500">Sent</div>
                </div>
                <div>
                    <div class="text-2xl font-bold text-red-600">${summary.failed}</div>
                    <div class="text-sm text-gray-500">Failed</div>
                </div>
            </div>
        </div>
        
        <div class="space-y-3">
            <h3 class="font-medium text-gray-900">Detailed Results</h3>
            ${results.map(result => `
                <div class="flex items-center justify-between p-3 border rounded-lg ${result.status === 'sent' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}">
                    <div>
                        <div class="font-medium text-gray-900">${result.name}</div>
                        ${result.number ? `<div class="text-sm text-gray-500">${result.number}</div>` : ''}
                    </div>
                    <div class="text-right">
                        <div class="text-sm font-medium ${result.status === 'sent' ? 'text-green-600' : 'text-red-600'}">
                            ${result.status === 'sent' ? 'Sent' : 'Failed'}
                        </div>
                        ${result.error ? `<div class="text-xs text-red-500">${result.error}</div>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    resultsContent.innerHTML = html;

    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// Event listeners
startSessionBtn.addEventListener('click', startSession);
sendMessageBtn.addEventListener('click', sendMessages);

showContactsBtn.addEventListener('click', () => {
    contactsList.classList.toggle('hidden');
    showContactsBtn.textContent = contactsList.classList.contains('hidden')
        ? 'Show Available Contacts'
        : 'Hide Available Contacts';
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
        if (document.activeElement === messageTextArea) {
            sendMessages();
        }
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadContacts();
    showQrPlaceholder();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (sessionStatusInterval) {
        clearInterval(sessionStatusInterval);
    }
});