const express = require('express');
const cors = require('cors');
const venom = require('venom-bot');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store multiple client sessions
const sessions = new Map();
const qrCodes = new Map();
const sessionStatus = new Map();

// Load contacts from JSON file
const loadContacts = () => {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'contacts.json'), 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading contacts:', error);
    return [];
  }
};

// Initialize session endpoint
app.post('/init-session', async (req, res) => {
  const { senderName } = req.body;

  if (!senderName) {
    return res.status(400).json({ error: 'Sender name is required' });
  }

  // Check if session already exists and is connected
  if (sessions.has(senderName)) {
    const client = sessions.get(senderName);
    try {
      const isConnected = await client.isConnected();
      if (isConnected) {
        return res.json({
          status: 'already_authenticated',
          message: 'Session already exists and is authenticated'
        });
      }
    } catch (error) {
      // Session exists but not connected, remove it
      sessions.delete(senderName);
    }
  }

  // Set initial status
  sessionStatus.set(senderName, 'initializing');

  // Send response immediately
  res.json({
    status: 'initializing',
    message: 'Session initialization started'
  });

  // Initialize session asynchronously
  initializeSession(senderName);
});

// Separate function to initialize session
async function initializeSession(senderName) {
  try {
    console.log(`Starting session for ${senderName}...`);
    
    // Add explicit browser args
    const browserArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ];

    const client = await venom.create(
      senderName,
      (base64Qr, asciiQR, attempts, urlCode) => {
        console.log(`QR Code generated for ${senderName} - Attempt ${attempts}`);
        qrCodes.set(senderName, base64Qr);
        sessionStatus.set(senderName, 'qr_ready');
      },
      (statusSession) => {
        console.log(`Status for ${senderName}: ${statusSession}`);
        if (statusSession === 'qrReadFail' || statusSession === 'autocloseCalled') {
          sessionStatus.set(senderName, 'failed');
          qrCodes.delete(senderName);
        }
      },
      {
        headless: "new",
        puppeteerOptions: {
          args: browserArgs,
          executablePath: process.env.CHROME_PATH || undefined
        },
        multidevice: true,
        disableSpins: true,
        logQR: true, // Enable QR logging for debugging
        autoClose: 120000, // Increase timeout to 2 minutes
        createPathFileToken: true,
        waitForLogin: true,
        devtools: false
      }
    );

    sessions.set(senderName, client);
    sessionStatus.set(senderName, 'connected');
    console.log(`Client created successfully for ${senderName}`);
  } catch (error) {
    console.error(`Failed to initialize session for ${senderName}:`, error);
    sessionStatus.set(senderName, 'error');
    qrCodes.delete(senderName);
  }
}

// Get QR code endpoint
// Update the QR code endpoint
app.get('/qr-code/:senderName', (req, res) => {
  const { senderName } = req.params;
  const qrCode = qrCodes.get(senderName);
  const status = sessionStatus.get(senderName) || 'not_initialized';

  // Extend QR code lifetime in memory
  if (qrCode) {
    res.json({ 
      qrCode, 
      status: 'qr_ready',
      timestamp: Date.now()  // Add timestamp for freshness
    });
  } else {
    // If no QR but status is initializing, wait longer
    if (status === 'initializing') {
      return res.json({ status: 'initializing' });
    }
    res.json({ status });
  }
});
// Check session status
app.get('/session-status/:senderName', async (req, res) => {
  const { senderName } = req.params;
  const client = sessions.get(senderName);
  const status = sessionStatus.get(senderName) || 'not_initialized';

  if (client && status === 'connected') {
    try {
      const isConnected = await client.isConnected();
      res.json({
        status: isConnected ? 'connected' : 'disconnected',
        authenticated: isConnected
      });
    } catch (error) {
      res.json({ status: 'error', authenticated: false });
    }
  } else {
    res.json({ status, authenticated: false });
  }
});

// Send messages endpoint
app.post('/send-messages', async (req, res) => {
  const { senderName, names, message } = req.body;

  if (!senderName || !names || !message) {
    return res.status(400).json({ error: 'Sender name, names, and message are required' });
  }

  const client = sessions.get(senderName);
  if (!client) {
    return res.status(400).json({ error: 'Session not found. Please authenticate first.' });
  }

  // Check if client is connected
  try {
    const isConnected = await client.isConnected();
    if (!isConnected) {
      return res.status(400).json({ error: 'WhatsApp is not connected. Please re-authenticate.' });
    }
  } catch (error) {
    return res.status(400).json({ error: 'Session error. Please re-authenticate.' });
  }

  const contacts = loadContacts();
  const results = [];

  for (const name of names) {
    const contact = contacts.find(c =>
      c.name.toLowerCase().trim() === name.toLowerCase().trim()
    );

    if (contact) {
      try {
        // Format number properly - add country code if needed
        let formattedNumber = contact.number.replace(/\D/g, '');

        // Add country code if not present (assuming US +1)
        if (formattedNumber.length === 10) {
          formattedNumber = '1' + formattedNumber;
        }

        formattedNumber = formattedNumber + '@c.us';

        await client.sendText(formattedNumber, message);
        results.push({
          name: contact.name,
          number: contact.number,
          status: 'success'
        });

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        results.push({
          name: contact.name,
          number: contact.number,
          status: 'failed',
          error: error.message
        });
      }
    } else {
      results.push({
        name: name,
        status: 'not_found'
      });
    }
  }

  res.json({ results });
});

// Logout endpoint
app.post('/logout', async (req, res) => {
  const { senderName } = req.body;
  const client = sessions.get(senderName);

  if (client) {
    try {
      await client.logout();
    } catch (error) {
      console.error('Error during logout:', error);
    }
  }

  // Clean up regardless of logout success
  sessions.delete(senderName);
  qrCodes.delete(senderName);
  sessionStatus.delete(senderName);

  res.json({ message: 'Logged out successfully' });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});