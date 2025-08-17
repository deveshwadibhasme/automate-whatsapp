const express = require('express');
const cors = require('cors');
const { create, Whatsapp } = require('venom-bot');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const {MongoClient} = require("mongodb")

const app = express();
const PORT = process.env.PORT || 3001;

// Create HTTP server for Express + Socket.IO
const server = http.createServer(app);

// Socket.IO server
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});


io.on('connection', (socket) => {
  console.log('Client connected');
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('frontend'));


// Store active Venom clients keyed by sender name
const clients = new Map();
const sessionStates = new Map(); // Track session states
const sessionQrCodes = new Map(); // Track latest QR per session

// const uri = process.env.MONGO_URI; 
const uri = 'mongodb://localhost:27017/whatsappApp'
const clientDB = new MongoClient(uri);

async function saveSessionToDB(senderName, sessionData) {
  const db = clientDB.db("whatsappApp");
  const sessions = db.collection("sessions");
  console.log('Saving Data...');
  await sessions.updateOne(
    { senderName },
    { $set: { sessionData, updatedAt: new Date() } },
    { upsert: true }
  );
}

async function getSessionFromDB(senderName) {
  const db = clientDB.db("whatsappApp");
  const sessions = db.collection("sessions");

  const session = await sessions.findOne({ senderName });
  return session ? session.sessionData : null;
}

// Load contacts from JSON file
async function loadContacts() {
  try {
    const contactsPath = path.join(__dirname, 'contacts.json');
    const data = await fs.readFile(contactsPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading contacts:', error);
    return [];
  }
}

// Create contact name to number mapping
async function getContactMap() {
  const contacts = await loadContacts();
  const contactMap = new Map();
  contacts.forEach(contact => {
    contactMap.set(contact.name, contact.number);
  });
  return contactMap;
}

// API endpoint to start a new session
app.post('/api/start-session', async (req, res) => {
  const maxWaitTime = 60000; // 60s max
  try {
    const { senderName } = req.body;

     const sessionData = await getSessionFromDB(senderName);

    if (!senderName || typeof senderName !== 'string') {
      return res.status(400).json({ success: false, error: 'Sender name is required' });
    }

    // Check if session already exists
    if (clients.has(senderName)) {
      const existingClient = clients.get(senderName);
      try {
        const isConnected = await existingClient.isConnected();
        if (isConnected) {
          return res.json({
            success: true,
            message: 'Session already active',
            sessionReady: true
          });
        }
      } catch (err) {
        console.warn(`Session check failed for ${senderName}:`, err.message);
      }
    }

    console.log(`Starting session for: ${senderName}`);
    sessionStates.set(senderName, 'starting');

    let qrCode = null;
    let sessionReady = false;

    // ---- Venom client creation ----
    const client = await create(
      {
        session: senderName,
        multidevice: true,
        headless: true,
        logQR: false, // don't log ASCII in terminal
        catchQR: (base64Qr) => {
          qrCode = base64Qr;
          sessionQrCodes.set(senderName, base64Qr);
          sessionStates.set(senderName, 'qr-ready');
          io.emit('qr', { senderName, qr: base64Qr });
        },
        sessionData,
        browserArgs: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
        autoClose: 0,
        disableSpins: true,
        disableWelcome: true
      },
      undefined, // ascii QR callback not needed
      async (statusSession, session) => {
        console.log(`Session ${senderName} status: ${statusSession}`);

        if (statusSession === 'isLogged') {
          // 2. Save tokens when logged in
          const newTokens = await client.getSessionTokenBrowser();
          await saveSessionToDB(senderName, newTokens);
        }
      }
      // (statusSession) => {
      //   console.log(`Status ${statusSession} for ${senderName}`);
      //   if (statusSession === 'qrReadSuccess') {
      //     sessionStates.set(senderName, 'qr-scanned');
      //   }
      //   if (statusSession === 'isLogged') {
      //     sessionReady = true;
      //     sessionStates.set(senderName, 'ready');
      //     sessionQrCodes.delete(senderName);
      //   }
      //   if (statusSession === 'notLogged') {
      //     sessionStates.set(senderName, 'not-logged');
      //   }
      // }
    );

    clients.set(senderName, client);

    // ---- Wait loop ----
    const start = Date.now();
    while (!qrCode && !sessionReady && (Date.now() - start) < maxWaitTime) {
      await new Promise(r => setTimeout(r, 500));
    }

    res.json({
      success: true,
      qrCode: qrCode || null,
      sessionReady,
      message: sessionReady ? 'Session is ready' : 'QR Code generated, please scan'
    });

  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({ success: false, error: 'Failed: ' + error.message });
  }
});





// API endpoint to get session status
app.get('/api/session-status/:senderName', async (req, res) => {
  try {
    const { senderName } = req.params;
    const client = clients.get(senderName);
    const state = sessionStates.get(senderName) || 'not-started';

    if (!client) {
      return res.json({
        success: true,
        status: 'not-started',
        sessionReady: false
      });
    }

    const isConnected = await client.isConnected();
    const sessionReady = isConnected && state === 'ready';

    res.json({
      success: true,
      status: state,
      sessionReady: sessionReady,
      isConnected: isConnected,
      qrCode: !sessionReady ? sessionQrCodes.get(senderName) || null : null
    });

  } catch (error) {
    console.error('Error checking session status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check session status'
    });
  }
});

// API endpoint to get latest QR for a session
app.get('/api/get-qr/:senderName', async (req, res) => {
  try {
    const { senderName } = req.params;
    const qrCode = sessionQrCodes.get(senderName) || null;
    const status = sessionStates.get(senderName) || 'not-started';

    res.json({
      success: true,
      qrCode,
      status
    });
  } catch (error) {
    console.error('Error getting QR:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get QR'
    });
  }
});

// API endpoint to send messages
app.post('/api/send-message', async (req, res) => {
  try {
    const { senderName, names, message } = req.body;

    if (!senderName || !names || !message) {
      return res.status(400).json({
        success: false,
        error: 'Sender name, recipient names, and message are required'
      });
    }

    const client = clients.get(senderName);
    if (!client) {
      return res.status(400).json({
        success: false,
        error: 'Session not found. Please start a session first.'
      });
    }

    // Check if client is connected
    const isConnected = await client.isConnected();
    if (!isConnected) {
      return res.status(400).json({
        success: false,
        error: 'Session is not connected. Please scan the QR code first.'
      });
    }

    // Parse recipient names
    const recipientNames = names.split(',').map(name => name.trim()).filter(name => name);
    if (recipientNames.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid recipient names provided'
      });
    }

    // Load contact mapping
    const contactMap = await getContactMap();

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const name of recipientNames) {
      console.log(recipientNames)
      console.log(name)
      const number = contactMap.get(name);

      if (!number) {
        results.push({ name, status: 'failed', error: 'Contact not found' });
        failCount++;
        continue;
      }

      try {
        // Format phone number for WhatsApp
        const formattedNumber = `${number}@c.us`;

        // Send message
        await client.sendText(formattedNumber, message);
        results.push({ name, number, status: 'sent' });
        successCount++;

        // Small delay between messages to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`Error sending message to ${name} (${number}):`, error);
        results.push({
          name,
          number,
          status: 'failed',
          error: error.message
        });
        failCount++;
      }
    }

    console.log(`Message sending completed for ${senderName}. Success: ${successCount}, Failed: ${failCount}`);

    res.json({
      success: true,
      results,
      summary: {
        total: recipientNames.length,
        sent: successCount,
        failed: failCount
      },
      message: `Messages sent: ${successCount}/${recipientNames.length}`
    });

  } catch (error) {
    console.error('Error sending messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send messages: ' + error.message
    });
  }
});

// API endpoint to get contacts list
app.get('/api/contacts', async (req, res) => {
  try {
    const contacts = await loadContacts();
    res.json({ success: true, contacts });
  } catch (error) {
    console.error('Error loading contacts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load contacts'
    });
  }
});

// API endpoint to close session
app.post('/api/close-session', async (req, res) => {
  try {
    const { senderName } = req.body;

    const client = clients.get(senderName);
    if (client) {
      await client.close();
      clients.delete(senderName);
      sessionStates.delete(senderName);
      console.log(`Session closed for ${senderName}`);
    }

    res.json({ success: true, message: 'Session closed' });
  } catch (error) {
    console.error('Error closing session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to close session'
    });
  }
});

// Serve frontend files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Clean up sessions on server shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');

  for (const [senderName, client] of clients) {
    try {
      await client.close();
      console.log(`Closed session for ${senderName}`);
    } catch (error) {
      console.error(`Error closing session for ${senderName}:`, error);
    }
  }

  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down server...');

  for (const [senderName, client] of clients) {
    try {
      await client.close();
      console.log(`Closed session for ${senderName}`);
    } catch (error) {
      console.error(`Error closing session for ${senderName}:`, error);
    }
  }

  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`WhatsApp Automation Server running on port ${PORT}`);
  console.log(`Frontend available at: http://localhost:${PORT}`);
});