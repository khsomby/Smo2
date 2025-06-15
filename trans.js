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

const tokenFile = './token.txt';
const PAGE_TOKENS = fs.readFileSync(tokenFile, 'utf8')
  .split('\n')
  .map(t => t.trim())
  .filter(Boolean);

const pageTokenMap = {};

const subscribePages = async () => {
  for (const token of PAGE_TOKENS) {
    try {
      const meRes = await axios.get('https://graph.facebook.com/v18.0/me', {
        params: { access_token: token }
      });
      const pageId = meRes.data.id;
      pageTokenMap[pageId] = token;

      await axios.post(`https://graph.facebook.com/v18.0/${pageId}/subscribed_apps`, {
        subscribed_fields: ['feed', 'messages', 'messaging_postbacks', 'messaging_optins']
      }, { params: { access_token: token } });

      console.log(`✅ Subscribed: ${pageId}`);
    } catch (e) {
      console.error(`❌ Failed to subscribe:`, e.response?.data || e.message);
    }
  }
};

app.get('/setup', async (req, res) => {
  const results = [];
  for (const token of PAGE_TOKENS) {
    try {
      const r = await axios.post(`https://graph.facebook.com/v18.0/me/messenger_profile`, {
        get_started: { payload: "BYSOMBY" }
      }, { params: { access_token: token }});
      results.push({ token, ok: true });
    } catch (e) {
      results.push({ token, ok: false, error: e.message });
    }
  }
  res.json(results);
});

app.use(bodyParser.json());

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === "somby") {
      console.log('WEBHOOK_VERIFIED');
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;

  console.log("🔔 Received webhook event:", JSON.stringify(body, null, 2));

  if (body.object === 'page') {
    for (const entry of body.entry) {
      const pageID = entry.id;
      const token = pageTokenMap[pageID];
      if (!token) {
        console.warn(`⚠️ No token found for page ${pageID}`);
        continue;
      }

      // Handle feed changes like comments on posts
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === 'feed' && change.item === 'comment' && change.verb === 'add') {
            const commentId = change.value.comment_id;
            const message = change.value.message || "";
            const fromId = change.value.from?.id;

            console.log(`📝 New comment on feed: ${message} (comment_id: ${commentId}, from_id: ${fromId})`);

            if (/ok/i.test(message)) {
              // Send a private message to the commenter if user ID is known
              if (fromId) {
                try {
                  await axios.post(`https://graph.facebook.com/v18.0/me/messages`, {
                    recipient: { id: fromId },
                    message: { text: "✅ Merci pour votre 'ok' ! N'hésitez pas à poser une question ou demander une traduction." },
                    messaging_type: "RESPONSE"
                  }, {
                    params: { access_token: token }
                  });
                  console.log(`✅ Sent private reply to user ${fromId}`);
                } catch (e) {
                  console.error("❌ Failed to send private reply:", e.response?.data || e.message);
                }
              } else {
                console.warn("⚠️ No user ID found for private reply");
              }
            }
          }
        }
      }

      // Handle messenger events (messages, postbacks, etc)
      if (entry.messaging) {
        for (const evt of entry.messaging) {
          handleMessengerEvent(evt, token);
        }
      }
    }
    return res.sendStatus(200);
  }

  res.sendStatus(404);
});

const languagePaginationMap = {};
const userModes = {};

const sendMessage = async (id, msg, tk) => axios.post(
  `https://graph.facebook.com/v11.0/me/messages`,
  { recipient: { id }, message: typeof msg === 'object' ? msg : { text: msg } },
  { params: { access_token: tk } }
).catch(e => {
  console.error("❌ sendMessage error:", e.response?.data || e.message);
});

const sendModeQuickReply = (id, tk) => sendMessage(id, {
  text: "Choisissez un mode :",
  quick_replies: [
    { content_type: "text", title: "🔤 Traduire", payload: "MODE_TRANSLATE" },
    { content_type: "text", title: "💬 Discuter", payload: "MODE_CHAT" }
  ]
}, tk);

const LANGUAGES = [
  { name: "Français", code: "fr" },
  { name: "English", code: "en" },
  { name: "Español", code: "es" },
  { name: "Deutsch", code: "de" },
  { name: "Italiano", code: "it" },
  { name: "Português", code: "pt" },
  { name: "Русский", code: "ru" },
  { name: "中文", code: "zh-CN" },
  { name: "日本語", code: "ja" },
  // Add more languages if needed
];

const askForLanguage = (id, orig, tk, page = 0) => {
  languagePaginationMap[id] = { orig, page };
  const pag = LANGUAGES.slice(page * 8, page * 8 + 8);
  const qr = pag.map(l => ({ content_type: "text", title: l.name, payload: `LANG_${page}_${l.code}` }));
  if ((page + 1) * 8 < LANGUAGES.length) qr.push({ content_type: "text", title: "➡️", payload: "LANG_NEXT" });
  qr.push({ content_type: "text", title: "🔄 Basculer", payload: "SWITCH_MODE" });
  return sendMessage(id, { text: "Choisissez la langue :", quick_replies: qr }, tk);
};

const translateText = async (txt, lang) => {
  try {
    const r = await axios.get(`https://translate.googleapis.com/translate_a/single`, {
      params: { client: 'gtx', sl: 'auto', tl: lang, dt: 't', q: txt }
    });
    return r.data[0].map(i => i[0]).join('');
  } catch {
    return "Erreur lors de la traduction.";
  }
};

const chatWithAI = async (msg, id, tk) => {
  const prefix = `[Ignore image req, pas de LaTeX...] `;
  const url = `https://kaiz-apis.gleeze.com/api/gpt-4o-pro?ask=${encodeURIComponent(prefix + msg)}&uid=${id}&apikey=...`;
  let text = 'Aucune réponse.';
  try {
    const d = (await axios.get(url)).data;
    if (Array.isArray(d.results)) text = "🔎 Résultats :\n" + d.results.slice(0, 5).map(r => `${r.title}\n${r.snippet}\n${r.link}`).join("\n\n");
    else text = d.response || text;
  } catch { }
  return sendMessage(id, { text, quick_replies: [{ content_type: "text", title: "🔄 Basculer", payload: "SWITCH_MODE" }] }, tk);
};

const handleQuickReply = async (evt, tk) => {
  const id = evt.sender.id, p = evt.message.quick_reply.payload;
  if (p === "MODE_TRANSLATE") { userModes[id] = "translate"; return sendMessage(id, "📝 Mode Traduire. Envoyez un texte.", tk); }
  if (p === "MODE_CHAT") { userModes[id] = "chat"; return sendMessage(id, "💬 Mode Discuter activé.", tk); }
  if (p === "SWITCH_MODE") { delete userModes[id]; delete languagePaginationMap[id]; return sendModeQuickReply(id, tk); }
  if (p === "LANG_NEXT") { const s = languagePaginationMap[id]; return askForLanguage(id, s.orig, tk, s.page + 1); }
  const m = p.match(/^LANG_(\d+)_(.+)$/);
  if (m) {
    const s = languagePaginationMap[id];
    if (!s || s.page != +m[1]) return sendMessage(id, "⚠️ périmé", tk);
    const tr = await translateText(s.orig, m[2]);
    return sendMessage(id, { text: tr, quick_replies: [{ content_type: "text", title: "🔄 Basculer", payload: "SWITCH_MODE" }] }, tk);
  }
};

const handleTextMessage = (evt, tk) => {
  const id = evt.sender.id, txt = evt.message.text;
  if (!userModes[id]) return sendModeQuickReply(id, tk);
  if (userModes[id] === "translate") return askForLanguage(id, txt, tk, 0);
  if (userModes[id] === "chat") return chatWithAI(txt, id, tk);
};

const handlePostback = (evt, tk) => {
  if (evt.postback.payload === "BYSOMBY") {
    const id = evt.sender.id;
    return sendMessage(id, "👋 Bienvenue !", tk).then(() => sendModeQuickReply(id, tk));
  }
};

const handleMessengerEvent = (evt, tk) => {
  if (evt.postback) return handlePostback(evt, tk);
  if (evt.message?.quick_reply) return handleQuickReply(evt, tk);
  if (evt.message?.text) return handleTextMessage(evt, tk);
};

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server started on http://localhost:${PORT}`);
  await subscribePages();
});