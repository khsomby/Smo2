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

// Auto-monitor the last post
let LAST_POST_ID = null;

const PORT = 2008;

// Startup sequence
notifyAdmin('🚀 Bot server is starting up...').then(async () => {
  try {
    // Initialize last post monitoring
    const posts = await fetchRecentPosts();
    if (posts && posts.length > 0) {
      LAST_POST_ID = posts[0].id;
      activePosts[LAST_POST_ID] = {
        keywords: [],
        commentReply: "Thanks for your comment! We'll get back to you soon.",
        privateMessage: "Thank you for engaging with our post! A team member will contact you shortly."
      };
      await notifyAdmin(`📌 Auto-monitoring last post: ${LAST_POST_ID}`);
    }

    app.listen(PORT, async () => {
      console.log(`Server running on port ${PORT}`);
      await notifyAdmin(`✅ Server started on port ${PORT}`);
      
      try {
        await setupWebhookSubscription();
        await setupGetStartedButton();
        await setupPersistentMenu();
        await notifyAdmin('🟢 Initialization completed successfully');
      } catch (error) {
        notifyAdmin(`🔴 Initialization failed: ${error.message}`);
      }
    });
  } catch (error) {
    notifyAdmin(`🔴 Startup failed: ${error.message}`);
  }
});

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
      
      await notifyAdmin('🔔 Successfully subscribed to feed changes');
      console.log('Subscription response:', response.data);
    } else {
      await notifyAdmin('ℹ️ Already subscribed to feed changes');
      console.log('Already subscribed to feed changes');
    }
  } catch (error) {
    const errorMsg = `❌ Webhook subscription failed: ${error.response?.data?.error?.message || error.message}`;
    console.error(errorMsg);
    await notifyAdmin(errorMsg);
    throw error;
  }
}

/* ================== */
/* WEBHOOK HANDLERS   */
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
    await notifyAdmin(`🛑 Webhook processing failed: ${error.message}`);
    res.status(500).send('ERROR_PROCESSING');
  }
});

/* ================== */
/* MESSAGE HANDLING   */
/* ================== */

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
    await notifyAdmin(`🛑 Error processing entry ${entry?.id}: ${error.message}`);
  }
}

async function handleMessage(event) {
  const senderId = event.sender.id;
  const message = event.message;

  if (!ADMIN_IDS.includes(senderId)) {
    console.log('Message from non-admin:', senderId);
    return;
  }

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

    // Process quick replies immediately
    if (message?.quick_reply?.payload) {
      await handleQuickReply(senderId, message.quick_reply.payload);
      return;
    }

    // Show menu for any other message when not in session
    if (!userSessions[senderId] && message?.text) {
      await showMainMenu(senderId);
      return;
    }

    // Process text messages only during active sessions
    if (message?.text && userSessions[senderId]) {
      await handleTextMessage(senderId, message.text);
      return;
    }
  } catch (error) {
    console.error('Message handling error:', error);
    await notifyAdmin(`🛑 Message handling failed: ${error.message}`);
    await showMainMenu(senderId);
  }
}

/* ================== */
/* MENU SYSTEM        */
/* ================== */

async function setupPersistentMenu() {
  try {
    await axios.post(
      `https://graph.facebook.com/${API_VERSION}/me/messenger_profile`,
      {
        persistent_menu: [
          {
            locale: 'default',
            composer_input_disabled: false,
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
          }
        ]
      },
      { params: { access_token: T2_ACCESS_TOKEN } }
    );
  } catch (error) {
    console.error('Persistent menu setup failed:', error);
  }
}

async function showMainMenu(userId) {
  try {
    await sendMessage(userId, {
      text: "🤖 Auto-Reply Bot Main Menu:",
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
        },
        {
          content_type: "text",
          title: "📌 Last Post Info",
          payload: "LAST_POST_INFO"
        }
      ]
    });
  } catch (error) {
    console.error('Failed to show menu:', error);
    await notifyAdmin(`🛑 Failed to show menu: ${error.message}`);
  }
}

async function sendHelpMessage(userId) {
  await sendMessage(userId, {
    text: "🆘 Help Guide:\n\n" +
          "1. Use /start or the menu button to show the main menu\n" +
          "2. Add Auto-Reply: Set up automatic replies to post comments\n" +
          "3. Stop Auto-Reply: Remove existing configurations\n" +
          "4. List Configs: View your active auto-reply setups\n" +
          "5. Last Post Info: View info about the most recent post\n\n" +
          "The bot automatically monitors the last post with default replies."
  });
  await showMainMenu(userId);
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
    else if (payload === "LAST_POST_INFO") {
      await sendLastPostInfo(userId);
    }
    else if (payload === "HELP") {
      await sendHelpMessage(userId);
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
      await sendMessage(userId, {text: `✅ Auto-reply stopped for post ${postId}`});
      await showMainMenu(userId);
    }
    else if (payload === "CANCEL") {
      delete userSessions[userId];
      await showMainMenu(userId);
    }
  } catch (error) {
    console.error('Quick reply error:', error);
    await notifyAdmin(`🛑 Quick reply handling failed: ${error.message}`);
    await showMainMenu(userId);
  }
}

/* ================== */
/* LAST POST HANDLING */
/* ================== */

async function sendLastPostInfo(userId) {
  try {
    const posts = await fetchRecentPosts();
    if (!posts || posts.length === 0) {
      await sendMessage(userId, {text: "ℹ️ No posts found."});
      return;
    }

    const lastPost = posts[0];
    const isMonitored = activePosts[lastPost.id] ? "✅ (Auto-monitored)" : "❌ (Not monitored)";
    
    await sendMessage(userId, {
      text: `📌 Last Post Info:\n\n` +
            `🆔 ID: ${lastPost.id}\n` +
            `📅 Created: ${new Date(lastPost.created_time).toLocaleString()}\n` +
            `📝 Content: ${lastPost.message?.substring(0, 100) || 'No text content'}\n` +
            `🔍 Status: ${isMonitored}`
    });

    if (activePosts[lastPost.id]) {
      const config = activePosts[lastPost.id];
      await sendMessage(userId, {
        text: `⚙️ Configuration:\n\n` +
              `🔤 Keywords: ${config.keywords?.join(', ') || 'All comments'}\n` +
              `💬 Public Reply: ${config.commentReply}\n` +
              `📩 Private Message: ${config.privateMessage}`
      });
    }

    await showMainMenu(userId);
  } catch (error) {
    console.error('Error getting last post info:', error);
    await sendMessage(userId, {text: "❌ Failed to get last post info"});
  }
}

/* ================== */
/* CONFIGURATION FLOW */
/* ================== */

async function showPostSelection(userId) {
  const posts = await fetchRecentPosts();
  if (posts.length === 0) {
    await sendMessage(userId, {text: "ℹ️ No recent posts found."});
    return;
  }

  userSessions[userId] = { step: 'selecting_post' };

  await sendMessage(userId, {
    text: "📝 Select a post to configure:",
    quick_replies: posts.map((post, index) => ({
      content_type: "text",
      title: `${index+1}. ${post.message?.substring(0, 20) || 'Post'}...`,
      payload: `SELECT_POST|${post.id}`
    })).concat([{
      content_type: "text",
      title: "❌ Cancel",
      payload: "CANCEL"
    }])
  });
}

async function askForKeywords(userId) {
  userSessions[userId].step = 'awaiting_keywords';
  await sendMessage(userId, {
    text: "🔤 Enter keywords (comma separated) that will trigger replies, or click 'Empty' to reply to all comments:",
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
    text: "💬 Enter the PUBLIC reply that will appear under matching comments:"
  });
}

async function askForPrivateMessage(userId) {
  userSessions[userId].step = 'awaiting_private_message';
  await sendMessage(userId, {
    text: "📩 Enter the PRIVATE message that will be sent to users who comment:"
  });
}

async function handleTextMessage(userId, text) {
  const session = userSessions[userId];
  if (!session) return;

  switch(session.step) {
    case 'awaiting_keywords':
      session.keywords = text.toLowerCase() === 'empty' ? [] : 
                       text.split(',').map(k => k.trim().toLowerCase());
      await askForCommentReply(userId);
      break;

    case 'awaiting_comment_reply':
      session.commentReply = text;
      await askForPrivateMessage(userId);
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
    text: `🔍 Confirm configuration for post ${session.postId}:\n\n` +
          `🔤 Keywords: ${session.keywords?.join(', ') || 'All comments'}\n` +
          `💬 Public Reply: ${session.commentReply}\n` +
          `📩 Private Message: ${session.privateMessage}\n\n` +
          "Type 'confirm' to save or anything else to cancel."
  });
  session.step = 'awaiting_confirmation';
}

async function saveConfiguration(userId) {
  const session = userSessions[userId];
  activePosts[session.postId] = {
    keywords: session.keywords,
    commentReply: session.commentReply,
    privateMessage: session.privateMessage
  };
  await sendMessage(userId, {text: `✅ Auto-reply configured for post ${session.postId}`});
  await notifyAdmin(`📝 New configuration saved for post ${session.postId}`);
}

/* ================== */
/* POST HANDLING      */
/* ================== */

async function fetchRecentPosts() {
  try {
    const response = await axios.get(`https://graph.facebook.com/${API_VERSION}/me/posts`, {
      params: {
        access_token: T1_ACCESS_TOKEN,
        fields: 'id,message,created_time',
        limit: 5
      }
    });
    return response.data.data;
  } catch (error) {
    console.error("Error fetching posts:", error.response?.data);
    await notifyAdmin(`🛑 Failed to fetch posts: ${error.message}`);
    return [];
  }
}

async function showActiveConfigurations(userId, forStopping = false) {
  const active = Object.entries(activePosts)
    .filter(([_, config]) => config.commentReply || config.privateMessage);

  if (active.length === 0) {
    await sendMessage(userId, {text: "ℹ️ No active configurations."});
    return;
  }

  const quickReplies = active.map(([postId, _], index) => ({
    content_type: "text",
    title: `${index+1}. Post ${postId.substring(0, 8)}...`,
    payload: forStopping ? `STOP_CONFIG|${postId}` : `VIEW_CONFIG|${postId}`
  }));

  await sendMessage(userId, {
    text: forStopping ? "🛑 Select configuration to stop:" : "📋 Active configurations:",
    quick_replies: quickReplies.concat([{
      content_type: "text",
      title: "❌ Cancel",
      payload: "CANCEL"
    }])
  });
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
      
      await notifyAdmin(`💬 Replied to comment on post ${postId}`);
    }
  } catch (error) {
    console.error('Comment handling error:', error);
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
    await notifyAdmin(`🛑 Failed to send message to ${userId}: ${error.message}`);
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
    await notifyAdmin(`🛑 Failed to setup Get Started button: ${error.message}`);
    throw error;
  }
}

// Health check with last post verification
setInterval(async () => {
  try {
    const posts = await fetchRecentPosts();
    const currentLastPost = posts?.[0]?.id;
    
    if (currentLastPost && currentLastPost !== LAST_POST_ID) {
      LAST_POST_ID = currentLastPost;
      if (!activePosts[LAST_POST_ID]) {
        activePosts[LAST_POST_ID] = {
          keywords: [],
          commentReply: "Thanks for your comment! We'll get back to you soon.",
          privateMessage: "Thank you for engaging with our post! A team member will contact you shortly."
        };
        await notifyAdmin(`🔄 New last post detected and auto-monitored: ${LAST_POST_ID}`);
      }
    }

    const subs = await checkSubscriptionStatus();
    await notifyAdmin(`🩺 Health Check:\nSubscriptions: ${subs.join(', ')}\nActive posts: ${Object.keys(activePosts).length}\nLast post: ${LAST_POST_ID}`);
  } catch (error) {
    await notifyAdmin(`🛑 Health Check Failed: ${error.message}`);
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
    await notifyAdmin(`🛑 Subscription check failed: ${error.message}`);
    return [];
  }
}