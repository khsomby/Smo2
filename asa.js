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
const ADMIN_ID = '6881956545251284'; // Your Facebook user ID

// Data storage
const activePosts = {};
const userSessions = {};
let LAST_POST_ID = null;

const PORT = 2008;

// Startup
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await notifyAdmin('🚀 Bot server started');
  
  try {
    // Initialize last post monitoring
    const posts = await fetchRecentPosts();
    if (posts?.length > 0) {
      LAST_POST_ID = posts[0].id;
      activePosts[LAST_POST_ID] = {
        keywords: [],
        commentReply: "Thanks for your comment!",
        privateMessage: "We received your comment and will respond soon."
      };
      await notifyAdmin(`📌 Auto-monitoring last post: ${LAST_POST_ID}`);
    }

    await setupWebhookSubscription();
    await setupGetStartedButton();
    await setupPersistentMenu();
    await notifyAdmin('🟢 Bot is fully operational');
  } catch (error) {
    await notifyAdmin(`🔴 Initialization failed: ${error.message}`);
  }
});

/* =============== */
/* CORE FUNCTIONS  */
/* =============== */

async function notifyAdmin(message) {
  try {
    await sendMessage(ADMIN_ID, { text: message });
  } catch (error) {
    console.error('Failed to notify admin:', error);
  }
}

async function setupWebhookSubscription() {
  try {
    await axios.post(
      `https://graph.facebook.com/${API_VERSION}/me/subscribed_apps`,
      { subscribed_fields: ['feed'] },
      { params: { access_token: T1_ACCESS_TOKEN } }
    );
  } catch (error) {
    await notifyAdmin(`❌ Webhook setup failed: ${error.message}`);
    throw error;
  }
}

/* =============== */
/* WEBHOOK ROUTES  */
/* =============== */

app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && 
      req.query['hub.verify_token'] === VERIFY_TOKEN) {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  try {
    if (req.body.object === 'page') {
      await Promise.all(req.body.entry.map(processEntry));
      res.status(200).send('EVENT_RECEIVED');
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    await notifyAdmin(`🛑 Webhook error: ${error.message}`);
    res.status(500).send('ERROR_PROCESSING');
  }
});

/* =============== */
/* MESSAGE HANDLER */
/* =============== */

async function processEntry(entry) {
  if (entry.messaging) await handleMessage(entry.messaging[0]);
  if (entry.changes) await Promise.all(entry.changes.map(processChange));
}

async function handleMessage(event) {
  if (event.sender.id != ADMIN_ID) return;

  try {
    // Handle /start command
    if (event.message?.text?.toLowerCase().trim() === '/start') {
      return showMainMenu(ADMIN_ID);
    }

    // Handle Get Started button
    if (event.postback?.payload === "GET_STARTED") {
      return showMainMenu(ADMIN_ID);
    }

    // Handle quick replies
    if (event.message?.quick_reply?.payload) {
      return handleQuickReply(ADMIN_ID, event.message.quick_reply.payload);
    }

    // Handle text in sessions
    if (event.message?.text && userSessions[ADMIN_ID]) {
      return handleTextMessage(ADMIN_ID, event.message.text);
    }

    // Default to main menu
    await showMainMenu(ADMIN_ID);
  } catch (error) {
    await notifyAdmin(`💥 Error: ${error.message}`);
    await showMainMenu(ADMIN_ID);
  }
}

/* =============== */
/* MENU SYSTEM     */
/* =============== */

async function setupPersistentMenu() {
  await axios.post(
    `https://graph.facebook.com/${API_VERSION}/me/messenger_profile`,
    {
      persistent_menu: [{
        locale: 'default',
        call_to_actions: [
          {
            type: 'postback',
            title: '🏠 Main Menu',
            payload: 'GET_STARTED'
          },
          {
            type: 'postback',
            title: '🆘 Help',
            payload: 'HELP'
          }
        ]
      }]
    },
    { params: { access_token: T2_ACCESS_TOKEN } }
  );
}

async function showMainMenu(userId) {
  await sendMessage(userId, {
    text: "🤖 Auto-Reply Bot Menu:",
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
}

/* =============== */
/* CORE FEATURES   */
/* =============== */

async function handleQuickReply(userId, payload) {
  try {
    switch(payload) {
      case "ADD_AUTO_REPLY":
        return showPostSelection(userId);
      case "STOP_AUTO_REPLY":
        return showActiveConfigurations(userId, true);
      case "LIST_CONFIGS":
        return showActiveConfigurations(userId, false);
      case "HELP":
        return sendHelpMessage(userId);
      case "EMPTY_KEYWORDS":
        userSessions[userId] = { 
          ...userSessions[userId], 
          keywords: [],
          step: 'awaiting_comment_reply'
        };
        return askForCommentReply(userId);
      default:
        if (payload.startsWith("SELECT_POST|")) {
          const postId = payload.split("|")[1];
          userSessions[userId] = { postId, step: 'awaiting_keywords' };
          return askForKeywords(userId);
        }
        if (payload.startsWith("STOP_CONFIG|")) {
          const postId = payload.split("|")[1];
          delete activePosts[postId];
          await sendMessage(userId, {text: `✅ Stopped auto-reply for post ${postId}`});
          return showMainMenu(userId);
        }
        if (payload === "CANCEL") {
          delete userSessions[userId];
          return showMainMenu(userId);
        }
    }
  } catch (error) {
    await notifyAdmin(`💥 Quick reply error: ${error.message}`);
    await showMainMenu(userId);
  }
}

async function sendHelpMessage(userId) {
  await sendMessage(userId, {
    text: "🆘 Help Guide:\n\n" +
          "/start - Show main menu\n" +
          "Add Auto-Reply - Setup automatic replies\n" +
          "Stop Auto-Reply - Remove configurations\n" +
          "List Configs - View active auto-replies"
  });
  await showMainMenu(userId);
}

/* =============== */
/* POST HANDLING   */
/* =============== */

async function fetchRecentPosts() {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/me/posts`,
      { 
        params: { 
          access_token: T1_ACCESS_TOKEN,
          fields: 'id,message,created_time',
          limit: 5
        }
      }
    );
    return response.data.data;
  } catch (error) {
    await notifyAdmin(`❌ Failed to fetch posts: ${error.message}`);
    return [];
  }
}

async function showPostSelection(userId) {
  const posts = await fetchRecentPosts();
  if (!posts.length) {
    return sendMessage(userId, {text: "ℹ️ No recent posts found."});
  }

  userSessions[userId] = { step: 'selecting_post' };

  await sendMessage(userId, {
    text: "Select a post to configure:",
    quick_replies: [
      ...posts.map((post, i) => ({
        content_type: "text",
        title: `Post ${i+1}`,
        payload: `SELECT_POST|${post.id}`
      })),
      {
        content_type: "text",
        title: "❌ Cancel",
        payload: "CANCEL"
      }
    ]
  });
}

/* =============== */
/* CONFIGURATION   */
/* =============== */

async function askForKeywords(userId) {
  userSessions[userId].step = 'awaiting_keywords';
  await sendMessage(userId, {
    text: "🔤 Enter keywords (comma separated) or click 'Empty' for all comments:",
    quick_replies: [{
      content_type: "text",
      title: "Empty",
      payload: "EMPTY_KEYWORDS"
    }]
  });
}

async function askForCommentReply(userId) {
  userSessions[userId].step = 'awaiting_comment_reply';
  await sendMessage(userId, {
    text: "💬 Enter public reply for comments:"
  });
}

async function askForPrivateMessage(userId) {
  userSessions[userId].step = 'awaiting_private_message';
  await sendMessage(userId, {
    text: "📩 Enter private message to send:"
  });
}

async function handleTextMessage(userId, text) {
  const session = userSessions[userId];
  if (!session) return;

  switch(session.step) {
    case 'awaiting_keywords':
      session.keywords = text === 'empty' ? [] : 
                       text.split(',').map(k => k.trim().toLowerCase());
      return askForCommentReply(userId);
      
    case 'awaiting_comment_reply':
      session.commentReply = text;
      return askForPrivateMessage(userId);
      
    case 'awaiting_private_message':
      session.privateMessage = text;
      return confirmConfiguration(userId);
      
    case 'awaiting_confirmation':
      if (text.toLowerCase() === 'confirm') {
        await saveConfiguration(userId);
      } else {
        await sendMessage(userId, {text: "❌ Configuration cancelled"});
      }
      delete userSessions[userId];
      return showMainMenu(userId);
  }
}

async function confirmConfiguration(userId) {
  const { postId, keywords, commentReply, privateMessage } = userSessions[userId];
  await sendMessage(userId, {
    text: `⚠️ Confirm configuration for post ${postId}:\n\n` +
          `Keywords: ${keywords?.join(', ') || 'All'}\n` +
          `Public Reply: ${commentReply}\n` +
          `Private Message: ${privateMessage}\n\n` +
          "Type 'confirm' to save or anything else to cancel."
  });
  userSessions[userId].step = 'awaiting_confirmation';
}

async function saveConfiguration(userId) {
  const { postId, keywords, commentReply, privateMessage } = userSessions[userId];
  activePosts[postId] = { keywords, commentReply, privateMessage };
  await sendMessage(userId, {text: `✅ Auto-reply configured for post ${postId}`});
  await notifyAdmin(`📝 New config for post ${postId}`);
}

/* =============== */
/* COMMENT HANDLER */
/* =============== */

async function processChange(change) {
  if (change.field === 'feed' && change.value.item === 'comment') {
    const { post_id, comment_id, from, message } = change.value;
    const config = activePosts[post_id];
    
    if (!config) return;

    const shouldReply = !config.keywords.length || 
                      config.keywords.some(kw => 
                        message.toLowerCase().includes(kw.toLowerCase()));

    if (shouldReply) {
      try {
        // Public reply
        if (config.commentReply) {
          await axios.post(
            `https://graph.facebook.com/${API_VERSION}/${comment_id}/comments`,
            { message: config.commentReply },
            { params: { access_token: T1_ACCESS_TOKEN } }
          );
        }

        // Private message
        if (config.privateMessage) {
          await sendMessage(from.id, { text: config.privateMessage });
        }

        await notifyAdmin(`💬 Replied to comment on post ${post_id}`);
      } catch (error) {
        await notifyAdmin(`❌ Failed to reply: ${error.message}`);
      }
    }
  }
}

/* =============== */
/* UTILITIES       */
/* =============== */

async function sendMessage(userId, message) {
  try {
    await axios.post(
      `https://graph.facebook.com/${API_VERSION}/me/messages`,
      {
        recipient: { id: userId },
        message
      },
      { params: { access_token: T2_ACCESS_TOKEN } }
    );
  } catch (error) {
    console.error("Messaging error:", error.response?.data);
    throw error;
  }
}

async function setupGetStartedButton() {
  await axios.post(
    `https://graph.facebook.com/${API_VERSION}/me/messenger_profile`,
    { get_started: { payload: "GET_STARTED" } },
    { params: { access_token: T2_ACCESS_TOKEN } }
  );
}

// Health monitoring
setInterval(async () => {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/me/subscribed_apps`,
      { params: { access_token: T1_ACCESS_TOKEN } }
    );
    const subs = response.data.data[0]?.subscribed_fields || [];
    await notifyAdmin(`🩺 Health Check\nActive posts: ${Object.keys(activePosts).length}\nSubscriptions: ${subs.join(', ')}`);
  } catch (error) {
    await notifyAdmin(`⚠️ Health check failed: ${error.message}`);
  }
}, 21600000); // 6 hours