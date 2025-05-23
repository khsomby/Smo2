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

// Hardcoded admin IDs (replace these)
const ADMIN_IDS = [
  '6881956545251284',
];

// Data storage
const activePosts = {}; // {postId: {keywords: [], commentReply: string, privateMessage: string}}

// Setup
const PORT = 2008;
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await setupGetStartedButton();
});

// Webhook verification
app.get('/webhook', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && 
        req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});

// Webhook handler
app.post('/webhook', async (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        await Promise.all(body.entry.map(processEntry));
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

// Process entry
async function processEntry(entry) {
    if (entry.messaging) {
        await handleMessage(entry.messaging[0]);
    }
    if (entry.changes) {
        await Promise.all(entry.changes.map(processChange));
    }
}

// Process changes (uses T1)
async function processChange(change) {
    if (change.field === 'feed' && change.value.item === 'comment') {
        await handleComment(change.value);
    }
}

// Handle messages (uses T2)
async function handleMessage(event) {
    const senderId = event.sender.id;
    
    // Always show menu for admins
    if (ADMIN_IDS.includes(senderId)) {
        if (event.postback?.payload === "GET_STARTED" || event.message) {
            await showMainMenu(senderId);
        }
    }
}

// Menu system (T2)
async function showMainMenu(userId) {
    await sendMessage(userId, {
        text: "Menu Principal:",
        quick_replies: [
            {
                content_type: "text",
                title: "➕ Ajouter auto-réponse",
                payload: "ADD_AUTO_REPLY"
            },
            {
                content_type: "text",
                title: "🛑 Stopper auto-réponse",
                payload: "STOP_AUTO_REPLY"
            }
        ]
    });
}

// Comment handling (T1)
async function handleComment(commentData) {
    const postId = commentData.post_id;
    const commentId = commentData.comment_id;
    const commenterId = commentData.from.id;
    const config = activePosts[postId];
    
    if (!config) return;

    const commentText = commentData.message.toLowerCase();
    let shouldReply = config.keywords.length === 0 || 
                     config.keywords.some(kw => commentText.includes(kw));

    if (shouldReply) {
        // Public reply (T1)
        if (config.commentReply) {
            await axios.post(`https://graph.facebook.com/${API_VERSION}/${commentId}/comments`, {
                message: config.commentReply
            }, {
                params: { access_token: T1_ACCESS_TOKEN }
            });
        }
        
        // Private message (T2)
        if (config.privateMessage) {
            await sendMessage(commenterId, {text: config.privateMessage});
        }
    }
}

// Send message helper (T2)
async function sendMessage(userId, message) {
    try {
        await axios.post(`https://graph.facebook.com/${API_VERSION}/me/messages`, {
            recipient: {id: userId},
            message
        }, {
            params: {access_token: T2_ACCESS_TOKEN}
        });
    } catch (error) {
        console.error("Messaging error:", error.response?.data);
    }
}

// Setup get started button (T2)
async function setupGetStartedButton() {
    try {
        await axios.post(`https://graph.facebook.com/${API_VERSION}/me/messenger_profile`, {
            get_started: {payload: "GET_STARTED"}
        }, {
            params: {access_token: T2_ACCESS_TOKEN}
        });
    } catch (error) {
        console.error("Get Started setup failed:", error.response?.data);
    }
}