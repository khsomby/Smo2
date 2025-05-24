require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// Configuration
const T1_ACCESS_TOKEN = process.env.T1;
const T2_ACCESS_TOKEN = process.env.T1;
const VERIFY_TOKEN = "somby";
const API_VERSION = 'v18.0';
const ADMIN_ID = '6881956545251284';
const endpointPassword = 'Auto_2025';
const PORT = 2008;

let isActive = false;
const monitoredPosts = {};
const adminSessions = {};

// Webhook verification
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

// Webhook event handler
app.post('/webhook', async (req, res) => {
  try {
    if (req.body.object === 'page') {
      for (const entry of req.body.entry) {
        if (entry.messaging) {
          for (const event of entry.messaging) {
            if (event.message?.quick_reply) {
              await handleQuickReply(event);
            } else {
              await handleMessage(event);
            }
          }
        }
        if (entry.changes) {
          await Promise.all(entry.changes.map(processChange));
        }
      }
    }
    res.sendStatus(200);
  } catch (e) {
    console.error('Webhook error:', e);
    res.sendStatus(500);
  }
});

// Control endpoints
app.post('/activate', authCheck, (req, res) => {
  isActive = true;
  res.json({ status: 'ACTIVE' });
});

app.post('/deactivate', authCheck, (req, res) => {
  isActive = false;
  res.json({ status: 'INACTIVE' });
});

app.post('/monitor-post', authCheck, async (req, res) => {
  const { postId, keywords = [], publicReply, privateReply } = req.body;
  monitoredPosts[postId] = { keywords, publicReply, privateReply };
  await setupWebhookSubscription();
  res.json({ status: 'MONITORING', postId, keywords });
});

app.get('/status', (req, res) => {
  res.json({ status: isActive ? 'ACTIVE' : 'INACTIVE', monitoredPosts });
});

function authCheck(req, res, next) {
  if (req.body.password !== endpointPassword) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Message handler
async function handleMessage(event) {
  const senderId = event.sender.id;
  const messageText = event.message?.text?.trim();

  if (!messageText) return;

  if (senderId !== ADMIN_ID) {
    if (isActive) {
      await sendMessage(senderId, { text: "Thanks for your message! We'll get back to you soon." });
    }
    return;
  }

  if (messageText.toLowerCase() === '/start') {
    return sendQuickReplies(senderId, 'Welcome! What would you like to do?', [
      { title: 'Add Post', payload: 'MENU_ADD_POST' },
      { title: 'View Status', payload: 'MENU_VIEW_STATUS' },
      { title: 'Cancel', payload: 'MENU_CANCEL' }
    ]);
  }

  if (messageText.toLowerCase() === '/addpost') {
    adminSessions[senderId] = { step: 'awaiting_post_id', data: {} };
    return sendMessage(senderId, { text: 'Please enter the Facebook post ID to monitor:' });
  }

  if (messageText.toLowerCase() === '/cancel') {
    delete adminSessions[senderId];
    return sendMessage(senderId, { text: 'Cancelled any ongoing setup.' });
  }

  const session = adminSessions[senderId];
  if (!session) return;

  switch (session.step) {
    case 'awaiting_post_id':
      session.data.postId = messageText;
      session.step = 'awaiting_keywords';
      return sendQuickReplies(senderId, 'Do you want to use keywords to filter comments?', [
        { title: 'Yes', payload: 'KEYWORDS_YES' },
        { title: 'No', payload: 'KEYWORDS_NO' }
      ]);

    case 'awaiting_keywords_input':
      session.data.keywords = messageText.split(',').map(k => k.trim());
      session.step = 'awaiting_public_reply';
      return sendMessage(senderId, { text: 'Enter the public reply to comments:' });

    case 'awaiting_public_reply':
      session.data.publicReply = messageText;
      session.step = 'awaiting_private_reply';
      return sendMessage(senderId, { text: 'Enter the private message reply:' });

    case 'awaiting_private_reply':
      session.data.privateReply = messageText;
      monitoredPosts[session.data.postId] = {
        keywords: session.data.keywords || [],
        publicReply: session.data.publicReply,
        privateReply: session.data.privateReply
      };
      await setupWebhookSubscription();
      delete adminSessions[senderId];
      return sendMessage(senderId, {
        text: `✅ Monitoring post ${session.data.postId}\n` +
              `Keywords: ${session.data.keywords?.join(', ') || 'None'}\n` +
              `Public Reply: ${session.data.publicReply}\n` +
              `Private Reply: ${session.data.privateReply}`
      });

    default:
      delete adminSessions[senderId];
      return sendMessage(senderId, { text: 'Error. Please start again with /start.' });
  }
}

// Handle quick replies
async function handleQuickReply(event) {
  const senderId = event.sender.id;
  const payload = event.message.quick_reply.payload;
  const session = adminSessions[senderId];

  switch (payload) {
    case 'MENU_ADD_POST':
      adminSessions[senderId] = { step: 'awaiting_post_id', data: {} };
      return sendMessage(senderId, { text: 'Please enter the Facebook post ID to monitor:' });

    case 'MENU_VIEW_STATUS':
      return sendMessage(senderId, {
        text: `Bot is currently ${isActive ? 'ACTIVE' : 'INACTIVE'}\n\n` +
              `Monitored posts:\n` +
              (Object.entries(monitoredPosts).map(
                ([id, conf]) => `- ${id} (${conf.keywords.length ? 'keywords' : 'no keywords'})`
              ).join('\n') || 'None')
      });

    case 'MENU_CANCEL':
      delete adminSessions[senderId];
      return sendMessage(senderId, { text: 'Cancelled any ongoing setup.' });

    case 'KEYWORDS_YES':
      if (!session) return;
      session.step = 'awaiting_keywords_input';
      return sendMessage(senderId, { text: 'Enter keywords (comma-separated):' });

    case 'KEYWORDS_NO':
      if (!session) return;
      session.data.keywords = [];
      session.step = 'awaiting_public_reply';
      return sendMessage(senderId, { text: 'Enter the public reply to comments:' });

    default:
      return sendMessage(senderId, { text: 'Unknown action. Try /start again.' });
  }
}

// Process comments on monitored posts
async function processChange(change) {
  if (!isActive) return;

  if (change.field === 'feed' && change.value.item === 'comment') {
    const { post_id, comment_id, from, message } = change.value;
    const config = monitoredPosts[post_id];
    if (!config) return;

    const shouldReply = config.keywords.length === 0 ||
      config.keywords.some(k => message.toLowerCase().includes(k.toLowerCase()));

    if (!shouldReply) return;

    try {
      await axios.post(`https://graph.facebook.com/${API_VERSION}/${comment_id}/comments`,
        { message: config.publicReply },
        { params: { access_token: T1_ACCESS_TOKEN } });

      await sendMessage(from.id, { text: config.privateReply });
      console.log(`Replied to comment on post ${post_id}`);
    } catch (error) {
      console.error('Reply error:', error.response?.data || error.message);
    }
  }
}

// Send message
async function sendMessage(userId, message) {
  try {
    await axios.post(`https://graph.facebook.com/${API_VERSION}/me/messages`,
      { recipient: { id: userId }, message },
      { params: { access_token: T2_ACCESS_TOKEN } });
  } catch (error) {
    console.error('Message error:', error.response?.data || error.message);
  }
}

// Send quick replies
async function sendQuickReplies(userId, text, replies) {
  const quick_replies = replies.map(r => ({
    content_type: 'text',
    title: r.title,
    payload: r.payload
  }));

  return sendMessage(userId, { text, quick_replies });
}

// Subscribe to webhook events
async function setupWebhookSubscription() {
  try {
    await axios.post(
      `https://graph.facebook.com/${API_VERSION}/me/subscribed_apps`,
      { subscribed_fields: ['feed'] },
      { params: { access_token: T1_ACCESS_TOKEN } }
    );
    console.log('Subscribed to feed events');
  } catch (e) {
    console.error('Subscription error:', e.message);
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`Bot is running on http://localhost:${PORT}`);
});
