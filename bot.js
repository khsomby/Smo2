require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// Configuration
const T1_MESSAGE_TOKEN = process.env.T2;
const VERIFY_TOKEN = "somby";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const REPO_NAME = process.env.GITHUB_REPO_NAME;
const DATA_FILE = 'user_data.json';

// 50 Supported Languages
const LANGUAGES = [
  { code: 'mg', name: 'Malagasy' },
  { code: 'en', name: 'Anglais' },
  { code: 'fr', name: 'Français' },
  { code: 'zh', name: 'Chinois' },
  { code: 'ja', name: 'Japonais' },
  { code: 'ko', name: 'Coréen' },
  { code: 'es', name: 'Espagnol' },
  { code: 'de', name: 'Allemand' },
  { code: 'ar', name: 'Arabe' },
  { code: 'it', name: 'Italien' },
  { code: 'hi', name: 'Hindi' },
  { code: 'pt', name: 'Portugais' },
  { code: 'ru', name: 'Russe' },
  { code: 'bn', name: 'Bengali' },
  { code: 'sw', name: 'Swahili' },
  { code: 'nl', name: 'Néerlandais' },
  { code: 'tr', name: 'Turc' },
  { code: 'vi', name: 'Vietnamien' },
  { code: 'pl', name: 'Polonais' },
  { code: 'th', name: 'Thaï' },
  { code: 'fa', name: 'Persan' },
  { code: 'he', name: 'Hébreu' },
  { code: 'uk', name: 'Ukrainien' },
  { code: 'cs', name: 'Tchèque' },
  { code: 'sv', name: 'Suédois' },
  { code: 'ro', name: 'Roumain' },
  { code: 'hu', name: 'Hongrois' },
  { code: 'da', name: 'Danois' },
  { code: 'fi', name: 'Finnois' },
  { code: 'sk', name: 'Slovaque' },
  { code: 'no', name: 'Norvégien' },
  { code: 'el', name: 'Grec' },
  { code: 'id', name: 'Indonésien' },
  { code: 'ms', name: 'Malais' },
  { code: 'tl', name: 'Filipino' },
  { code: 'ne', name: 'Népalais' },
  { code: 'si', name: 'Cingalais' },
  { code: 'km', name: 'Khmer' },
  { code: 'pa', name: 'Pendjabi' },
  { code: 'ta', name: 'Tamoul' },
  { code: 'te', name: 'Télougou' },
  { code: 'mr', name: 'Marathi' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'kn', name: 'Kannada' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'my', name: 'Birman' },
  { code: 'am', name: 'Amharique' },
  { code: 'zu', name: 'Zoulou' },
  { code: 'xh', name: 'Xhosa' },
  { code: 'rw', name: 'Kinyarwanda' }
];

// User data storage
let userData = {};

// GitHub API Helper
async function githubAPI(method, endpoint, data = {}) {
  try {
    const response = await axios({
      method,
      url: `https://api.github.com/${endpoint}`,
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'FB-Translation-Bot'
      },
      data
    });
    return response.data;
  } catch (error) {
    console.error('GitHub API Error:', error.response?.data || error.message);
    throw error;
  }
}

// Load user data from GitHub
async function loadUserData() {
  try {
    const data = await githubAPI(
      'GET',
      `repos/${REPO_OWNER}/${REPO_NAME}/contents/${DATA_FILE}`
    );
    const content = Buffer.from(data.content, 'base64').toString();
    userData = JSON.parse(content);
    console.log('User data loaded from GitHub');
  } catch (error) {
    if (error.response?.status === 404) {
      console.log('Creating new user data file');
      userData = {};
      await saveUserData();
    } else {
      console.error('Error loading user data:', error);
    }
  }
}

// Save user data to GitHub
async function saveUserData() {
  try {
    const content = Buffer.from(JSON.stringify(userData, null, 2)).toString('base64');
    
    // Check if file exists to get SHA
    let sha;
    try {
      const fileInfo = await githubAPI(
        'GET',
        `repos/${REPO_OWNER}/${REPO_NAME}/contents/${DATA_FILE}`
      );
      sha = fileInfo.sha;
    } catch (e) {
      sha = null; // File doesn't exist yet
    }

    await githubAPI(
      'PUT',
      `repos/${REPO_OWNER}/${REPO_NAME}/contents/${DATA_FILE}`,
      {
        message: 'Update user data',
        content: content,
        sha: sha
      }
    );
    console.log('User data saved to GitHub');
  } catch (error) {
    console.error('Error saving user data:', error);
  }
}

// Messenger API Helper
async function callMessengerAPI(endpoint, data) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${endpoint}`,
      data,
      { params: { access_token: T1_MESSAGE_TOKEN } }
    );
    return response.data;
  } catch (error) {
    console.error('Messenger API Error:', error.response?.data || error.message);
    throw error;
  }
}

// Check if user is admin
async function isAdmin(userId, pageId) {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v19.0/${pageId}/roles`,
      { params: { access_token: T1_MESSAGE_TOKEN } }
    );
    return response.data.data.some(role => 
      role.user.id === userId && role.role === 'ADMIN'
    );
  } catch (error) {
    console.error('Admin check error:', error);
    return false;
  }
}

// Translation function
async function translateText(text, targetLang) {
  try {
    const response = await axios.get(
      'https://translate.googleapis.com/translate_a/single',
      {
        params: {
          client: 'gtx',
          sl: 'auto',
          tl: targetLang,
          dt: 't',
          q: text
        }
      }
    );
    return response.data[0][0][0];
  } catch (error) {
    console.error('Translation error:', error.message);
    return text;
  }
}

// Get user data
function getUserData(userId) {
  if (!userData[userId]) {
    const today = new Date().toISOString().split('T')[0];
    userData[userId] = {
      id: userId,
      isPremium: false,
      dailyUsage: 0,
      lastUsed: today,
      phoneNumber: null,
      paymentVerified: false,
      isBlocked: false,
      targetLanguage: null
    };
  }
  return userData[userId];
}

// Update user data
async function updateUserData(userId, data) {
  const user = getUserData(userId);
  userData[userId] = { ...user, ...data };
  await saveUserData();
}

// Show language selection with pagination
async function showLanguageSelection(userId, pageIndex) {
  const startIdx = pageIndex * 12;
  const endIdx = startIdx + 12;
  const languagesPage = LANGUAGES.slice(startIdx, endIdx);

  const quickReplies = languagesPage.map(lang => ({
    content_type: "text",
    title: lang.name,
    payload: `LANG_${lang.code}`
  }));

  // Add pagination buttons
  if (pageIndex > 0) {
    quickReplies.push({
      content_type: "text",
      title: "← Précédent",
      payload: `LANG_PREV_${pageIndex - 1}`
    });
  }
  if (endIdx < LANGUAGES.length) {
    quickReplies.push({
      content_type: "text",
      title: "Suivant →",
      payload: `LANG_NEXT_${pageIndex + 1}`
    });
  }

  await callMessengerAPI('me/messages', {
    recipient: { id: userId },
    message: {
      text: "Choisissez une langue cible:",
      quick_replies: quickReplies
    }
  });
}

// Handle incoming messages
async function handleMessage(senderId, message, pageId) {
  const user = getUserData(senderId);

  if (user.isBlocked) {
    await callMessengerAPI('me/messages', {
      recipient: { id: senderId },
      message: { text: "Vous avez été bloqué. Contactez l'administrateur." }
    });
    return;
  }

  // Reset daily usage if new day
  const today = new Date().toISOString().split('T')[0];
  if (user.lastUsed !== today) {
    await updateUserData(senderId, { dailyUsage: 0, lastUsed: today });
    user.dailyUsage = 0;
  }

  // Handle premium upgrade
  if (message.match(/payer|\d{10}/i)) {
    if (message.match(/\d{10}/)) {
      const phoneNumber = message.match(/\d{10}/)[0];
      await updateUserData(senderId, { phoneNumber });
      
      // Notify admin
      await callMessengerAPI('me/messages', {
        recipient: { id: pageId },
        message: { 
          text: `Nouvelle demande premium:\nID: ${senderId}\nTéléphone: ${phoneNumber}`
        }
      });
      
      await callMessengerAPI('me/messages', {
        recipient: { id: senderId },
        message: { text: "Demande envoyée à l'admin. Vous serez notifié après approbation." }
      });
    } else {
      await callMessengerAPI('me/messages', {
        recipient: { id: senderId },
        message: { 
          text: "Pour premium: Envoyez 10,000 AR au 0381060495 (Joachilline Berthe) puis votre numéro ici.",
          quick_replies: [
            {
              content_type: "text",
              title: "Annuler",
              payload: "CANCEL_PAYMENT"
            }
          ]
        }
      });
    }
    return;
  }

  // Check word limit for free users
  if (!user.isPremium && user.dailyUsage >= 100) {
    await callMessengerAPI('me/messages', {
      recipient: { id: senderId },
      message: { 
        text: "Limite quotidienne atteinte (100 mots). Passez à premium.",
        quick_replies: [
          {
            content_type: "text",
            title: "Passer à Premium",
            payload: "UPGRADE_PREMIUM"
          }
        ]
      }
    });
    return;
  }

  // Handle language selection
  if (message.startsWith("Traduire en ")) {
    const langName = message.replace("Traduire en ", "").trim();
    const lang = LANGUAGES.find(l => l.name.toLowerCase() === langName.toLowerCase());
    
    if (lang) {
      await updateUserData(senderId, { targetLanguage: lang.code });
      await callMessengerAPI('me/messages', {
        recipient: { id: senderId },
        message: { text: `Langue définie: ${lang.name}. Envoyez le texte à traduire.` }
      });
    } else {
      await showLanguageSelection(senderId, 0);
    }
    return;
  }

  // Handle translation
  if (user.targetLanguage) {
    const wordCount = message.split(/\s+/).length;
    if (!user.isPremium) {
      if (user.dailyUsage + wordCount > 100) {
        await callMessengerAPI('me/messages', {
          recipient: { id: senderId },
          message: { 
            text: `Il vous reste ${100 - user.dailyUsage} mots aujourd'hui.`,
            quick_replies: [
              {
                content_type: "text",
                title: "Passer à Premium",
                payload: "UPGRADE_PREMIUM"
              }
            ]
          }
        });
        return;
      }
      await updateUserData(senderId, { dailyUsage: user.dailyUsage + wordCount });
    }

    const translatedText = await translateText(message, user.targetLanguage);
    await callMessengerAPI('me/messages', {
      recipient: { id: senderId },
      message: { text: `Traduction (${LANGUAGES.find(l => l.code === user.targetLanguage).name}):\n\n${translatedText}` }
    });
  } else {
    await showLanguageSelection(senderId, 0);
  }
}

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
    return res.status(200).send(req.query['hub.challenge']);
  }

  const entries = req.body.entry;
  for (const entry of entries) {
    const pageId = entry.id;
    
    if (entry.messaging) {
      for (const event of entry.messaging) {
        if (event.postback) {
          if (event.postback.payload === 'START_BOT') {
            const adminStatus = await isAdmin(event.sender.id, pageId);
            await callMessengerAPI('me/messages', {
              recipient: { id: event.sender.id },
              message: {
                text: adminStatus ? 
                  "Miarahaba admin! Manao ahoana no tianao handaminana ny bot?" : 
                  "Miarahaba! Misotra béta ny mpandika teny Facebook."
              }
            });
          } else if (event.postback.payload.startsWith('LANG_')) {
            const payload = event.postback.payload.replace('LANG_', '');
            
            if (payload.startsWith('NEXT_')) {
              const page = parseInt(payload.replace('NEXT_', ''));
              await showLanguageSelection(event.sender.id, page);
            } else if (payload.startsWith('PREV_')) {
              const page = parseInt(payload.replace('PREV_', ''));
              await showLanguageSelection(event.sender.id, page);
            } else {
              const lang = LANGUAGES.find(l => l.code === payload);
              if (lang) {
                await updateUserData(event.sender.id, { targetLanguage: lang.code });
                await callMessengerAPI('me/messages', {
                  recipient: { id: event.sender.id },
                  message: { text: `Langue définie: ${lang.name}. Envoyez le texte à traduire.` }
                });
              }
            }
          }
        } else if (event.message && event.message.text) {
          await handleMessage(event.sender.id, event.message.text, pageId);
        }
      }
    }
  }
  res.status(200).send('OK');
});

// Admin endpoints
app.post('/admin/action', async (req, res) => {
  const { adminId, userId, action, pageId } = req.body;
  
  try {
    const isUserAdmin = await isAdmin(adminId, pageId);
    if (!isUserAdmin) {
      return res.status(403).json({ error: "Accès admin requis" });
    }

    switch (action) {
      case 'approve':
        await updateUserData(userId, { isPremium: true, paymentVerified: true });
        await callMessengerAPI('me/messages', {
          recipient: { id: userId },
          message: { text: "Votre abonnement premium est activé! Traduction illimitée disponible." }
        });
        break;
        
      case 'deny':
        await updateUserData(userId, { paymentVerified: false });
        await callMessengerAPI('me/messages', {
          recipient: { id: userId },
          message: { text: "Votre demande premium a été refusée. Contactez l'admin." }
        });
        break;
        
      case 'block':
        await updateUserData(userId, { isBlocked: true });
        break;
        
      default:
        return res.status(400).json({ error: "Action non valide" });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Admin error:', error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Setup Get Started Button
async function setupGetStartedButton() {
  try {
    await callMessengerAPI('me/messenger_profile', {
      get_started: { payload: "START_BOT" },
      persistent_menu: [
        {
          locale: "default",
          composer_input_disabled: false,
          call_to_actions: [
            {
              type: "postback",
              title: "Changer la langue",
              payload: "CHANGE_LANGUAGE"
            },
            {
              type: "postback",
              title: "Passer à Premium",
              payload: "UPGRADE_PREMIUM"
            }
          ]
        }
      ]
    });
    console.log("Get Started button set up successfully");
  } catch (error) {
    console.error("Error setting up Get Started button:", error.response?.data || error.message);
  }
}

// Initialize and Start Server
const PORT = process.env.PORT || 2008;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await loadUserData();
  setupGetStartedButton();
});