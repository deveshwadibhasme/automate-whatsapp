document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const authSection = document.getElementById('authSection');
    const messageSection = document.getElementById('messageSection');
    const qrSection = document.getElementById('qrSection');
    const qrCode = document.getElementById('qrCode');
    const authStatus = document.getElementById('authStatus');
    const loadingDiv = document.getElementById('loading');
    const loadingText = document.getElementById('loadingText');

    const senderNameInput = document.getElementById('senderName');
    const authBtn = document.getElementById('authBtn');
    const currentSender = document.getElementById('currentSender');
    const logoutBtn = document.getElementById('logoutBtn');

    const messageForm = document.getElementById('messageForm');
    const namesInput = document.getElementById('names');
    const messageInput = document.getElementById('message');
    const sendBtn = document.getElementById('sendBtn');
    const resultsDiv = document.getElementById('results');
    const resultsList = document.getElementById('resultsList');

    let currentSenderName = '';
    let qrCheckInterval = null;
    let sessionCheckInterval = null;
    const savedQR = localStorage.getItem('lastQR');
    if (savedQR) {
        const qrData = JSON.parse(savedQR);
        // Only show if less than 2 minutes old
        if (Date.now() - qrData.timestamp < 120000) {
            currentSenderName = qrData.sender;
            qrCode.innerHTML = `<img src="${qrData.code}" alt="QR Code">`;
            qrSection.classList.remove('hidden');
            startQRCheck(currentSenderName);
        } else {
            localStorage.removeItem('lastQR');
        }
    }

    messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();

        // Disable submit button to prevent multiple submissions
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';

        sendMessages().finally(() => {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send Messages';
        });

        return false;
    });

    // Add this to prevent form submission on Enter key in inputs
    document.querySelectorAll('#names, #message').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessages();
            }
        });
    });

    

    // Check if there's a saved session
    const savedSender = localStorage.getItem('currentSender');
    if (savedSender) {
        checkExistingSession(savedSender);
    }

    // Authentication button click
    authBtn.addEventListener('click', async () => {
        const senderName = senderNameInput.value.trim();

        if (!senderName) {
            alert('Please enter your name');
            return;
        }

        authBtn.disabled = true;
        showAuthStatus('Initializing WhatsApp session...', 'info');

        try {
            const response = await fetch('http://localhost:3000/init-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ senderName })
            });

            const data = await response.json();

            if (response.ok) {
                if (data.status === 'already_authenticated') {
                    showAuthSuccess(senderName);
                } else if (data.status === 'initializing') {
                    // Start checking for QR code
                    setTimeout(() => startQRCheck(senderName), 2000);
                }
            } else {
                showAuthStatus('Error: ' + data.error, 'error');
            }
        } catch (error) {
            showAuthStatus('Error initializing session: ' + error.message, 'error');
        } finally {
            authBtn.disabled = false;
        }
    });

    // Check existing session
    async function checkExistingSession(senderName) {
        try {
            const response = await fetch(`http://localhost:3000/session-status/${senderName}`);
            const data = await response.json();

            if (data.status === 'connected' && data.authenticated) {
                showAuthSuccess(senderName);
            } else {
                localStorage.removeItem('currentSender');
            }
        } catch (error) {
            console.error('Error checking session:', error);
            localStorage.removeItem('currentSender');
        }
    }

    // Start checking for QR code
    // Replace the existing startQRCheck function with this version
    function startQRCheck(senderName) {
        qrSection.classList.remove('hidden');
        showAuthStatus('Generating QR code...', 'info');

        // Store the last seen QR code to prevent flickering
        let lastQR = '';

        // First, check immediately
        checkQRCode();

        // Then set up interval
        qrCheckInterval = setInterval(checkQRCode, 2000);

        async function checkQRCode() {
            try {
                const response = await fetch(`http://localhost:3000/qr-code/${senderName}`);
                if (!response.ok) throw new Error('Network error');

                const data = await response.json();

                // Only update if we have a new QR code
                if (data.qrCode && data.qrCode !== lastQR) {
                    lastQR = data.qrCode;
                    qrCode.innerHTML = `<img src="${data.qrCode}" alt="QR Code">`;
                    showAuthStatus('Scan this QR code with WhatsApp', 'info');
                }

                // Handle connection states
                if (data.status === 'connected') {
                    clearInterval(qrCheckInterval);
                    showAuthSuccess(senderName);
                } else if (data.status === 'failed' || data.status === 'error') {
                    clearInterval(qrCheckInterval);
                    showAuthStatus('QR generation failed. Please try again.', 'error');
                }
            } catch (error) {
                console.error('QR check error:', error);
                // Don't show error immediately to prevent flickering
            }
        }
    }

    function showQRCode(qrData) {
    // Store in local storage
    localStorage.setItem('lastQR', JSON.stringify({
        code: qrData.qrCode,
        sender: currentSenderName,
        timestamp: Date.now()
    }));
    
    // Display the QR code
    qrCode.innerHTML = `<img src="${qrData.qrCode}" alt="QR Code">`;
    qrSection.classList.remove('hidden');
}

    // Show authentication success
    function showAuthSuccess(senderName) {
        currentSenderName = senderName;
        localStorage.setItem('currentSender', senderName);

        showAuthStatus('Authentication successful!', 'success');
        currentSender.textContent = senderName;

        setTimeout(() => {
            authSection.classList.add('hidden');
            messageSection.classList.remove('hidden');
            authStatus.classList.add('hidden');
        }, 1500);

        // Start session monitoring
        startSessionMonitoring();
    }

    // Monitor session status
    function startSessionMonitoring() {
        sessionCheckInterval = setInterval(async () => {
            try {
                const response = await fetch(`http://localhost:3000/session-status/${currentSenderName}`);
                const data = await response.json();

                if (data.status !== 'connected' || !data.authenticated) {
                    clearInterval(sessionCheckInterval);
                    alert('WhatsApp session disconnected. Please re-authenticate.');
                    resetToAuth();
                }
            } catch (error) {
                console.error('Error monitoring session:', error);
            }
        }, 10000); // Check every 10 seconds
    }

    // Show authentication status
    function showAuthStatus(message, type) {
        authStatus.textContent = message;
        authStatus.className = `status-message ${type}`;
        authStatus.classList.remove('hidden');
    }

    // Send messages
    async function sendMessages() {
        const namesString = namesInput.value.trim();
        const message = messageInput.value.trim();

        if (!namesString || !message) {
            alert('Please enter both recipients and message');
            return;
        }

        // Convert comma-separated names to array
        const names = namesString
            .split(',')
            .map(name => name.trim())
            .filter(name => name.length > 0);

        if (names.length === 0) {
            alert('Please enter at least one valid recipient');
            return;
        }

        // Show loading
        loadingDiv.classList.remove('hidden');
        loadingText.textContent = 'Sending messages...';
        resultsDiv.classList.add('hidden');
        sendBtn.disabled = true;

        try {
            const response = await fetch('http://localhost:3000/send-messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    senderName: currentSenderName,
                    names: names,
                    message: message
                })
            });

            const data = await response.json();

            if (response.ok) {
                displayResults(data.results);
                // Clear form after successful send
                namesInput.value = '';
                messageInput.value = '';
            } else {
                alert(`Error: ${data.error}`);
            }
        } catch (error) {
            alert(`Failed to send messages: ${error.message}`);
        } finally {
            loadingDiv.classList.add('hidden');
            sendBtn.disabled = false;
        }
    }

    // Logout
    logoutBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to logout?')) {
            return;
        }

        try {
            await fetch('http://localhost:3000/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ senderName: currentSenderName })
            });
        } catch (error) {
            console.error('Error logging out:', error);
        }

        resetToAuth();
    });

    

    // Reset to authentication screen
    function resetToAuth() {
        clearInterval(sessionCheckInterval);
        clearInterval(qrCheckInterval);
        localStorage.removeItem('currentSender');
        currentSenderName = '';

        authSection.classList.remove('hidden');
        messageSection.classList.add('hidden');
        qrSection.classList.add('hidden');
        resultsDiv.classList.add('hidden');

        senderNameInput.value = '';
        namesInput.value = '';
        messageInput.value = '';
        qrCode.innerHTML = '';
        authStatus.classList.add('hidden');
    }

    // Display results
    function displayResults(results) {
        resultsList.innerHTML = '';

        results.forEach(result => {
            const div = document.createElement('div');
            div.className = 'result-item';

            if (result.status === 'success') {
                div.classList.add('success');
                div.textContent = `✓ ${result.name} (${result.number}): Message sent successfully`;
            } else if (result.status === 'failed') {
                div.classList.add('failed');
                div.textContent = `✗ ${result.name} (${result.number}): Failed - ${result.error}`;
            } else if (result.status === 'not_found') {
                div.classList.add('not-found');
                div.textContent = `⚠ ${result.name}: Contact not found in database`;
            }

            resultsList.appendChild(div);
        });

        resultsDiv.classList.remove('hidden');
    }
});


function updateConnectionStatus(connected) {
    let statusElem = document.getElementById('connection-status');
    if (!statusElem) {
        statusElem = document.createElement('div');
        statusElem.id = 'connection-status';
        document.body.appendChild(statusElem);
    }
    statusElem.textContent = connected ? 'Connected' : 'Disconnected';
    statusElem.className = `connection-status ${connected ? 'connected' : 'disconnected'}`;
}

document.getElementById('refreshQR').addEventListener('click', () => {
    localStorage.removeItem('lastQR');
    startQRCheck(currentSenderName);
});