require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// Configuration
const T1_ACCESS_TOKEN = process.env.T1; // For feed/comments
const T2_ACCESS_TOKEN = process.env.T2; // For messaging
const VERIFY_TOKEN = "somby";
const API_VERSION = 'v18.0';

// Hardcoded admin IDs
const ADMIN_IDS = ['6881956545251284'];

// Data storage
const activePosts = {};
const userSessions = {};

const PORT = 2008;

// Startup notification
notifyAdmin('Bot server is starting up...').then(() => {
  app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await notifyAdmin(`Server started on port ${PORT}`);
    try {
      await setupWebhookSubscription();
      await setupGetStartedButton();
      await notifyAdmin('Initialization completed successfully');
    } catch (error) {
      notifyAdmin(`Initialization failed: ${error.message}`);
    }
  });
});

/* ===================== */
/* ADMIN NOTIFICATIONS   */
/* ===================== */

async function notifyAdmin(message) {
  try {
    for (const adminId of ADMIN_IDS) {
      await sendMessage(adminId, { text: `[SYSTEM] ${message}` });
    }
  } catch (error) {
    console.error('Failed to notify admin:', error);
  }
}

/* ===================== */
/* WEBHOOK SUBSCRIPTIONS */
/* ===================== */

async function setupWebhookSubscription() {
  try {
    const current = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/me/subscribed_apps`,
      { params: { access_token: T1_ACCESS_TOKEN } }
    );

    if (!current.data.data?.length || !current.data.data[0].subscribed_fields.includes('feed')) {
      await axios.post(
        `https://graph.facebook.com/${API_VERSION}/me/subscribed_apps`,
        { subscribed_fields: ['feed'] },
        { params: { access_token: T1_ACCESS_TOKEN } }
      );
      await notifyAdmin('Successfully subscribed to feed changes');
    }
  } catch (error) {
    await notifyAdmin(`Webhook subscription failed: ${error.message}`);
    throw error;
  }
}

/* ================== */
/* WEBHOOK HANDLERS   */
/* ================== */

app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object === 'page') {
      await Promise.all(body.entry.map(processEntry));
      res.status(200).send('EVENT_RECEIVED');
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    await notifyAdmin(`Webhook processing failed: ${error.message}`);
    res.status(500).send('ERROR_PROCESSING');
  }
});

async function processEntry(entry) {
  try {
    if (entry.messaging) {
      await handleMessage(entry.messaging[0]);
    }
    if (entry.changes) {
      await Promise.all(entry.changes.map(processChange));
    }
  } catch (error) {
    await notifyAdmin(`Error processing entry: ${error.message}`);
  }
}

/* ================== */
/* MESSAGE HANDLING   */
/* ================== */

async function handleMessage(event) {
  const senderId = event.sender.id;
  const message = event.message;

  if (!ADMIN_IDS.includes(senderId)) return;

  try {
    // Handle /start command
    if (message?.text && message.text.toLowerCase() === '/start') {
      await showMainMenu(senderId);
      return;
    }

    // Handle quick replies
    if (message?.quick_reply?.payload) {
      await handleQuickReply(senderId, message.quick_reply.payload);
      return;
    }

    // Handle get started button
    if (event.postback?.payload === "GET_STARTED") {
      await showMainMenu(senderId);
      return;
    }

    // Handle text messages during active sessions
    if (message?.text && userSessions[senderId]) {
      await handleTextMessage(senderId, message.text);
      return;
    }

    // Default fallback
    await showMainMenu(senderId);
  } catch (error) {
    await notifyAdmin(`Message handling failed: ${error.message}`);
  }
}

/* ================== */
/* MENU SYSTEM        */
/* ================== */

async function showMainMenu(userId) {
  try {
    await sendMessage(userId, {
      text: "Main Menu:",
      quick_replies: [
        {
          content_type: "text",
          title: "➕ Add Auto-Reply",
          payload: "ADD_AUTO_REPLY"
        },
        {
          content_type: "text",
          title: "🛑 Stop Auto-Reply",
          payload: "STOP_AUTO_REPLY"
        },
        {
          content_type: "text",
          title: "📋 List Configs",
          payload: "LIST_CONFIGS"
        }
      ]
    });
    await notifyAdmin(`Main menu shown to user ${userId}`);
  } catch (error) {
    await notifyAdmin(`Failed to show menu to ${userId}: ${error.message}`);
  }
}

/* ================== */
/* QUICK REPLY HANDLER */
/* ================== */

async function handleQuickReply(userId, payload) {
  try {
    if (payload === "ADD_AUTO_REPLY") {
      await showPostSelection(userId);
    } 
    else if (payload === "STOP_AUTO_REPLY") {
      await showActiveConfigurations(userId, true);
    }
    else if (payload === "LIST_CONFIGS") {
      await showActiveConfigurations(userId, false);
    }
    else if (payload.startsWith("SELECT_POST|")) {
      const postId = payload.split("|")[1];
      userSessions[userId] = { postId, step: 'awaiting_keywords' };
      await askForKeywords(userId);
    }
    else if (payload === "EMPTY_KEYWORDS") {
      userSessions[userId].keywords = [];
      userSessions[userId].step = 'awaiting_comment_reply';
      await askForCommentReply(userId);
    }
    else if (payload.startsWith("STOP_CONFIG|")) {
      const postId = payload.split("|")[1];
      delete activePosts[postId];
      await sendMessage(userId, {text: `Auto-reply stopped for post ${postId}`});
      await showMainMenu(userId);
    }
    else if (payload === "CANCEL") {
      delete userSessions[userId];
      await showMainMenu(userId);
    }
  } catch (error) {
    await notifyAdmin(`Quick reply handling failed: ${error.message}`);
    await showMainMenu(userId);
  }
}

/* ================== */
/* UTILITY FUNCTIONS  */
/* ================== */

async function sendMessage(userId, message) {
  try {
    await axios.post(
      `https://graph.facebook.com/${API_VERSION}/me/messages`,
      { recipient: {id: userId}, message },
      { params: { access_token: T2_ACCESS_TOKEN } }
    );
  } catch (error) {
    console.error("Messaging error:", error.response?.data);
    throw error;
  }
}

async function setupGetStartedButton() {
  try {
    await axios.post(
      `https://graph.facebook.com/${API_VERSION}/me/messenger_profile`,
      { get_started: { payload: "GET_STARTED" } },
      { params: { access_token: T2_ACCESS_TOKEN } }
    );
  } catch (error) {
    await notifyAdmin(`Get Started setup failed: ${error.message}`);
    throw error;
  }
}

// ... (keep all other existing functions like processChange, handleComment, etc.)