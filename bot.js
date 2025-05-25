require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const T1_MESSAGE_TOKEN = process.env.T2;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "somby";

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
  { code: 'sw', name: 'Swahili' }
];

// In-memory user data storage
const userData = {};

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
      targetLanguage: null,
      awaitingTranslation: false
    };
  }
  return userData[userId];
}

// Show language selection
async function showLanguageSelection(userId) {
  const quickReplies = LANGUAGES.map(lang => ({
    content_type: "text",
    title: lang.name,
    payload: `LANG_${lang.code}`
  }));

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
    user.dailyUsage = 0;
    user.lastUsed = today;
  }

  // Handle premium upgrade
  if (message.match(/payer|\d{10}/i)) {
    if (message.match(/\d{10}/)) {
      const phoneNumber = message.match(/\d{10}/)[0];
      user.phoneNumber = phoneNumber;
      
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
  if (message.startsWith("Traduire en ") || user.awaitingTranslation) {
    if (message.startsWith("Traduire en ")) {
      const langName = message.replace("Traduire en ", "").trim();
      const lang = LANGUAGES.find(l => l.name.toLowerCase() === langName.toLowerCase());
      
      if (lang) {
        user.targetLanguage = lang.code;
        user.awaitingTranslation = true;
        await callMessengerAPI('me/messages', {
          recipient: { id: senderId },
          message: { text: `Langue définie: ${lang.name}. Envoyez le texte à traduire.` }
        });
      } else {
        await showLanguageSelection(senderId);
      }
    } else {
      // User has already selected language, now translating
      const wordCount = message.split(/\s+/).length;
      if (!user.isPremium) {
        user.dailyUsage += wordCount;
      }

      const translatedText = await translateText(message, user.targetLanguage);
      user.awaitingTranslation = false;
      
      await callMessengerAPI('me/messages', {
        recipient: { id: senderId },
        message: { 
          text: `Traduction (${LANGUAGES.find(l => l.code === user.targetLanguage).name}):\n\n${translatedText}`,
          quick_replies: [
            {
              content_type: "text",
              title: "Traduire encore",
              payload: "TRANSLATE_AGAIN"
            }
          ]
        }
      });
    }
    return;
  }

  // Default action - show language selection
  await showLanguageSelection(senderId);
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
            const langCode = event.postback.payload.replace('LANG_', '');
            const lang = LANGUAGES.find(l => l.code === langCode);
            if (lang) {
              const user = getUserData(event.sender.id);
              user.targetLanguage = lang.code;
              user.awaitingTranslation = true;
              await callMessengerAPI('me/messages', {
                recipient: { id: event.sender.id },
                message: { text: `Langue définie: ${lang.name}. Envoyez le texte à traduire.` }
              });
            }
          } else if (event.postback.payload === 'TRANSLATE_AGAIN') {
            await showLanguageSelection(event.sender.id);
          }
        } else if (event.message && event.message.text) {
          await handleMessage(event.sender.id, event.message.text, pageId);
        }
      }
    }
  }
  res.status(200).send('OK');
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
              title: "Traduire",
              payload: "TRANSLATE_AGAIN"
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

// Start Server
const PORT = process.env.PORT || 2008;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  setupGetStartedButton();
});