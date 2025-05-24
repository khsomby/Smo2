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
const activePosts = {}; // {postId: {commentReply: string, privateMessage: string}}
const userSessions = {}; // Temporary session storage

const PORT = 2008;

/* ===================== */
/* ADMIN NOTIFICATIONS   */
/* ===================== */

async function notifyAdmin(message) {
  try {
    for (const adminId of ADMIN_IDS) {
      await sendMessage(adminId, { text: message });
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
      const response = await axios.post(
        `https://graph.facebook.com/${API_VERSION}/me/subscribed_apps`,
        { subscribed_fields: ['feed'] },
        { params: { access_token: T1_ACCESS_TOKEN } }
      );
      await notifyAdmin('🔔 Successfully subscribed to feed changes');
    } else {
      await notifyAdmin('ℹ️ Already subscribed to feed changes');
    }
  } catch (error) {
    const errorMsg = `❌ Webhook subscription failed: ${error.response?.data?.error?.message || error.message}`;
    await notifyAdmin(errorMsg);
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
    await notifyAdmin(`🛑 Webhook processing failed: ${error.message}`);
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
    await notifyAdmin(`🛑 Error processing entry: ${error.message}`);
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
    if (message?.text && message.text.toLowerCase().trim() === '/start') {
      await showMainMenu(senderId);
      return;
    }

    // Handle postback from Get Started button
    if (event.postback?.payload === "GET_STARTED") {
      await showMainMenu(senderId);
      return;
    }

    // Handle numeric selections
    if (message?.text && userSessions[senderId]?.awaitingSelection) {
      await handleNumericSelection(senderId, message.text);
      return;
    }

    // Process text messages during active sessions
    if (message?.text && userSessions[senderId]) {
      await handleTextMessage(senderId, message.text);
      return;
    }

    // Default fallback to main menu
    await showMainMenu(senderId);
  } catch (error) {
    await notifyAdmin(`🛑 Message handling failed: ${error.message}`);
    await sendMessage(senderId, {text: "❌ An error occurred. Please try again."});
  }
}

/* ================== */
/* MENU SYSTEM        */
/* ================== */

async function showMainMenu(userId) {
  try {
    delete userSessions[userId]; // Clear any existing session
    
    await sendMessage(userId, {
      text: "🤖 *Auto-Reply Bot Main Menu*:\n\n" +
            "1. Add Auto-Reply Configuration\n" +
            "2. Stop Auto-Reply Configuration\n" +
            "3. List Active Configurations\n" +
            "4. Help\n\n" +
            "Reply with the number of your choice (1-4)"
    });
    
    // Set session state
    userSessions[userId] = {
      awaitingSelection: true,
      currentMenu: 'main',
      options: [
        { action: 'ADD_AUTO_REPLY' },
        { action: 'STOP_AUTO_REPLY' },
        { action: 'LIST_CONFIGS' },
        { action: 'HELP' }
      ]
    };
  } catch (error) {
    await notifyAdmin(`🛑 Failed to show menu: ${error.message}`);
  }
}

async function handleNumericSelection(userId, selection) {
  const session = userSessions[userId];
  if (!session?.awaitingSelection) return;

  const choice = parseInt(selection);
  if (isNaN(choice)) {
    await sendMessage(userId, {text: "⚠️ Please enter a valid number"});
    return;
  }

  const option = session.options[choice - 1];
  if (!option) {
    await sendMessage(userId, {text: "⚠️ Invalid selection. Please try again."});
    return;
  }

  // Clear selection state
  delete session.awaitingSelection;
  delete session.options;

  // Handle the selected action
  switch(option.action) {
    case 'ADD_AUTO_REPLY':
      await showPostSelection(userId);
      break;
    case 'STOP_AUTO_REPLY':
      await showActiveConfigurations(userId, true);
      break;
    case 'LIST_CONFIGS':
      await showActiveConfigurations(userId, false);
      break;
    case 'HELP':
      await sendHelpMessage(userId);
      break;
    default:
      await showMainMenu(userId);
  }
}

/* ================== */
/* CONFIGURATION FLOW */
/* ================== */

async function showPostSelection(userId) {
  try {
    const posts = await fetchRecentPosts();
    if (posts.length === 0) {
      await sendMessage(userId, {text: "ℹ️ No recent posts found."});
      return;
    }

    let messageText = "📝 *Select a post to configure*:\n\n";
    posts.forEach((post, index) => {
      messageText += `${index+1}. ${post.message?.substring(0, 50) || `Post ${post.id.substring(0, 8)}`}\n`;
    });
    messageText += "\nReply with the number of the post (1-10) or '0' to cancel";

    await sendMessage(userId, {text: messageText});

    // Set session state
    userSessions[userId] = {
      awaitingSelection: true,
      currentMenu: 'postSelection',
      options: posts.map(post => ({
        postId: post.id,
        action: 'SELECT_POST'
      }))
    };
  } catch (error) {
    await sendMessage(userId, {text: "❌ Failed to load posts. Please try again."});
  }
}

async function showActiveConfigurations(userId, forStopping = false) {
  try {
    const active = Object.entries(activePosts);

    if (active.length === 0) {
      await sendMessage(userId, {text: "ℹ️ No active configurations."});
      return;
    }

    let messageText = forStopping 
      ? "🛑 *Select configuration to stop*:\n\n"
      : "📋 *Active configurations*:\n\n";

    active.forEach(([postId, config], index) => {
      messageText += `${index+1}. Post ${postId.substring(0, 8)}\n` +
                    `   Public Reply: ${config.commentReply}\n` +
                    `   Private Message: ${config.privateMessage}\n\n`;
    });

    messageText += "Reply with the number to select (1-10) or '0' to cancel";

    await sendMessage(userId, {text: messageText});

    // Set session state
    userSessions[userId] = {
      awaitingSelection: true,
      currentMenu: forStopping ? 'stopConfig' : 'viewConfig',
      options: active.map(([postId]) => ({
        postId,
        action: forStopping ? 'STOP_CONFIG' : 'VIEW_CONFIG'
      }))
    };
  } catch (error) {
    await sendMessage(userId, {text: "❌ Failed to load configurations. Please try again."});
  }
}

async function handleTextMessage(userId, text) {
  const session = userSessions[userId];
  if (!session) return;

  switch(session.step) {
    case 'awaiting_comment_reply':
      session.commentReply = text;
      session.step = 'awaiting_private_message';
      await sendMessage(userId, {
        text: "📩 Enter the PRIVATE message that will be sent to users who comment:"
      });
      break;

    case 'awaiting_private_message':
      session.privateMessage = text;
      await confirmConfiguration(userId);
      break;

    case 'awaiting_confirmation':
      if (text.toLowerCase() === 'confirm') {
        await saveConfiguration(userId);
      } else {
        await sendMessage(userId, {text: "❌ Configuration cancelled."});
      }
      delete userSessions[userId];
      await showMainMenu(userId);
      break;
  }
}

async function confirmConfiguration(userId) {
  const session = userSessions[userId];
  await sendMessage(userId, {
    text: `🔍 *Confirm configuration for post ${session.postId}*:\n\n` +
          `💬 *Public Reply*: ${session.commentReply}\n\n` +
          `📩 *Private Message*: ${session.privateMessage}\n\n` +
          "Type 'confirm' to save or anything else to cancel."
  });
  session.step = 'awaiting_confirmation';
}

async function saveConfiguration(userId) {
  const session = userSessions[userId];
  activePosts[session.postId] = {
    commentReply: session.commentReply,
    privateMessage: session.privateMessage
  };
  await sendMessage(userId, {text: `✅ Auto-reply configured for post ${session.postId}`});
  await notifyAdmin(`📝 New configuration saved for post ${session.postId}`);
}

/* ================== */
/* COMMENT HANDLING   */
/* ================== */

async function processChange(change) {
  if (change.field === 'feed' && change.value.item === 'comment') {
    await handleComment(change.value);
  }
}

async function handleComment(commentData) {
  try {
    const postId = commentData.post_id;
    const config = activePosts[postId];
    if (!config) return;

    // Public reply
    if (config.commentReply) {
      await axios.post(
        `https://graph.facebook.com/${API_VERSION}/${commentData.comment_id}/comments`,
        { message: config.commentReply },
        { params: { access_token: T1_ACCESS_TOKEN } }
      );
    }

    // Private message
    if (config.privateMessage) {
      await sendMessage(commentData.from.id, {text: config.privateMessage});
    }
    
    await notifyAdmin(`💬 Replied to comment on post ${postId}`);
  } catch (error) {
    await notifyAdmin(`🛑 Failed to handle comment: ${error.message}`);
  }
}

/* ================== */
/* UTILITY FUNCTIONS  */
/* ================== */

async function sendMessage(userId, message) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/me/messages`,
      { recipient: {id: userId}, message },
      { params: { access_token: T2_ACCESS_TOKEN } }
    );
    return response.data;
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
    await notifyAdmin(`🛑 Failed to setup Get Started button: ${error.message}`);
  }
}

async function fetchRecentPosts() {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/me/posts`,
      {
        params: {
          access_token: T1_ACCESS_TOKEN,
          fields: 'id,message,created_time',
          limit: 10
        }
      }
    );
    return response.data.data;
  } catch (error) {
    await notifyAdmin(`🛑 Failed to fetch posts: ${error.message}`);
    return [];
  }
}

async function sendHelpMessage(userId) {
  await sendMessage(userId, {
    text: "🆘 *Help Guide*:\n\n" +
          "1. *Add Auto-Reply*: Set up automatic replies to post comments\n" +
          "2. *Stop Auto-Reply*: Remove existing configurations\n" +
          "3. *List Configs*: View your active auto-reply setups\n\n" +
          "For each configuration, you'll set:\n" +
          "- A public reply that appears under the comment\n" +
          "- A private message sent to the commenter\n\n" +
          "Use /start anytime to return to the main menu"
  });
  await showMainMenu(userId);
}

// Start the server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await notifyAdmin(`✅ Server started on port ${PORT}`);
  try {
    await setupWebhookSubscription();
    await setupGetStartedButton();
    await notifyAdmin('🟢 Initialization completed successfully');
  } catch (error) {
    await notifyAdmin(`🔴 Initialization failed: ${error.message}`);
  }
});