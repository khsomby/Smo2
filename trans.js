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

const express = require('express');
const bodyParser = require('body-parser');
const axios = require("axios");
const fs = require('fs');
const app = express();
const PORT = 8080;

// Load page tokens
const PAGE_TOKENS = fs.readFileSync('./token.txt', 'utf8')
  .split('\n').map(t => t.trim()).filter(Boolean);
const pageTokenMap = {};
const userModes = {};
const languagePaginationMap = {};

// Subscribe each page
const subscribePages = async () => {
  for (const token of PAGE_TOKENS) {
    try {
      const res = await axios.get('https://graph.facebook.com/me', {
        params: { access_token: token }
      });
      const pageId = res.data.id;
      pageTokenMap[pageId] = token;
      await axios.post(`https://graph.facebook.com/${pageId}/subscribed_apps`, {}, {
        params: { access_token: token }
      });
      console.log(`✅ Subscribed to page ${pageId}`);
    } catch (err) {
      console.error('❌ Subscription error:', err.response?.data || err.message);
    }
  }
};

// Messenger helpers
const sendMessage = async (id, msg, tk) => axios.post(
  `https://graph.facebook.com/v18.0/me/messages`,
  { recipient: { id }, message: typeof msg === 'string' ? { text: msg } : msg },
  { params: { access_token: tk } }
);

const sendQuickMode = (id, tk) => sendMessage(id, {
  text: "Choisissez un mode :",
  quick_replies: [
    { content_type: "text", title: "🔤 Traduire", payload: "MODE_TRANSLATE" },
    { content_type: "text", title: "💬 Discuter", payload: "MODE_CHAT" }
  ]
}, tk);

const askForLanguage = (id, origText, tk, page = 0) => {
  languagePaginationMap[id] = { orig: origText, page };
  const paginated = LANGUAGES.slice(page * 8, (page + 1) * 8);
  const quicks = paginated.map(l => ({
    content_type: "text",
    title: l.name,
    payload: `LANG_${page}_${l.code}`
  }));
  if ((page + 1) * 8 < LANGUAGES.length)
    quicks.push({ content_type: "text", title: "➡️", payload: "LANG_NEXT" });
  quicks.push({ content_type: "text", title: "🔄 Basculer", payload: "SWITCH_MODE" });

  return sendMessage(id, { text: "Choisissez la langue :", quick_replies: quicks }, tk);
};

const translateText = async (txt, lang) => {
  try {
    const res = await axios.get(`https://translate.googleapis.com/translate_a/single`, {
      params: { client: 'gtx', sl: 'auto', tl: lang, dt: 't', q: txt }
    });
    return res.data[0].map(r => r[0]).join('');
  } catch {
    return "❌ Erreur traduction.";
  }
};

const chatWithAI = async (text, id, tk) => {
  try {
    const res = await axios.get(`https://kaiz-apis.gleeze.com/api/gpt-4o-pro`, {
      params: { ask: text, uid: id, apikey: "..." }
    });
    const reply = res.data.response || "🤖 Pas de réponse.";
    await sendMessage(id, { text: reply, quick_replies: [{ content_type: "text", title: "🔄 Basculer", payload: "SWITCH_MODE" }] }, tk);
  } catch {
    await sendMessage(id, "❌ Erreur GPT", tk);
  }
};

// Handle Quick Replies
const handleQuickReply = async (event, tk) => {
  const id = event.sender.id;
  const payload = event.message.quick_reply.payload;

  if (payload === "MODE_TRANSLATE") {
    userModes[id] = "translate";
    return sendMessage(id, "Envoyez le texte à traduire 📝", tk);
  }

  if (payload === "MODE_CHAT") {
    userModes[id] = "chat";
    return sendMessage(id, "Envoyez un message 💬", tk);
  }

  if (payload === "SWITCH_MODE") {
    delete userModes[id];
    delete languagePaginationMap[id];
    return sendQuickMode(id, tk);
  }

  if (payload === "LANG_NEXT") {
    const state = languagePaginationMap[id];
    return askForLanguage(id, state?.orig, tk, (state?.page || 0) + 1);
  }

  if (payload.startsWith("LANG_")) {
    const [_, page, code] = payload.split("_");
    const orig = languagePaginationMap[id]?.orig;
    if (orig) {
      const translated = await translateText(orig, code);
      return sendMessage(id, {
        text: translated,
        quick_replies: [{ content_type: "text", title: "🔄 Basculer", payload: "SWITCH_MODE" }]
      }, tk);
    }
  }
};

// Webhook verification
app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === 'somby') {
    return res.send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

// Webhook handler
app.post('/webhook', async (req, res) => {
  const body = req.body;

  for (const entry of body.entry || []) {
    const pageID = entry.id;
    const token = pageTokenMap[pageID];
    if (!token) continue;

    // Feed comment
    for (const change of entry.changes || []) {
      const { message, comment_id, from } = change.value || {};
      if (change.field === "feed" && change.item === "comment" && /ok/i.test(message)) {
        const senderId = from?.id;
        if (senderId) {
          await sendMessage(senderId, "Merci pour votre commentaire ! ✅", token);
        }
      }
    }

    // Messenger messages
    for (const event of entry.messaging || []) {
      const senderId = event.sender.id;

      if (event.postback?.payload === "BYSOMBY") {
        await sendMessage(senderId, "Bienvenue !", token);
        await sendQuickMode(senderId, token);
      }

      if (event.message?.quick_reply) {
        await handleQuickReply(event, token);
      } else if (event.message?.text) {
        const mode = userModes[senderId];
        if (!mode) return sendQuickMode(senderId, token);
        if (mode === "translate") return askForLanguage(senderId, event.message.text, token, 0);
        if (mode === "chat") return chatWithAI(event.message.text, senderId, token);
      }
    }
  }

  res.sendStatus(200);
});

// Setup get started
app.get('/setup', async (req, res) => {
  const results = [];
  for (const token of PAGE_TOKENS) {
    try {
      const result = await axios.post(`https://graph.facebook.com/v18.0/me/messenger_profile`, {
        get_started: { payload: "BYSOMBY" }
      }, {
        params: { access_token: token }
      });
      results.push({ token, success: true });
    } catch (err) {
      results.push({ token, success: false, error: err.message });
    }
  }
  res.json(results);
});

// Init
app.listen(PORT, async () => {
  await subscribePages();
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});