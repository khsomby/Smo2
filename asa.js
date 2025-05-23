require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.T1;
const PAGE_ACCESS_TOKE = process.env.T2;
const VERIFY_TOKEN = "somby";
const API_VERSION = 'v18.0';

const activePosts = {};
let pageInfo = {
    id: null,
    admins: []
};

const PORT = 2008;
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await initializePageData();
    setupGetStartedButton();
});

async function initializePageData() {
    try {
        const pageResponse = await axios.get(`https://graph.facebook.com/${API_VERSION}/me`, {
            params: { access_token: PAGE_ACCESS_TOKEN, fields: 'id' }
        });
        pageInfo.id = pageResponse.data.id;

        const adminsResponse = await axios.get(`https://graph.facebook.com/${API_VERSION}/${pageInfo.id}/roles`, {
            params: { access_token: PAGE_ACCESS_TOKE }
        });
        pageInfo.admins = adminsResponse.data.data
            .filter(user => user.role === 'ADMIN')
            .map(user => user.id);

        console.log('Page data initialized:', pageInfo);
    } catch (error) {
        console.error('Error initializing page data:', error.response?.data || error.message);
    }
}

app.get('/webhook', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && 
        req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});

app.post('/webhook', async (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        await Promise.all(body.entry.map(processEntry));
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

async function processEntry(entry) {
    if (entry.messaging) {
        await handleMessage(entry.messaging[0]);
    }
    if (entry.changes) {
        await Promise.all(entry.changes.map(processChange));
    }
}

async function processChange(change) {
    if (change.field === 'feed' && change.value.item === 'comment') {
        await handleComment(change.value);
    }
}

async function handleMessage(event) {
    const senderId = event.sender.id;
    if (!pageInfo.admins.includes(senderId)) return;

    if (event.postback?.payload === "GET_STARTED") {
        await showMainMenu(senderId);
    } else if (event.message) {
        if (event.message.text === '/stop') {
            await showPostsToStop(senderId);
        } else if (event.message.quick_reply) {
            await handleQuickReply(senderId, event.message.quick_reply.payload);
        } else if (event.message.text) {
            await handleTextMessage(senderId, event.message.text);
        }
    }
}

async function handleTextMessage(userId, text) {
    const session = activePosts[userId]?.session;
    if (!session) return;

    if (session.step === 'awaitingKeywords') {
        if (text.trim().toLowerCase() === 'empty') {
            activePosts[userId].keywords = [];
        } else {
            activePosts[userId].keywords = text.split(',').map(k => k.trim().toLowerCase());
        }
        activePosts[userId].session.step = 'awaitingCommentReply';
        await askForCommentReply(userId);
    } 
    else if (session.step === 'awaitingCommentReply') {
        activePosts[userId].commentReply = text;
        activePosts[userId].session.step = 'awaitingPrivateMessage';
        await askForPrivateMessage(userId);
    }
    else if (session.step === 'awaitingPrivateMessage') {
        activePosts[userId].privateMessage = text;
        activePosts[userId].session.step = 'awaitingConfirmation';
        await askForConfirmation(userId);
    }
    else if (session.step === 'awaitingConfirmation') {
        if (text.toLowerCase() === 'oui') {
            await saveConfiguration(userId);
        } else {
            delete activePosts[userId];
            await sendMessage(userId, {text: "Configuration annulée."});
            await showMainMenu(userId);
        }
    }
}

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
                title: "🛑 /stop auto-réponse",
                payload: "STOP_AUTO_REPLY"
            },
            {
                content_type: "text",
                title: "📋 Lister configurations",
                payload: "LIST_CONFIGS"
            }
        ]
    });
}

async function fetchRecentPosts() {
    try {
        const response = await axios.get(`https://graph.facebook.com/${API_VERSION}/${pageInfo.id}/posts`, {
            params: {
                access_token: PAGE_ACCESS_TOKEN,
                fields: 'id,message,created_time',
                limit: 10
            }
        });
        return response.data.data;
    } catch (error) {
        console.error("Error fetching posts:", error.response?.data || error.message);
        return [];
    }
}

async function showPostSelection(userId) {
    const posts = await fetchRecentPosts();
    if (posts.length === 0) {
        await sendMessage(userId, {text: "Aucune publication récente trouvée."});
        return;
    }

    activePosts[userId] = {
        session: {step: 'awaitingKeywords'}
    };

    await sendMessage(userId, {
        text: "Sélectionnez une publication:",
        quick_replies: posts.map((post, index) => ({
            content_type: "text",
            title: `${index+1}. ${post.message?.substring(0, 15) || 'Post sans texte'}...`,
            payload: `SELECT_POST|${post.id}`
        })).concat([{
            content_type: "text",
            title: "❌ Annuler",
            payload: "CANCEL"
        }])
    });
}

async function askForKeywords(userId) {
    await sendMessage(userId, {
        text: "Entrez les mots-clés séparés par des virgules:",
        quick_replies: [{
            content_type: "text",
            title: "Empty",
            payload: "EMPTY_KEYWORDS"
        }]
    });
}

async function askForCommentReply(userId) {
    await sendMessage(userId, {
        text: "Entrez la réponse publique aux commentaires:"
    });
}

async function askForPrivateMessage(userId) {
    await sendMessage(userId, {
        text: "Entrez le message privé à envoyer au commentateur:"
    });
}

async function askForConfirmation(userId) {
    const config = activePosts[userId];
    const postId = config.postId;
    const keywords = config.keywords.length > 0 ? config.keywords.join(', ') : 'TOUS LES COMMENTAIRES';

    await sendMessage(userId, {
        text: `Confirmez-vous cette configuration pour le post ${postId}?
        
🔹 Mots-clés: ${keywords}
🔹 Réponse publique: ${config.commentReply}
🔹 Message privé: ${config.privateMessage}

Répondez "oui" pour confirmer ou "non" pour annuler.`
    });
}

async function saveConfiguration(userId) {
    const config = activePosts[userId];
    const postId = config.postId;
    
    // Save to active posts
    activePosts[postId] = {
        keywords: config.keywords,
        commentReply: config.commentReply,
        privateMessage: config.privateMessage
    };
    
    // Clean up user session
    delete activePosts[userId];

    await sendMessage(userId, {
        text: `Configuration enregistrée pour le post ${postId}!`,
        quick_replies: [{
            content_type: "text",
            title: "Retour au menu",
            payload: "MAIN_MENU"
        }]
    });
}

// Stop functionality
async function showPostsToStop(userId) {
    const active = Object.entries(activePosts)
        .filter(([id, config]) => id.length > 15 && (config.keywords || config.commentReply));

    if (active.length === 0) {
        await sendMessage(userId, {text: "Aucune auto-réponse active actuellement."});
        return;
    }

    await sendMessage(userId, {
        text: "Sélectionnez une configuration à arrêter:",
        quick_replies: active.map(([postId, config], index) => ({
            content_type: "text",
            title: `${index+1}. Post ${postId.substring(0, 8)}...`,
            payload: `STOP_POST|${postId}`
        })).concat([{
            content_type: "text",
            title: "❌ Annuler",
            payload: "CANCEL"
        }])
    });
}

// Comment handling
async function handleComment(commentData) {
    const postId = commentData.post_id;
    const commentId = commentData.comment_id;
    const commenterId = commentData.from.id;
    const config = activePosts[postId];
    
    if (!config) return;

    const commentText = commentData.message.toLowerCase();
    let shouldReply = false;

    // Check if should reply (to all or specific keywords)
    if (config.keywords.length === 0) {
        shouldReply = true;
    } else {
        shouldReply = config.keywords.some(keyword => 
            commentText.includes(keyword.toLowerCase())
        );
    }

    if (shouldReply) {
        // 1. Reply to comment publicly
        if (config.commentReply) {
            await replyToComment(commentId, config.commentReply);
        }
        
        // 2. Send private message
        if (config.privateMessage) {
            await sendPrivateMessage(commenterId, config.privateMessage);
        }
    }
}

// Quick reply handler
async function handleQuickReply(userId, payload) {
    if (payload === "MAIN_MENU" || payload === "CANCEL") {
        await showMainMenu(userId);
    } else if (payload === "ADD_AUTO_REPLY") {
        await showPostSelection(userId);
    } else if (payload === "LIST_CONFIGS") {
        await listActiveConfigurations(userId);
    } else if (payload === "EMPTY_KEYWORDS") {
        activePosts[userId].keywords = [];
        activePosts[userId].session.step = 'awaitingCommentReply';
        await askForCommentReply(userId);
    } else if (payload.startsWith("SELECT_POST|")) {
        const postId = payload.split("|")[1];
        activePosts[userId].postId = postId;
        await askForKeywords(userId);
    } else if (payload.startsWith("STOP_POST|")) {
        const postId = payload.split("|")[1];
        delete activePosts[postId];
        await sendMessage(userId, {
            text: `Auto-réponse stoppée pour le post ${postId}`,
            quick_replies: [{
                content_type: "text",
                title: "Retour au menu",
                payload: "MAIN_MENU"
            }]
        });
    }
}

// List active configurations
async function listActiveConfigurations(userId) {
    const active = Object.entries(activePosts)
        .filter(([id, config]) => id.length > 15 && (config.keywords || config.commentReply));

    if (active.length === 0) {
        await sendMessage(userId, {text: "Aucune configuration active actuellement."});
        return;
    }

    let message = "Configurations actives:\n\n";
    active.forEach(([postId, config]) => {
        message += `📌 Post ${postId.substring(0, 8)}...\n`;
        message += `🔹 Mots-clés: ${config.keywords.length > 0 ? config.keywords.join(', ') : 'Tous les commentaires'}\n`;
        message += `🔹 Réponse publique: ${config.commentReply?.substring(0, 20) || 'Aucune'}...\n`;
        message += `🔹 Message privé: ${config.privateMessage?.substring(0, 20) || 'Aucun'}...\n\n`;
    });

    await sendMessage(userId, {
        text: message,
        quick_replies: [{
            content_type: "text",
            title: "Retour au menu",
            payload: "MAIN_MENU"
        }]
    });
}

// API helpers
async function replyToComment(commentId, message) {
    try {
        await axios.post(`https://graph.facebook.com/${API_VERSION}/${commentId}/comments`, {
            message,
            access_token: PAGE_ACCESS_TOKEN
        });
    } catch (error) {
        console.error("Error replying to comment:", error.response?.data || error.message);
    }
}

async function sendPrivateMessage(userId, message) {
    try {
        await axios.post(`https://graph.facebook.com/${API_VERSION}/me/messages`, {
            recipient: {id: userId},
            message: {text: message},
            access_token: PAGE_ACCESS_TOKE
        });
    } catch (error) {
        console.error("Error sending private message:", error.response?.data || error.message);
    }
}

async function sendMessage(userId, message) {
    try {
        await axios.post(`https://graph.facebook.com/${API_VERSION}/me/messages`, {
            recipient: {id: userId},
            message,
            access_token: PAGE_ACCESS_TOKE
        });
    } catch (error) {
        console.error("Error sending message:", error.response?.data || error.message);
    }
}

async function setupGetStartedButton() {
    try {
        await axios.post(`https://graph.facebook.com/${API_VERSION}/me/messenger_profile`, {
            get_started: {payload: "GET_STARTED"}
        }, {params: {access_token: PAGE_ACCESS_TOKE}});
    } catch (error) {
        console.error("Error setting get started button:", error.response?.data || error.message);
    }
}