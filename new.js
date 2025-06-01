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
let adminID = null;
let pendingPayment = {};

// Fetch premium user IDs
async function fetchPremiumIDs() {
  try {
    const res = await axios.get('https://your-site.com/premium.txt'); // Replace with your link
    premiumIDs = res.data.split('\n').map(id => id.trim());
  } catch (err) {
    console.error('Could not fetch premium IDs:', err.message);
  }
}

// Get admin ID
async function getAdminID() {
  try {
    const res = await axios.get(`https://graph.facebook.com/v18.0/me/roles?access_token=${PAGE_TOKEN}`);
    adminID = res.data.data?.[0]?.user || null;
  } catch (err) {
    console.error('Could not fetch admin ID:', err.message);
  }
}

// Send message to Messenger
function sendAPI(senderId, message) {
  return axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_TOKEN}`, {
    recipient: { id: senderId },
    message
  });
}

// Send video using fallback to attachment_id
async function sendVideoWithFallback(recipientId, videoUrl) {
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
  } catch (err) {
    // Try attachment upload method
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
    } catch (uploadErr) {
      console.error('Video send failed:', uploadErr.message);
      await sendAPI(recipientId, { text: `❌ Failed to send video./n${uploadErr.message}` });
    }
  }
}

// Show payment options
function sendQuickReplies(recipientId) {
  const replies = Object.keys(PAY_METHODS).map(method => ({
    content_type: 'text',
    title: method,
    payload: `PAY_${method}`
  }));

  return sendAPI(recipientId, {
    text: 'Choose a payment method:',
    quick_replies: replies
  });
}

// Webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) return res.send(challenge);
  res.sendStatus(403);
});

// Webhook POST
app.post('/webhook', async (req, res) => {
  const entry = req.body.entry?.[0];
  const messaging = entry?.messaging?.[0];
  const senderId = messaging?.sender?.id;
  const msg = messaging?.message;

  if (!senderId || !msg) return res.sendStatus(200);

  await fetchPremiumIDs();
  if (!adminID) await getAdminID();

  const userText = msg.text;

  // Handle Get Started
  if (userText === 'GET_STARTED_PAYLOAD') {
    await sendAPI(senderId, {
      text: '👋 Welcome to the bot!\n\nSend a video title to search.\nFree users: 3 videos under 15 min.\nPremium users: 10 full-length videos.'
    });
    return res.sendStatus(200);
  }

  // Handle payment method selection
  if (userText.startsWith('PAY_')) {
    const method = userText.split('_')[1];
    pendingPayment[senderId] = method;
    await sendAPI(senderId, {
      text: `💳 Please send the number or address you used to pay via ${method}.`
    });
    return res.sendStatus(200);
  }

  // Handle payment address/number input
  if (pendingPayment[senderId]) {
    const method = pendingPayment[senderId];
    delete pendingPayment[senderId];

    await sendAPI(senderId, { text: '✅ Your payment info has been sent to admin.' });
    if (adminID) {
      await sendAPI(adminID, {
        text: `🧾 New Payment Request\n👤 User ID: ${senderId}\n💰 Method: ${method}\n📨 Info: ${userText}`
      });
    }
    return res.sendStatus(200);
  }

  // Handle video search
  const isPremium = premiumIDs.includes(senderId);
  try {
    const response = await axios.get(`${API_URL}?title=${encodeURIComponent(userText)}&type=${isPremium ? 'premium' : 'free'}`);
    const videos = response.data.slice(0, isPremium ? 10 : 3);

    if (!videos.length) {
      await sendAPI(senderId, { text: '😕 No videos found for your search.' });
      return res.sendStatus(200);
    }

    for (const video of videos) {
      await sendVideoWithFallback(senderId, video.contentUrl);
    }

    if (!isPremium) {
      await sendAPI(senderId, {
        text: '🔥 Want more videos without limits? Upgrade to premium now.',
        quick_replies: [
          { content_type: 'text', title: 'Upgrade', payload: 'UPGRADE' }
        ]
      });
    }
  } catch (err) {
    console.error('Search failed:', err.message);
    await sendAPI(senderId, { text: '⚠️ Error searching videos. Try again later.' });
  }

  res.sendStatus(200);
});

// Configure Get Started button
app.get('/setup', async (req, res) => {
  try {
    await axios.post(`https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${PAGE_TOKEN}`, {
      get_started: { payload: 'GET_STARTED_PAYLOAD' },
      greeting: [{
        locale: 'default',
        text: '👋 Welcome! Send a video title to search.'
      }]
    });
    res.send('✅ Get Started button set up.');
  } catch (err) {
    res.status(500).send('❌ Failed to set Get Started.');
  }
});

// Start server
app.listen(2008, () => {
  console.log('✅ Messenger bot running on port 2008');
});