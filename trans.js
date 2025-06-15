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
      const { data } = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
        params: { access_token: token }
      });
      for (const page of data.data) {
        const pageId = page.id;
        const pageAccessToken = page.access_token;
        pageTokenMap[pageId] = pageAccessToken;

        await axios.post(`https://graph.facebook.com/v18.0/${pageId}/subscribed_apps`, {
          subscribed_fields: ['feed', 'group_feed', 'messages', 'messaging_postbacks', 'messaging_optins']
        }, {
          params: { access_token: pageAccessToken }
        });

        console.log(`✅ Subscribed: ${pageId}`);
      }
    } catch (e) {
      console.error(`❌ Failed:`, e.response?.data || e.message);
    }
  }
};

app.use(bodyParser.json());

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === "somby") {
    console.log('WEBHOOK_VERIFIED');
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

const sendMessage = async (id, msg, tk) => axios.post(
  `https://graph.facebook.com/v18.0/me/messages`,
  { recipient: { id }, message: typeof msg === 'object' ? msg : { text: msg } },
  { params: { access_token: tk } }
).catch(e => {
  console.error("❌ sendMessage error:", e.response?.data || e.message);
});

const sendPrivateReplyWithMenu = async (commentId, token) => {
  try {
    await axios.post(`https://graph.facebook.com/v18.0/me/messages`, {
      recipient: { comment_id: commentId },
      message: {
        text: "✅ Merci pour votre commentaire !",
        quick_replies: [
          { content_type: "text", title: "🔤 Traduire", payload: "MODE_TRANSLATE" },
          { content_type: "text", title: "💬 Discuter", payload: "MODE_CHAT" }
        ]
      },
      messaging_type: "RESPONSE"
    }, { params: { access_token: token } });
  } catch (e) {
    console.error("❌ Private reply failed:", e.response?.data || e.message);
  }
};

const userModes = {};
const languagePaginationMap = {};

const sendModeQuickReply = (id, tk) => sendMessage(id, {
  text: "Choisissez un mode :",
  quick_replies: [
    { content_type: "text", title: "🔤 Traduire", payload: "MODE_TRANSLATE" },
    { content_type: "text", title: "💬 Discuter", payload: "MODE_CHAT" }
  ]
}, tk);

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
  const url = `https://kaiz-apis.gleeze.com/api/gpt-4o-pro?ask=${encodeURIComponent(msg)}&uid=${id}&apikey=dd7096b0-3ac8-45ed-ad23-4669d15337f0`;
  try {
    const d = (await axios.get(url)).data;
    const text = Array.isArray(d.results)
      ? "🔎 Résultats :\n" + d.results.slice(0, 5).map(r => `${r.title}\n${r.snippet}\n${r.link}`).join("\n\n")
      : d.response || 'Aucune réponse.';
    return sendMessage(id, { text, quick_replies: [{ content_type: "text", title: "🔄 Basculer", payload: "SWITCH_MODE" }] }, tk);
  } catch {
    return sendMessage(id, "Erreur AI.", tk);
  }
};

const handleQuickReply = async (evt, tk) => {
  const id = evt.sender.id, p = evt.message.quick_reply.payload;
  if (p === "MODE_TRANSLATE") { userModes[id] = "translate"; return sendMessage(id, "📝 Envoyez un texte à traduire.", tk); }
  if (p === "MODE_CHAT") { userModes[id] = "chat"; return sendMessage(id, "💬 Mode discuter activé.", tk); }
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
  const id = evt.sender.id;
  const txt = evt.message.text;
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

app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    for (const entry of body.entry) {
      const pageID = entry.id;
      const token = pageTokenMap[pageID];
      if (!token) continue;

      if (entry.changes) {
        for (const change of entry.changes) {
          const isCommentAdd =
            change.value?.item === 'comment' &&
            change.value?.verb === 'add';

          if ((change.field === 'feed' || change.field === 'group_feed') && isCommentAdd) {
            const message = change.value.message || "";
            const commenterId = change.value.from?.id;
            const commentId = change.value.comment_id;

            if (/ok/i.test(message) && commenterId && commentId) {
              await sendMessage(commenterId, "Veuillez choisir une option.", token);
              await sendPrivateReplyWithMenu(commentId, token);
            }
          }
        }
      }

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

app.get('/setup', async (req, res) => {
  const results = [];
  for (const token of Object.values(pageTokenMap)) {
    try {
      const r = await axios.post(`https://graph.facebook.com/v18.0/me/messenger_profile`, {
        get_started: { payload: "BYSOMBY" }
      }, { params: { access_token: token } });
      results.push({ ok: true, data: r.data });
    } catch (e) {
      results.push({ ok: false, error: e.message });
    }
  }
  res.json(results);
});

(async () => {
  await subscribePages();
  app.listen(PORT, () => console.log(`🚀 Running on http://localhost:${PORT}`));
})();