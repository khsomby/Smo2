require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const PAGE_TOKEN = process.env.token;
const VERIFY_TOKEN = 'somby';
const API_URL = 'https://minecraft-server-production-db6b.up.railway.app/search';
const PAY_METHODS = JSON.parse(fs.readFileSync('./pay.json', 'utf-8'));

let premiumIDs = [];
const videoCache = new Map();
let adminID = null;
const pendingPayment = {};

async function fetchPremiumIDs() {
  try {
    const res = await axios.get('https://github.com/khsomby/genocide/blob/main/idpremium.txt'); // replace with real URL
    premiumIDs = res.data.split('\n').map(id => id.trim());
  } catch {}
}

async function getAdminID() {
  try {
    const res = await axios.get(`https://graph.facebook.com/v18.0/me/roles?access_token=${PAGE_TOKEN}`);
    adminID = res.data.data?.[0]?.user || null;
  } catch {}
}

function sendAPI(recipientId, message) {
  return axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_TOKEN}`, {
    recipient: { id: recipientId },
    message
  });
}

async function sendVideoWithFallback(recipientId, videoUrl) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_TOKEN}`, {
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'video',
            payload: { url: videoUrl, is_reusable: false }
          }
        }
      });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  try {
    const uploadRes = await axios.post(`https://graph.facebook.com/v18.0/me/message_attachments?access_token=${PAGE_TOKEN}`, {
      message: {
        attachment: {
          type: 'video',
          payload: { url: videoUrl, is_reusable: true }
        }
      }
    });

    const attachment_id = uploadRes.data.attachment_id;
    await sendAPI(recipientId, {
      attachment: {
        type: 'video',
        payload: { attachment_id }
      }
    });
    return true;
  } catch {
    return false;
  }
}

function sendQuickReplies(recipientId) {
  const replies = Object.keys(PAY_METHODS).map(name => ({
    content_type: 'text',
    title: name,
    payload: `PAY_${name}`
  }));

  return sendAPI(recipientId, {
    text: 'Choose a payment method:',
    quick_replies: replies
  });
}

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) return res.send(challenge);
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  const entry = req.body.entry?.[0];
  const messaging = entry?.messaging?.[0];
  const senderId = messaging?.sender?.id;
  const msg = messaging?.message;

  if (!senderId || !msg) return res.sendStatus(200);
  await fetchPremiumIDs();
  if (!adminID) await getAdminID();

  const userText = msg.text;

  if (userText === 'GET_STARTED_PAYLOAD') {
    await sendAPI(senderId, {
      text: '👋 Welcome! Send a video title.\nFree users get 3 short videos. Premium users get 10 full videos.'
    });
    return res.sendStatus(200);
  }

  if (userText.startsWith('PAY_')) {
    const method = userText.split('_')[1];
    pendingPayment[senderId] = method;
    await sendAPI(senderId, { text: `Please send the number or address you used for payment via ${method}` });
    return res.sendStatus(200);
  }

  if (pendingPayment[senderId]) {
    const method = pendingPayment[senderId];
    delete pendingPayment[senderId];
    await sendAPI(senderId, { text: '✅ Your request has been sent to admin.' });
    if (adminID) {
      await sendAPI(adminID, {
        text: `💰 Payment Request\nUser ID: ${senderId}\nMethod: ${method}\nValue: ${userText}`
      });
    }
    return res.sendStatus(200);
  }

  const isPremium = premiumIDs.includes(senderId);
  const cacheKey = `${userText}-${isPremium ? 'premium' : 'free'}`;

  if (!videoCache.has(cacheKey)) {
    try {
      const result = await axios.get(`${API_URL}?title=${encodeURIComponent(userText)}&type=${isPremium ? 'premium' : 'free'}`);
      videoCache.set(cacheKey, result.data);
    } catch {
      await sendAPI(senderId, { text: '❌ Failed to fetch video results. Try again later.' });
      return res.sendStatus(200);
    }
  }

  const videos = videoCache.get(cacheKey).slice(0, isPremium ? 10 : 3);

  if (videos.length === 0) {
    await sendAPI(senderId, { text: 'No video found for that title.' });
    videoCache.delete(cacheKey); // Clear cache on empty result
    return res.sendStatus(200);
  }

  for (const video of videos) {
    const success = await sendVideoWithFallback(senderId, video.contentUrl);
    await new Promise(r => setTimeout(r, 200));
    // continue regardless of success/failure
  }

  videoCache.delete(cacheKey); // ✅ Clear cache after use

  if (!isPremium) {
    await sendAPI(senderId, {
      text: 'Upgrade to premium for more videos and no duration limit!',
      quick_replies: [{ content_type: 'text', title: 'Upgrade', payload: 'UPGRADE' }]
    });
  }

  res.sendStatus(200);
});

app.get('/setup', async (req, res) => {
  await axios.post(`https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${PAGE_TOKEN}`, {
    get_started: { payload: 'GET_STARTED_PAYLOAD' },
    greeting: [
      {
        locale: 'default',
        text: '👋 Welcome! Send a title to search for videos!'
      }
    ]
  });
  res.send('✅ Get Started button configured.');
});

app.listen(2008, () => {
  console.log('Messenger bot running on port 2008');
});