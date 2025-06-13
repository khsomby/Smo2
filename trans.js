const express = require('express');
const bodyParser = require('body-parser');
const axios = require("axios");
const fs = require("fs");
const app = express();
const PORT = 8080;

// Load tokens and map page IDs to tokens
const tokens = fs.readFileSync('token.txt', 'utf-8')
  .split('\n')
  .map(t => t.trim())
  .filter(t => t.length);

const pageTokenMap = {}; // { pageId: token }

async function initPageMap() {
  for (const token of tokens) {
    try {
      const res = await axios.get(`https://graph.facebook.com/v11.0/me`, {
        params: { access_token: token }
      });
      const pageId = res.data.id;
      pageTokenMap[pageId] = token;
      console.log(`Mapped Page ID ${pageId}`);
    } catch (err) {
      console.error("❌ Failed to map token:", err.response?.data || err.message);
    }
  }
}

const LANGUAGES = [
  { code: "mg", name: "Malagasy 🇲🇬" },
  { code: "en", name: "Anglais 🇬🇧" },
  { code: "fr", name: "Français 🇫🇷" },
  { code: "zh", name: "Chinois 🇨🇳" },
  { code: "es", name: "Espagnol 🇪🇸" },
  { code: "de", name: "Allemand 🇩🇪" },
  { code: "ja", name: "Japonais 🇯🇵" },
  { code: "am", name: "Amharique 🇪🇹" },
  { code: "ar", name: "Arabe 🇸🇦" },
  { code: "bg", name: "Bulgare 🇧🇬" },
  { code: "bn", name: "Bengali 🇧🇩" },
  { code: "cs", name: "Tchèque 🇨🇿" },
  { code: "da", name: "Danois 🇩🇰" },
  { code: "el", name: "Grec 🇬🇷" },
  { code: "et", name: "Estonien 🇪🇪" },
  { code: "fa", name: "Persan 🇮🇷" },
  { code: "fi", name: "Finnois 🇫🇮" },
  { code: "gu", name: "Gujarati 🇮🇳" },
  { code: "he", name: "Hébreu 🇮🇱" },
  { code: "hi", name: "Hindi 🇮🇳" },
  { code: "hr", name: "Croate 🇭🇷" },
  { code: "hu", name: "Hongrois 🇭🇺" },
  { code: "id", name: "Indonésien 🇮🇩" },
  { code: "it", name: "Italien 🇮🇹" },
  { code: "kn", name: "Kannada 🇮🇳" },
  { code: "ko", name: "Coréen 🇰🇷" },
  { code: "lt", name: "Lituanien 🇱🇹" },
  { code: "lv", name: "Letton 🇱🇻" },
  { code: "ml", name: "Malayalam 🇮🇳" },
  { code: "mr", name: "Marathi 🇮🇳" },
  { code: "ms", name: "Malais 🇲🇾" },
  { code: "nl", name: "Néerlandais 🇳🇱" },
  { code: "no", name: "Norvégien 🇳🇴" },
  { code: "pa", name: "Pendjabi 🇮🇳" },
  { code: "pl", name: "Polonais 🇵🇱" },
  { code: "pt", name: "Portugais 🇵🇹" },
  { code: "ro", name: "Roumain 🇷🇴" },
  { code: "ru", name: "Russe 🇷🇺" },
  { code: "sk", name: "Slovaque 🇸🇰" },
  { code: "sl", name: "Slovène 🇸🇮" },
  { code: "sr", name: "Serbe 🇷🇸" },
  { code: "sv", name: "Suédois 🇸🇪" },
  { code: "ta", name: "Tamoul 🇮🇳" },
  { code: "te", name: "Télougou 🇮🇳" },
  { code: "th", name: "Thaï 🇹🇭" },
  { code: "tr", name: "Turc 🇹🇷" },
  { code: "uk", name: "Ukrainien 🇺🇦" },
  { code: "ur", name: "Ourdou 🇵🇰" },
  { code: "vi", name: "Vietnamien 🇻🇳" },
  { code: "zu", name: "Zoulou 🇿🇦" }
];

const languagePaginationMap = {};

const sendMessage = async (pageId, senderId, message) => {
  const token = pageTokenMap[pageId];
  if (!token) {
    console.error("❌ No token for page:", pageId);
    return;
  }

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v11.0/me/messages`,
      {
        recipient: { id: senderId },
        message: typeof message === "object" ? message : { text: message },
      },
      {
        params: { access_token: token },
        headers: { "Content-Type": "application/json" },
      }
    );
    return response.data;
  } catch (err) {
    console.error('Error sending message:', err.response?.data || err.message);
  }
};

const askForLanguage = async (pageId, senderId, originalMessage, page = 0) => {
  languagePaginationMap[senderId] = { originalMessage, page };

  const pageSize = 10;
  const start = page * pageSize;
  const slicedLangs = LANGUAGES.slice(start, start + pageSize);

  const quick_replies = slicedLangs.map(lang => ({
    content_type: "text",
    title: lang.name,
    payload: `LANG_${lang.code}`
  }));

  if (start + pageSize < LANGUAGES.length) {
    quick_replies.push({
      content_type: "text",
      title: "➡️ Suivant",
      payload: "LANG_NEXT"
    });
  }

  return sendMessage(pageId, senderId, {
    text: "Adika amin'ny teny:",
    quick_replies
  });
};

const translateText = async (text, targetLang) => {
  try {
    const response = await axios.get(
      `https://translate.googleapis.com/translate_a/single`,
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

    return response.data[0].map(part => part[0]).join('');
  } catch (err) {
    console.error("Translation Error:", err.response?.data || err.message);
    return "❌ Échec de la traduction.";
  }
};

const listenMessage = async (pageId, event) => {
  const senderID = event.sender.id;
  const message = event.message.text;
  if (!senderID || !message) return;

  return askForLanguage(pageId, senderID, message);
};

const listenQuickReply = async (pageId, event) => {
  const senderID = event.sender.id;
  const payload = event.message.quick_reply.payload;

  if (!payload.startsWith("LANG_")) return;

  const state = languagePaginationMap[senderID];
  if (!state) return sendMessage(pageId, senderID, "❌ Aucun texte à traduire.");

  if (payload === "LANG_NEXT") {
    const nextPage = state.page + 1;
    return askForLanguage(pageId, senderID, state.originalMessage, nextPage);
  }

  const langCode = payload.replace("LANG_", "");
  const translated = await translateText(state.originalMessage, langCode);
  return sendMessage(pageId, senderID, translated);
};

const handleEvent = async (pageId, event) => {
  if (event.message && event.message.quick_reply) {
    await listenQuickReply(pageId, event);
  } else if (event.message && event.message.text) {
    await listenMessage(pageId, event);
  }
};

app.use(bodyParser.json());

app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "somby";
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    body.entry.forEach(async entry => {
      const pageId = entry.id;
      const event = entry.messaging[0];
      await handleEvent(pageId, event);
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

initPageMap().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
  });
});
