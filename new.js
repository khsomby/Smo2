require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const PAGE_TOKEN = process.env.token;
const VERIFY_TOKEN = 'somby';
const API_URL = 'https://minecraft-server-production-db6b.up.railway.app/search';
const MAX_VIDEOS = 15;

// Map to temporarily store videos per user (key: senderId, value: array of videos)
const userVideosCache = new Map();

async function sendAPI(recipientId, message) {
  return axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_TOKEN}`, {
    recipient: { id: recipientId },
    message,
  });
}

// Send video with fallback method and return true if successful
async function sendVideoWithFallback(recipientId, videoUrl) {
  // Try sending video URL first (direct URL method)
  try {
    await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_TOKEN}`, {
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: 'video',
          payload: { url: videoUrl, is_reusable: false },
        },
      },
    });
    return true; // success
  } catch {
    // direct URL method failed, fallback to attachment upload below
  }

  // Fallback: upload video attachment ID and send that
  try {
    const uploadRes = await axios.post(`https://graph.facebook.com/v18.0/me/message_attachments?access_token=${PAGE_TOKEN}`, {
      message: {
        attachment: {
          type: 'video',
          payload: { url: videoUrl, is_reusable: true },
        },
      },
    });

    const attachment_id = uploadRes.data.attachment_id;
    if (!attachment_id) throw new Error('No attachment_id received');

    await sendAPI(recipientId, {
      attachment: {
        type: 'video',
        payload: { attachment_id },
      },
    });
    return true; // success
  } catch {
    return false; // both methods failed
  }
}

async function sendAllVideos(recipientId) {
  const videos = userVideosCache.get(recipientId);
  if (!videos || videos.length === 0) {
    await sendAPI(recipientId, { text: 'No videos to send. Please send a search query.' });
    return;
  }

  for (const video of videos) {
    let sent = false;

    // Up to 10 attempts per video
    for (let attempt = 0; attempt < 10; attempt++) {
      sent = await sendVideoWithFallback(recipientId, video.contentUrl);
      if (sent) break; // success, move to next video
      await new Promise(r => setTimeout(r, 1000)); // wait 1 second before retry
    }
    // If after 10 attempts still not sent, move on silently to next video
  }

  // Clear cache after sending all videos
  userVideosCache.delete(recipientId);
}

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.send(challenge);
  }
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  const entry = req.body.entry?.[0];
  const messaging = entry?.messaging?.[0];
  const senderId = messaging?.sender?.id;
  const msg = messaging?.message;

  if (!senderId || !msg) return res.sendStatus(200);

  if (msg?.text === 'GET_STARTED_PAYLOAD') {
    await sendAPI(senderId, {
      text: `👋 Welcome! Send a search title to get up to ${MAX_VIDEOS} videos (minimum 10 minutes duration).`,
    });
    return res.sendStatus(200);
  }

  const userText = msg.text.trim();

  try {
    // Fetch videos from your API
    const result = await axios.get(`${API_URL}?title=${encodeURIComponent(userText)}`);
    const videos = (result.data || []).slice(0, MAX_VIDEOS);

    if (videos.length === 0) {
      await sendAPI(senderId, { text: 'No videos found for your search.' });
      return res.sendStatus(200);
    }

    // Cache videos for this user before sending
    userVideosCache.set(senderId, videos);

    await sendAPI(senderId, {
      text: `Found ${videos.length} videos for "${userText}". Sending now...`,
    });

    // Send all videos with retry logic (10 attempts each)
    await sendAllVideos(senderId);
  } catch (err) {
    console.error('Error fetching videos or sending:', err.message);
    await sendAPI(senderId, { text: 'An error occurred while searching. Please try again later.' });
  }

  res.sendStatus(200);
});

app.get('/setup', async (req, res) => {
  try {
    await axios.post(`https://graph.facebook.com/v18.0/me/messenger_profile?access_token=${PAGE_TOKEN}`, {
      get_started: { payload: 'GET_STARTED_PAYLOAD' },
      greeting: [{ locale: 'default', text: '👋 Welcome! Send a title to search for videos!' }],
    });
    res.send('Get Started button configured.');
  } catch (err) {
    res.status(500).send('Error configuring get started button');
  }
});

const PORT = 2008;
app.listen(PORT, () => {
  console.log(`Messenger bot running on port ${PORT}`);
});