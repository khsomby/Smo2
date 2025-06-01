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

async function fetchPremiumIDs() {
  try {
    const res = await axios.get('https://your-site.com/premium.txt'); // Replace with your real link
    premiumIDs = res.data.split('\n').map(id => id.trim());
  } catch {}
}

let adminID = null;
async function getAdminID() {
  try {
    const res = await axios.get(`https://graph.facebook.com/v18.0/me/roles?access_token=${PAGE_TOKEN}`);
    adminID = res.data.data?.[0]?.user || null;
  } catch {}
}

function sendAPI(senderId, message) {
  return axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_TOKEN}`, {
    recipient: { id: senderId },
    message
  });
}

async function sendVideoWithFallback(recipientId, videoUrl) {
  for (let i = 0; i < 3; i++) {
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
      return;
    } catch (e) {
      await new Promise(res => setTimeout(res, 1000));
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
  } catch (e) {
    await sendAPI(recipientId, { text: 'Failed to send video.' });
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

let pendingPayment = {};

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

  if (msg?.text === 'GET_STARTED_PAYLOAD') {
    await sendAPI(senderId, {
      text: 'Welcome to the bot. Send a title to search videos.\n\nFree users get 3 videos (under 15 mins).\nPremium users get 10 videos (no limit).'
    });
    return res.sendStatus(200);
  }

  const userText = msg.text;

  if (userText.startsWith('PAY_')) {
    const method = userText.split('_')[1];
    pendingPayment[senderId] = method;
    await sendAPI(senderId, { text: `Please send the number or address you used for payment via ${method}` });
    return res.sendStatus(200);
  }

  if (pendingPayment[senderId]) {
    const method = pendingPayment[senderId];
    delete pendingPayment[senderId];
    await sendAPI(senderId, {
      text: 'Your request has been sent to admin.'
    });
    if (adminID) {
      await sendAPI(adminID, {
        text: `💰 Payment Request:\nUser ID: ${senderId}\nMethod: ${method}\nValue: ${userText}`
      });
    }
    return res.sendStatus(200);
  }

  const isPremium = premiumIDs.includes(senderId);
  try {
    const result = await axios.get(`${API_URL}?title=${encodeURIComponent(userText)}&type=${isPremium ? 'premium' : 'free'}`);
    const videos = result.data.slice(0, isPremium ? 10 : 3);

    if (videos.length === 0) {
      await sendAPI(senderId, { text: 'No video found.' });
    }

    for (const video of videos) {
      await sendVideoWithFallback(senderId, video.contentUrl);
    }

    if (!isPremium) {
      await sendAPI(senderId, {
        text: 'Want more videos and longer ones? Upgrade to premium.',
        quick_replies: [
          { content_type: 'text', title: 'Upgrade', payload: 'UPGRADE' }
        ]
      });
    }
  } catch (err) {
    await sendAPI(senderId, { text: 'An error occurred. Try again later.' });
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
  res.send('Get Started button configured.');
});

app.listen(2008, () => {
  console.log('Messenger bot running on port 3002');
});