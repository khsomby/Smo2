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
const activePosts = {}; // {postId: {keywords: [], commentReply: string, privateMessage: string}}
const userSessions = {}; // Temporary session storage

// Setup
const PORT = 2008;

// 1. FIRST: Send startup notification to admin
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
      console.error('Initialization error:', error);
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
    // First check current subscriptions
    const current = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/me/subscribed_apps`,
      { params: { access_token: T1_ACCESS_TOKEN } }
    );

    // Only subscribe if not already subscribed
    if (!current.data.data?.length || !current.data.data[0].subscribed_fields.includes('feed')) {
      const response = await axios.post(
        `https://graph.facebook.com/${API_VERSION}/me/subscribed_apps`,
        { subscribed_fields: ['feed'] },
        { params: { access_token: T1_ACCESS_TOKEN } }
      );
      
      await notifyAdmin('Successfully subscribed to feed changes');
      console.log('Subscription response:', response.data);
    } else {
      await notifyAdmin('Already subscribed to feed changes');
      console.log('Already subscribed to feed changes');
    }
  } catch (error) {
    const errorMsg = `Webhook subscription failed: ${error.response?.data?.error?.message || error.message}`;
    console.error(errorMsg);
    await notifyAdmin(errorMsg);
    throw error;
  }
}

/* ================== */
/* CORE FUNCTIONALITY */
/* ================== */

// Webhook verification
app.get('/webhook', (req, res) => {
  console.log('Verification attempt:', req.query);
  if (req.query['hub.mode'] === 'subscribe') {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
      console.log('Webhook verified');
      res.status(200).send(req.query['hub.challenge']);
    } else {
      console.error('Failed verification. Invalid verify token');
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(200);
  }
});

// Webhook handler
app.post('/webhook', async (req, res) => {
  console.log('Webhook received:', JSON.stringify(req.body, null, 2));
  
  try {
    const body = req.body;
    if (body.object === 'page') {
      await Promise.all(body.entry.map(processEntry));
      res.status(200).send('EVENT_RECEIVED');
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
    await notifyAdmin(`Webhook processing failed: ${error.message}`);
    res.status(500).send('ERROR_PROCESSING');
  }
});

// Process entry
async function processEntry(entry) {
  try {
    console.log('Processing entry:', entry.id);
    
    // Handle messaging events
    if (entry.messaging) {
      await handleMessage(entry.messaging[0]);
    }

    // Handle feed changes (comments)
    if (entry.changes) {
      await Promise.all(entry.changes.map(processChange));
    }
  } catch (error) {
    console.error('Error processing entry:', error);
    await notifyAdmin(`Error processing entry ${entry?.id}: ${error.message}`);
  }
}

/* ============== */
/* POST HANDLING  */
/* ============== */

async function fetchRecentPosts() {
  try {
    const response = await axios.get(`https://graph.facebook.com/${API_VERSION}/me/posts`, {
      params: {
        access_token: T1_ACCESS_TOKEN,
        fields: 'id,message,created_time',
        limit: 10
      }
    });
    return response.data.data;
  } catch (error) {
    console.error("Error fetching posts:", error.response?.data);
    await notifyAdmin(`Failed to fetch posts: ${error.message}`);
    return [];
  }
}

/* ================== */
/* MESSAGE HANDLING   */
/* ================== */

async function handleMessage(event) {
  const senderId = event.sender.id;
  const message = event.message;

  if (!ADMIN_IDS.includes(senderId)) {
    console.log('Message from non-admin:', senderId);
    return;
  }

  try {
    // Process quick replies immediately
    if (message?.quick_reply?.payload) {
      await handleQuickReply(senderId, message.quick_reply.payload);
      return;
    }

    // Show menu for any other message when not in session
    if (!userSessions[senderId] && (event.postback?.payload === "GET_STARTED" || message)) {
      await showMainMenu(senderId);
      return;
    }

    // Process text messages only during active sessions
    if (message?.text && userSessions[senderId]) {
      await handleTextMessage(senderId, message.text);
    }
  } catch (error) {
    console.error('Message handling error:', error);
    await notifyAdmin(`Message handling failed: ${error.message}`);
  }
}

/* ============= */
/* CORE FEATURES */
/* ============= */

async function handleComment(commentData) {
  try {
    const postId = commentData.post_id;
    const config = activePosts[postId];
    if (!config) return;

    const commentText = commentData.message.toLowerCase();
    const shouldReply = config.keywords.length === 0 || 
                      config.keywords.some(kw => commentText.includes(kw));

    if (shouldReply) {
      // Public reply (T1)
      if (config.commentReply) {
        await axios.post(`https://graph.facebook.com/${API_VERSION}/${commentData.comment_id}/comments`, {
          message: config.commentReply
        }, {
          params: { access_token: T1_ACCESS_TOKEN }
        });
      }

      // Private message (T2)
      if (config.privateMessage) {
        await sendMessage(commentData.from.id, {text: config.privateMessage});
      }
      
      await notifyAdmin(`Replied to comment on post ${postId}`);
    }
  } catch (error) {
    console.error('Comment handling error:', error);
    await notifyAdmin(`Failed to handle comment: ${error.message}`);
  }
}

/* ============ */
/* UTILITIES    */
/* ============ */

async function sendMessage(userId, message) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/me/messages`,
      {
        recipient: {id: userId},
        message
      },
      {
        params: {access_token: T2_ACCESS_TOKEN}
      }
    );
    return response.data;
  } catch (error) {
    console.error("Messaging error:", error.response?.data);
    await notifyAdmin(`Failed to send message to ${userId}: ${error.message}`);
    throw error;
  }
}

async function setupGetStartedButton() {
  try {
    await axios.post(`https://graph.facebook.com/${API_VERSION}/me/messenger_profile`, {
      get_started: {payload: "GET_STARTED"}
    }, {
      params: {access_token: T2_ACCESS_TOKEN}
    });
    console.log('Get Started button set up');
  } catch (error) {
    console.error("Get Started setup failed:", error.response?.data);
    await notifyAdmin(`Failed to setup Get Started button: ${error.message}`);
    throw error;
  }
}

// ... (keep all other existing functions like showMainMenu, handleQuickReply, etc.)

// Add periodic health check
setInterval(async () => {
  try {
    const subs = await checkSubscriptionStatus();
    await notifyAdmin(`[Health Check] Subscriptions active: ${subs.join(', ')} | Active posts: ${Object.keys(activePosts).length}`);
  } catch (error) {
    await notifyAdmin(`[Health Check Failed] ${error.message}`);
  }
}, 6 * 60 * 60 * 1000); // Every 6 hours

async function checkSubscriptionStatus() {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/me/subscribed_apps`,
      { params: { access_token: T1_ACCESS_TOKEN } }
    );
    return response.data.data[0]?.subscribed_fields || [];
  } catch (error) {
    console.error('Error checking subscription status:', error);
    await notifyAdmin(`Subscription check failed: ${error.message}`);
    return [];
  }
}