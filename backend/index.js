const express = require('express');
const cors = require('cors');
const venom = require('venom-bot');
const fs = require('fs');
const path = require('path');
const app = express();
const contact = require('./contact.json');

app.use(cors());
app.use(express.json());

let qrBase64 = null;

const sessionDir = '/data/venom-sessions';
if (!fs.existsSync(sessionDir)) {
  fs.mkdirSync(sessionDir, { recursive: true });
}

const sessionClients = {};
app.post('/generate-qr/:sessionName', async (req, res) => {

  const { sessionName } = req.params

  if (sessionClients[sessionName]) {
    return res.json({ message: 'Session already created' });
  }

  venom.create(
    {
      session: sessionName,
      headless: 'new', // updated to avoid deprecation warning
      multidevice: true
    },
    (base64Qr, asciiQR) => {
      qrBase64 = base64Qr; // store QR in memory
      console.log('📱 QR generated for scan');
    },
    (status) => console.log('Session status:', status)
  )
    .then((client) => {
      sessionClients[sessionName] = { client: client };
      console.log('✅ Venom session started');
    })
    .catch((err) => console.error(err));

  res.json({ message: 'QR generation started' });
});

app.get('/qr', (req, res) => {
  if (!qrBase64) return res.status(404).json({ error: 'QR not yet generated' });
  res.json({ qr: qrBase64 });
});

app.post('/send-messages/:sessionName', async (req, res) => {
  console.log('Received request for /send-messages with params:', req.params);
  const sessionName = req.params.sessionName;
  const { nameList, message } = req.body;

  const session = sessionClients[sessionName];
  if (!session || !session.client) {
    return res.status(400).json({ error: 'Session not connected or invalid' });
  }

  // Match numbers from contact.json
  const filteredNumbers = contact
    .filter(person => nameList.includes(person.name))
    .map(person => `${person.number}@c.us`);

  try {
    for (const number of filteredNumbers) {
      await session.client.sendText(number, message);
    }
    res.json({ status: 'Messages sent' });
  } catch (err) {
    res.status(500).json({ error: 'Message sending failed', details: err });
  }
});

app.listen(5000, () => console.log('🚀 Backend running on http://localhost:5000'));