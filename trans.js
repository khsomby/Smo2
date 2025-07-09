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

const PAGE_TOKENS = fs.readFileSync('./token.txt', 'utf8').split('\n').map(t => t.trim()).filter(Boolean);

const pageTokenMap = {};
const userModes = {};
const languagePaginationMap = {};
const awaitingLang = {};
const keywordResponses = {};

const subscribePages = async () => {
  for (const token of PAGE_TOKENS) {
    try {
      const res = await axios.get('https://graph.facebook.com/v18.0/me?fields=id,name', { params: { access_token: token } });
      const pageId = res.data.id;
      pageTokenMap[pageId] = token;
      await axios.post(`https://graph.facebook.com/v18.0/${pageId}/subscribed_apps`, {
        subscribed_fields: ['feed', 'messages', 'messaging_postbacks', 'messaging_optins']
      }, { params: { access_token: token } });
      console.log(`✅ Subscribed and mapped page ${res.data.name} (${pageId})`);
    } catch (err) {
      console.error(`❌ Subscription failed for token ${token.substring(0, 5)}...:`, err.response?.data || err.message);
    }
  }
  console.log("📌 Mapped pages:", Object.keys(pageTokenMap));
};

const sendTyping = async (id, tk) => {
  await axios.post('https://graph.facebook.com/v11.0/me/messages', {
    recipient: { id },
    sender_action: "typing_on"
  }, { params: { access_token: tk } });
};

const sendTypingOff = async (id, tk) => {
  await axios.post('https://graph.facebook.com/v11.0/me/messages', {
    recipient: { id },
    sender_action: "typing_off"
  }, { params: { access_token: tk } });
};

const sendMessage = async (id, msg, tk) => {
  try {
    await sendTyping(id, tk);
    await axios.post('https://graph.facebook.com/v11.0/me/messages', {
      recipient: { id },
      message: typeof msg === 'object' ? msg : { text: msg }
    }, { params: { access_token: tk } });
  } catch (err) {
    console.error("❌ sendMessage error:", err.response?.data || err.message);
  } finally {
    await sendTypingOff(id, tk);
  }
};

const sendModeQuickReply = (id, tk) => sendMessage(id, {
  text: "Choisissez un mode :",
  quick_replies: [
    { content_type: "text", title: "🔤 Traduire", payload: "MODE_TRANSLATE" },
    { content_type: "text", title: "💬 Discuter", payload: "MODE_CHAT" },
    { content_type: "text", title: "🖼️ Générer Image", payload: "MODE_IMAGE" }
  ]
}, tk);

const translateText = async (txt, lang) => {
  try {
    const res = await axios.get('https://translate.googleapis.com/translate_a/single', {
      params: { client: 'gtx', sl: 'auto', tl: lang, dt: 't', q: txt }
    });
    return res.data[0].map(i => i[0]).join('');
  } catch {
    return "Erreur lors de la traduction.";
  }
};

const askForLanguage = (id, orig, tk, page = 0) => {
  awaitingLang[id] = true;
  languagePaginationMap[id] = { orig, page };
  const pag = LANGUAGES.slice(page * 8, page * 8 + 8);
  const qr = pag.map(l => ({ content_type: "text", title: l.name, payload: `LANG_${l.code}` })); // Removed page number from payload
  if ((page + 1) * 8 < LANGUAGES.length) qr.push({ content_type: "text", title: "➡️", payload: "LANG_NEXT" });
  qr.push({ content_type: "text", title: "🔄 Basculer", payload: "SWITCH_MODE" });
  return sendMessage(id, { text: "Choisissez la langue :", quick_replies: qr }, tk);
};

const chatWithAI = async (msg, id, tk) => {
  const mss = `[Prompt: Tu es une IA assistante.]\n${msg}`;
  const url = `https://kaiz-apis.gleeze.com/api/kaiz-ai?ask=${encodeURIComponent(mss)}&uid=${id}&apikey=demo`;
  try {
    const d = (await axios.get(url)).data;
    return sendMessage(id, { text: d.response || "Aucune réponse.", quick_replies: [{ content_type: "text", title: "🔄 Basculer", payload: "SWITCH_MODE" }] }, tk);
  } catch {
    return sendMessage(id, "Erreur IA", tk);
  }
};

const handleQuickReply = async (evt, tk) => {
  const id = evt.sender.id;
  const p = evt.message.quick_reply.payload;

  if (p === "MODE_TRANSLATE") {
    userModes[id] = "translate";
    return sendMessage(id, "📝 Mode Traduire. Envoyez un texte.", tk);
  }

  if (p === "MODE_CHAT") {
    userModes[id] = "chat";
    return sendMessage(id, "💬 Mode Discuter activé.", tk);
  }

  if (p === "MODE_IMAGE") {
    userModes[id] = "image";
    return sendMessage(id, {
      text: "🖊️ Décrivez l'image à générer.",
      quick_replies: [{ content_type: "text", title: "🔄 Basculer", payload: "SWITCH_MODE" }]
    }, tk);
  }

  if (p === "SWITCH_MODE") {
    delete userModes[id];
    delete languagePaginationMap[id];
    delete awaitingLang[id];
    return sendModeQuickReply(id, tk);
  }

  if (p === "LANG_NEXT") {
    const s = languagePaginationMap[id];
    return askForLanguage(id, s.orig, tk, s.page + 1);
  }

  if (p.startsWith("LANG_") && awaitingLang[id]) {
    const langCode = p.replace("LANG_", "");
    const s = languagePaginationMap[id];
    if (!s) return sendMessage(id, "⚠️ périmé", tk);
    const tr = await translateText(s.orig, langCode);
    delete awaitingLang[id];
    delete languagePaginationMap[id];
    return sendMessage(id, { 
      text: tr, 
      quick_replies: [{ content_type: "text", title: "🔄 Basculer", payload: "SWITCH_MODE" }] 
    }, tk);
  }
};

const handleTextMessage = async (evt, tk) => {
  const id = evt.sender.id, txt = evt.message.text;
  console.log("User mode:", userModes[id]);
  if (!userModes[id]) return sendModeQuickReply(id, tk);

  if (userModes[id] === "translate") {
    return askForLanguage(id, txt, tk, 0);
  }

  if (userModes[id] === "chat") {
    return chatWithAI(txt, id, tk);
  }

  if (userModes[id] === "image") {
    try {
      const url = `https://kaiz-apis.gleeze.com/api/fluxwebui?prompt=${encodeURIComponent(txt)}&ratio=1:1&apikey=demo`;
      return sendMessage(id, {
        attachment: { type: "image", payload: { url, is_reusable: true } },
        quick_replies: [{ content_type: "text", title: "🔄 Basculer", payload: "SWITCH_MODE" }]
      }, tk);
    } catch {
      return sendMessage(id, "❌ Erreur image", tk);
    }
  }
};

const handleMessengerEvent = async (evt, tk) => {
  if (!evt.sender?.id) return;
  const id = evt.sender.id;

  if (evt.postback) {
    if (evt.postback.payload === "BYSOMBY") {
      await sendMessage(id, "👋 Bienvenue !", tk);
      return sendModeQuickReply(id, tk);
    }
  }

  if (evt.message?.quick_reply) return handleQuickReply(evt, tk);
  if (evt.message?.text) return handleTextMessage(evt, tk);
};

app.use(bodyParser.json());

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === 'somby') {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    for (const entry of body.entry) {
      const pageID = entry.id;
      const token = pageTokenMap[pageID];
      if (!token) continue;
      if (entry.messaging) {
        for (const evt of entry.messaging) {
          await handleMessengerEvent(evt, token);
        }
      }
    }
    return res.sendStatus(200);
  }
  res.sendStatus(404);
});

(async () => {
  await subscribePages();
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
})();