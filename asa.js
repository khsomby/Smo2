require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const T1_ACCESS_TOKEN = process.env.T1;
const T2_ACCESS_TOKEN = process.env.T2;
const VERIFY_TOKEN = "somby";
const API_VERSION = 'v21.0';

const activePosts = {};
const userSessions = {};
let ADMIN_IDS = [];

// Setup
const PORT = 2008;
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await initializeAdmins();
    await setupGetStartedButton();
    await subscribeToWebhooks();
    console.log('Bot is fully initialized and ready');
});

/* ====================== */
/* ADMIN INITIALIZATION   */
/* ====================== */

async function initializeAdmins() {
    try {
        const response = await axios.get(`https://graph.facebook.com/${API_VERSION}/me/roles`, {
            params: { access_token: T2_ACCESS_TOKEN }
        });
        
        // Process the exact response format you provided
        ADMIN_IDS = response.data.data
            .filter(user => user.is_active)
            .map(user => user.id);
            
        console.log('Initialized admins:', ADMIN_IDS);
        
        // Fallback if no admins found
        if (ADMIN_IDS.length === 0) {
            ADMIN_IDS = ['24077134331911701']; // Your hardcoded admin
            console.log('Using fallback admin ID');
        }
    } catch (error) {
        console.error('Error fetching admins:', error.response?.data);
        // Fallback to hardcoded admin if API fails
        ADMIN_IDS = ['24077134331911701'];
        console.log('Using fallback admin ID due to error');
    }
}

/* ====================== */
/* WEBHOOK IMPLEMENTATION */
/* ====================== */

async function subscribeToWebhooks() {
    try {
        await axios.post(`https://graph.facebook.com/${API_VERSION}/me/subscribed_apps`, {
            subscribed_fields: ['feed', 'messages'],
            access_token: T1_ACCESS_TOKEN
        });
        console.log('Successfully subscribed to webhooks');
    } catch (error) {
        console.error('Error subscribing to webhooks:', error.response?.data);
    }
}

app.get('/webhook', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});

app.post('/webhook', async (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        for (const entry of body.entry) {
            // Handle messaging events
            if (entry.messaging) {
                await handleMessage(entry.messaging[0]);
            }
            
            // Handle feed changes
            if (entry.changes) {
                for (const change of entry.changes) {
                    if (change.field === 'feed') {
                        await processFeedChange(change.value);
                    }
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

async function processFeedChange(change) {
    if (change.item === 'comment' && change.verb === 'add') {
        console.log('New comment detected:', change);
        await handleComment({
            post_id: change.post_id,
            comment_id: change.comment_id,
            message: change.message,
            from: change.from
        });
    }
}

/* ================== */
/* COMMENT HANDLING   */
/* ================== */

async function handleComment(commentData) {
    try {
        const postId = commentData.post_id;
        const config = activePosts[postId];
        
        if (!config) {
            console.log(`No config found for post ${postId}`);
            return;
        }

        const commentText = commentData.message.toLowerCase();
        const shouldReply = config.keywords.length === 0 || 
                         config.keywords.some(kw => commentText.includes(kw.toLowerCase()));

        if (shouldReply) {
            console.log(`Processing comment on post ${postId}`);
            
            // 1. Send public reply
            if (config.commentReply) {
                try {
                    await axios.post(`https://graph.facebook.com/${API_VERSION}/${commentData.comment_id}/comments`, {
                        message: config.commentReply
                    }, {
                        params: { access_token: T1_ACCESS_TOKEN }
                    });
                    console.log(`Public reply sent to comment ${commentData.comment_id}`);
                } catch (error) {
                    console.error('Error sending public reply:', error.response?.data);
                }
            }

            // 2. Send private message
            if (config.privateMessage) {
                await sendPrivateMessage(commentData.from.id, config.privateMessage, postId);
            }
        }
    } catch (error) {
        console.error('Error handling comment:', error.response?.data || error.message);
    }
}

async function sendPrivateMessage(userId, messageText, postId) {
    try {
        // Try with message tags first
        const response = await axios.post(`https://graph.facebook.com/${API_VERSION}/me/messages`, {
            recipient: {id: userId},
            message: {text: messageText},
            messaging_type: "MESSAGE_TAG",
            tag: "COMMUNITY_ALERT"
        }, {
            params: {access_token: T2_ACCESS_TOKEN}
        });
        
        console.log(`Private message sent to ${userId} for post ${postId}`);
        return response.data;
    } catch (error) {
        console.error("Primary message failed:", error.response?.data);
        
        // Fallback to standard message
        try {
            const response = await axios.post(`https://graph.facebook.com/${API_VERSION}/me/messages`, {
                recipient: {id: userId},
                message: {text: messageText}
            }, {
                params: {access_token: T2_ACCESS_TOKEN}
            });
            console.log(`Fallback private message sent to ${userId}`);
            return response.data;
        } catch (fallbackError) {
            console.error("Fallback messaging failed:", fallbackError.response?.data);
            throw fallbackError;
        }
    }
}

/* ================== */
/* ADMIN FLOW         */
/* ================== */

async function handleMessage(event) {
    const senderId = event.sender.id;
    const message = event.message;

    // Check if user is admin
    if (!ADMIN_IDS.includes(senderId)) {
        console.log(`Unauthorized access attempt by ${senderId}`);
        await sendMessage(senderId, {text: "You don't have permission to use this bot."});
        return;
    }

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
}

async function handleQuickReply(userId, payload) {
    console.log(`Processing quick reply: ${payload}`);
    
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
        userSessions[userId] = {
            postId,
            step: 'awaiting_keywords'
        };
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
    else {
        console.log(`Unknown quick reply payload: ${payload}`);
        await showMainMenu(userId);
    }
}

/* ================== */
/* CONFIGURATION FLOW */
/* ================== */

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
        return [];
    }
}

async function showPostSelection(userId) {
    const posts = await fetchRecentPosts();
    if (posts.length === 0) {
        await sendMessage(userId, {text: "No recent posts found."});
        return;
    }

    userSessions[userId] = { step: 'selecting_post' };

    await sendMessage(userId, {
        text: "Select a post to configure:",
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
        text: "Enter keywords (comma separated) or 'empty' for all comments:",
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
        text: "Enter public reply for comments:"
    });
}

async function askForPrivateMessage(userId) {
    userSessions[userId].step = 'awaiting_private_message';
    await sendMessage(userId, {
        text: "Enter private message to send to commenters:"
    });
}

async function confirmConfiguration(userId) {
    const session = userSessions[userId];
    await sendMessage(userId, {
        text: `Confirm configuration for post ${session.postId}:\n\n` +
              `Keywords: ${session.keywords?.join(', ') || 'All comments'}\n` +
              `Public Reply: ${session.commentReply}\n` +
              `Private Message: ${session.privateMessage}\n\n` +
              "Type 'confirm' to save or 'cancel' to abort."
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
            session.step = 'awaiting_confirmation';
            break;

        case 'awaiting_confirmation':
            if (text.toLowerCase() === 'confirm') {
                await saveConfiguration(userId);
            } else {
                await sendMessage(userId, {text: "Configuration cancelled."});
            }
            delete userSessions[userId];
            await showMainMenu(userId);
            break;
    }
}

async function saveConfiguration(userId) {
    const session = userSessions[userId];
    activePosts[session.postId] = {
        keywords: session.keywords,
        commentReply: session.commentReply,
        privateMessage: session.privateMessage
    };
    await sendMessage(userId, {text: `Auto-reply configured for post ${session.postId}`});
}

async function showActiveConfigurations(userId, forStopping = false) {
    const active = Object.entries(activePosts)
        .filter(([_, config]) => config.commentReply || config.privateMessage);

    if (active.length === 0) {
        await sendMessage(userId, {text: "No active configurations."});
        return;
    }

    const quickReplies = active.map(([postId, _], index) => ({
        content_type: "text",
        title: `${index+1}. Post ${postId.substring(0, 8)}...`,
        payload: forStopping ? `STOP_CONFIG|${postId}` : `VIEW_CONFIG|${postId}`
    }));

    await sendMessage(userId, {
        text: forStopping ? "Select configuration to stop:" : "Active configurations:",
        quick_replies: quickReplies.concat([{
            content_type: "text",
            title: "❌ Cancel",
            payload: "CANCEL"
        }])
    });
}

/* ============ */
/* UTILITIES    */
/* ============ */

async function sendMessage(userId, message) {
    try {
        await axios.post(`https://graph.facebook.com/${API_VERSION}/me/messages`, {
            recipient: {id: userId},
            message: {text: message}
        }, {
            params: {access_token: T2_ACCESS_TOKEN}
        });
    } catch (error) {
        console.error("Messaging error:", error.response?.data);
    }
}

async function setupGetStartedButton() {
    try {
        await axios.post(`https://graph.facebook.com/${API_VERSION}/me/messenger_profile`, {
            get_started: {payload: "GET_STARTED"}
        }, {
            params: {access_token: T2_ACCESS_TOKEN}
        });
        console.log('Get Started button configured');
    } catch (error) {
        console.error("Get Started setup failed:", error.response?.data);
    }
}

async function showMainMenu(userId) {
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
}