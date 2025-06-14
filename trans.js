const express = require('express');
const bodyParser = require('body-parser');
const axios = require("axios");
const fs = require('fs');

const app = express();
const PORT = 8080;

// Read multiple tokens from token.txt (one per line)
const PAGE_TOKENS = fs.readFileSync('./token.txt', 'utf8')
  .split('\n')
  .map(t => t.trim())
  .filter(Boolean);

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

const sendMessage = async (senderId, message, token) => {
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

const askForLanguage = async (senderId, originalMessage, token, page = 0) => {
  languagePaginationMap[senderId] = { originalMessage, page };

  const pageSize = 8;
  const start = page * pageSize;
  const slicedLangs = LANGUAGES.slice(start, start + pageSize);

  const quick_replies = slicedLangs.map((lang, index) => ({
    content_type: "text",
    title: lang.name,
    payload: `LANG_${page}_${lang.code}`
  }));

  if (start + pageSize < LANGUAGES.length) {
    quick_replies.push({
      content_type: "text",
      title: "➡️ Next",
      payload: "LANG_NEXT"
    });
  }

  return sendMessage(senderId, {
    text: "Adika amin'ny teny:",
    quick_replies
  }, token);
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

    const translatedText = response.data[0].map(item => item[0]).join('');
    return translatedText;
  } catch (err) {
    console.error("Translation Error:", err.response?.data || err.message);
    return "❌ Échec de traduction.";
  }
};

const listenMessage = async (event, token) => {
  const senderID = event.sender.id;
  const message = event.message?.text;
  if (!senderID || !message) return;

  return askForLanguage(senderID, message, token);
};

const listenQuickReply = async (event, token) => {
  const senderID = event.sender.id;
  const payload = event.message.quick_reply?.payload;

  if (!payload?.startsWith("LANG_")) return;

  const state = languagePaginationMap[senderID];
  if (!state) return sendMessage(senderID, "❌ Aucun texte à traduire.", token);

  if (payload === "LANG_NEXT") {
    const nextPage = state.page + 1;
    return askForLanguage(senderID, state.originalMessage, token, nextPage);
  }

  const match = payload.match(/^LANG_(\d+)_(.+)$/);
  if (!match) return sendMessage(senderID, "❌ Erreur de sélection de langue.", token);

  const [, pageStr, langCode] = match;
  const selectedPage = parseInt(pageStr);

  if (selectedPage !== state.page) {
    return sendMessage(senderID, "⚠️ Sélection périmée. Veuillez réessayer.", token);
  }

  const translated = await translateText(state.originalMessage, langCode);
  return sendMessage(senderID, translated, token);
};

const handleEvent = async (event, token) => {
  if (event.message?.quick_reply) {
    await listenQuickReply(event, token);
  } else if (event.message?.text) {
    await listenMessage(event, token);
  }
};

app.use(bodyParser.json());

app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "somby";
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    body.entry.forEach(async entry => {
      const webhookEvent = entry.messaging[0];
      const pageID = entry.id;

      const pageIndex = PAGE_TOKENS.length === 1
        ? 0
        : PAGE_TOKENS.findIndex((_, i) => i === PAGE_TOKENS.indexOf(PAGE_TOKENS.find(t => entry.id.includes(t.slice(0, 10)))));
      const token = PAGE_TOKENS[pageIndex] || PAGE_TOKENS[0];

      await handleEvent(webhookEvent, token);
    });

    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

app.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur le port ${PORT}`);
});