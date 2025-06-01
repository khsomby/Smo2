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
  try {
    // Try sending directly
    await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_TOKEN}`, {
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: 'video',
          payload: { url: videoUrl, is_reusable: false }
        }
      }
    });
  } catch {
    try {
      // Upload then send with attachment ID
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
    } catch {
      // If sending fails, skip
    }
  }
}

function sendQuickReplies(recipientId) {
  return sendAPI(recipientId, {
    text: 'Choose an option:',
    quick_replies: [
      {
        content_type: 'text',
        title: 'Donate',
        payload: 'DONATE_PAYLOAD'
      }
    ]
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
  if (!adminID) await getAdminID();

  const userText = msg.text;
  const payload = msg.quick_reply?.payload;

  // Handle Get Started
  if (userText === 'GET_STARTED_PAYLOAD') {
    await sendAPI(senderId, {
      text: '👋 Welcome! Send a title to search for videos. You will receive up to 15 free videos.'
    });
    return res.sendStatus(200);
  }

  // Handle quick reply payload
  if (payload === 'DONATE_PAYLOAD') {
    await sendAPI(senderId, {
      text: 'If you want to donate admin, send it to admin phone number 0381060495.'
    });
    return res.sendStatus(200);
  }

  // Handle search
  try {
    const result = await axios.get(`${API_URL}?title=${encodeURIComponent(userText)}`);
    const videos = result.data.slice(0, 15);

    if (videos.length === 0) {
      await sendAPI(senderId, { text: 'No videos found for your search.' });
    } else {
      for (const video of videos) {
        await sendVideoWithFallback(senderId, video.contentUrl);
      }
    }

    await sendQuickReplies(senderId);
  } catch (err) {
    await sendAPI(senderId, { text: 'An error occurred. Please try again later.' });
  }

  res.sendStatus(200);
});

// Setup Get Started button
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

app.listen(3002, () => {
  console.log('Messenger bot running on port 3002');
});