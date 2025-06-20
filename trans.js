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
const path = require('path');

const app = express();
const PORT = 8080;

const PAGE_TOKENS_FILE = './token.txt';
const KEYWORDS_FILE = './keywords.json';

if (!fs.existsSync(KEYWORDS_FILE)) {
  fs.writeFileSync(KEYWORDS_FILE, JSON.stringify({}));
}

const PAGE_TOKENS = fs.readFileSync(PAGE_TOKENS_FILE, 'utf8')
  .split('\n')
  .map(t => t.trim())
  .filter(Boolean);

const pageTokenMap = {};
const userModes = {};
const languagePaginationMap = {};
const userImageMap = {};
const pageKeywordsMap = {};
const pageReplySettings = {};

const loadKeywords = () => {
  try {
    const data = fs.readFileSync(KEYWORDS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error("Error loading keywords:", err);
    return {};
  }
};

const saveKeywords = (data) => {
  fs.writeFileSync(KEYWORDS_FILE, JSON.stringify(data, null, 2));
};

const initializePageData = async () => {
  const keywordsData = loadKeywords();
  
  for (const token of PAGE_TOKENS) {
    try {
      const res = await axios.get('https://graph.facebook.com/v18.0/me', {
        params: { access_token: token, fields: 'id,name' }
      });
      
      const pageId = res.data.id;
      pageTokenMap[pageId] = token;
      
      // Initialize page settings
      if (!pageKeywordsMap[pageId]) {
        pageKeywordsMap[pageId] = keywordsData[pageId] || {};
      }
      
      if (!pageReplySettings[pageId]) {
        pageReplySettings[pageId] = {
          publicReply: "Merci pour votre commentaire!",
          privateReply: "Merci pour votre commentaire! Comment puis-je vous aider?",
          activeKeywords: {}
        };
      }
      
      // Subscribe to webhooks
      await axios.post(`https://graph.facebook.com/v18.0/${pageId}/subscribed_apps`, {
        subscribed_fields: ['feed', 'messages', 'messaging_postbacks', 'messaging_optins']
      }, { params: { access_token: token } });
      
      console.log(`✅ Initialized page ${res.data.name} (${pageId})`);
    } catch (err) {
      console.error(`❌ Initialization failed for token:`, err.response?.data || err.message);
    }
  }
  
  console.log("📌 Active pages:", Object.keys(pageTokenMap));
};

// Messenger functions
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

const sendPrivateReplyWithMenu = async (commentId, token, pageId) => {
  const settings = pageReplySettings[pageId];
  try {
    await axios.post('https://graph.facebook.com/v18.0/me/messages', {
      recipient: { comment_id: commentId },
      message: {
        text: settings.privateReply || "✅ Merci pour votre commentaire sur notre publication ! Comment puis-je vous aider ?",
        quick_replies: [
          { content_type: "text", title: "🔤 Traduire", payload: "MODE_TRANSLATE" },
          { content_type: "text", title: "💬 Discuter", payload: "MODE_CHAT" },
          { content_type: "text", title: "🖼️ Générer Image", payload: "MODE_IMAGE" }
        ]
      },
      messaging_type: "RESPONSE"
    }, { params: { access_token: token } });
  } catch (e) {
    console.error("❌ Private reply failed:", e.response?.data || e.message);
  }
};

const sendPublicCommentReply = async (commentId, message, token) => {
  try {
    await axios.post(`https://graph.facebook.com/v18.0/${commentId}/comments`, {
      message
    }, { params: { access_token: token } });
  } catch (e) {
    console.error("❌ Public comment reply failed:", e.response?.data || e.message);
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
  languagePaginationMap[id] = { orig, page };
  const pag = LANGUAGES.slice(page * 8, page * 8 + 8);
  const qr = pag.map(l => ({ content_type: "text", title: l.name, payload: `LANG_${page}_${l.code}` }));
  if ((page + 1) * 8 < LANGUAGES.length) qr.push({ content_type: "text", title: "➡️", payload: "LANG_NEXT" });
  qr.push({ content_type: "text", title: "🔄 Basculer", payload: "SWITCH_MODE" });
  return sendMessage(id, { text: "Choisissez la langue :", quick_replies: qr }, tk);
};

const chatWithAI = async (msg, id, tk) => {
  const mss = `[Prompt: Tu es une IA assistante et tu ne dois jamais générer une image et utiliser des latex ou des styles markdown dans tes réponses.]\n${msg}`;
  const url = `https://kaiz-apis.gleeze.com/api/gpt-4o-pro?ask=${encodeURIComponent(mss)}&uid=${id}&apikey=dd7096b0-3ac8-45ed-ad23-4669d15337f0`;
  let text = 'Aucune réponse.';
  try {
    const d = (await axios.get(url)).data;
    if (Array.isArray(d.results)) {
      text = "🔎 Résultats :\n" + d.results.slice(0, 5).map(r => `${r.title}\n${r.snippet}\n${r.link}`).join("\n\n");
    } else {
      text = d.response || text;
    }
  } catch { }
  return sendMessage(id, { text, quick_replies: [{ content_type: "text", title: "🔄 Basculer", payload: "SWITCH_MODE" }] }, tk);
};

const handleQuickReply = async (evt, tk) => {
  const id = evt.sender.id;
  const p = evt.message.quick_reply.payload;
  if (p === "MODE_TRANSLATE") { userModes[id] = "translate"; return sendMessage(id, "📝 Mode Traduire. Envoyez un texte.", tk); }
  if (p === "MODE_CHAT") { userModes[id] = "chat"; return sendMessage(id, "💬 Mode Discuter activé.", tk); }
  if (p === "MODE_IMAGE") { userModes[id] = "image"; return sendMessage(id, {
    text: "🖊️ Décrivez l'image à générer.",
    quick_replies: [{ content_type: "text", title: "🔄 Basculer", payload: "SWITCH_MODE" }]
  }, tk); }
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

const handleTextMessage = async (evt, tk) => {
  const id = evt.sender.id, txt = evt.message.text;
  if (!userModes[id]) return sendModeQuickReply(id, tk);

  if (userModes[id] === "translate") {
    return askForLanguage(id, txt, tk, 0);
  }
  if (userModes[id] === "chat") {
    return chatWithAI(txt, id, tk);
  }
  if (userModes[id] === "image") {
    try {
      const url = `https://kaiz-apis.gleeze.com/api/chatbotru-gen?prompt=${encodeURIComponent(txt)}&model=realistic&apikey=dd7096b0-3ac8-45ed-ad23-4669d15337f0`;
      const resp = await axios.get(url);
      return sendMessage(id, {
        attachment: { type: "image", payload: { url: resp.data.url, is_reusable: true } },
        quick_replies: [{ content_type: "text", title: "🔄 Basculer", payload: "SWITCH_MODE" }]
      }, tk);
    } catch {
      return sendMessage(id, "❌ Erreur lors de la génération d'image.", tk);
    }
  }
};

const handlePostback = (evt, tk) => {
  if (evt.postback.payload === "BYSOMBY") {
    const id = evt.sender.id;
    return sendMessage(id, "👋 Bienvenue sur notre page ! Écrivez 'Bot' pour commencer.", tk)
      .then(() => sendModeQuickReply(id, tk));
  }
};

const handleMessengerEvent = async (evt, tk) => {
  const id = evt.sender.id;
  if (evt.postback) return handlePostback(evt, tk);
  if (evt.message?.quick_reply) return handleQuickReply(evt, tk);

  if (evt.message?.attachments?.[0]?.type === 'image') {
    if (userModes[id] === 'image') {
      const imageUrl = evt.message.attachments[0].payload.url;
      try {
        await sendTyping(id, tk);
        const url = `https://kaiz-apis.gleeze.com/api/gpt-4o-pro?ask=${encodeURIComponent("image of what is that ?")}&uid=${id}&imageUrl=${encodeURIComponent(imageUrl)}&apikey=dd7096b0-3ac8-45ed-ad23-4669d15337f0`;
        const resp = await axios.get(url);
        return sendMessage(id, {
          text: `🧠 ${resp.data.response || "Pas de réponse reçue."}`,
          quick_replies: [{ content_type: "text", title: "🔄 Basculer", payload: "SWITCH_MODE" }]
        }, tk);
      } catch {
        return sendMessage(id, "❌ Erreur lors de l'analyse de l'image.", tk);
      }
    } else if (userModes[id] === 'chat') {
      return sendMessage(id, "📸 Belle image ! Voulez-vous en parler ?", tk);
    } else {
      return sendMessage(id, "❌ Ce mode ne permet pas d'envoyer des images. Essayez '💬 Discuter'.", tk);
    }
  }

  if (evt.message?.text) {
    return handleTextMessage(evt, tk);
  }
};

const handleCommentEvent = async (change, pageId) => {
  const token = pageTokenMap[pageId];
  if (!token) return;

  const message = change.value.message || "";
  const commenterId = change.value.from?.id;
  const commentId = change.value.comment_id;
  const parentId = change.value.parent_id;

  if (parentId) return;

  const keywords = pageKeywordsMap[pageId] || {};
  const activeKeywords = pageReplySettings[pageId]?.activeKeywords || {};
  
  let keywordMatch = null;
  for (const [keyword, settings] of Object.entries(activeKeywords)) {
    if (new RegExp(keyword, 'i').test(message)) {
      keywordMatch = settings;
      break;
    }
  }

  if (keywordMatch) {
    if (keywordMatch.publicReply) {
      await sendPublicCommentReply(commentId, keywordMatch.publicReply, token);
    }
    if (keywordMatch.privateReply && commenterId) {
      await sendPrivateReplyWithMenu(commentId, token, pageId);
    }
  } else {
    const settings = pageReplySettings[pageId];
    if (settings.publicReply) {
      await sendPublicCommentReply(commentId, settings.publicReply, token);
    }
    if (settings.privateReply && commenterId) {
      await sendPrivateReplyWithMenu(commentId, token, pageId);
    }
  }
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

      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === 'feed' && change.value.item === 'comment' && change.value.verb === 'add') {
            await handleCommentEvent(change, pageID);
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

const mustacheExpress = require('mustache-express');

app.engine('html', mustacheExpress());
app.set('view engine', 'html');
app.set('views', path.join(__dirname, 'public/admin'));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin/', async (req, res) => {
  const accessToken = req.query.access_token;
  if (!accessToken) {
    return res.sendFile(path.join(__dirname, 'public/admin/login.html'));
  }

  let pageId = null;
  let pageName = "Inconnu";
  
  for (const [pid, tk] of Object.entries(pageTokenMap)) {
    if (tk === accessToken) {
      pageId = pid;
      break;
    }
  }

  if (!pageId) {
    return res.status(403).send("Token d'accès invalide");
  }

  try {
    const resPage = await axios.get(`https://graph.facebook.com/v18.0/${pageId}`, {
      params: { access_token: accessToken, fields: 'name' }
    });
    pageName = resPage.data.name;
  } catch (err) {
    console.error("Error getting page name:", err);
  }

  const settings = pageReplySettings[pageId] || {};
  const activeKeywords = settings.activeKeywords || {};

  const keywords = Object.entries(activeKeywords).map(([keyword, settings]) => ({
    keyword,
    publicReply: settings.publicReply,
    privateReply: settings.privateReply
  }));

  res.render('index', {
    pageName,
    pageId,
    publicReply: settings.publicReply || '',
    privateReply: settings.privateReply || '',
    keywords,
    accessToken,
    encode: encodeURIComponent
  });
});

app.post('/update-settings', async (req, res) => {
  const accessToken = req.query.access_token;
  if (!accessToken) return res.status(403).send('Token required');

  let pageId = null;
  for (const [pid, tk] of Object.entries(pageTokenMap)) {
    if (tk === accessToken) {
      pageId = pid;
      break;
    }
  }

  if (!pageId) return res.status(403).send('Invalid token');

  const { publicReply, privateReply } = req.body;
  
  if (!pageReplySettings[pageId]) {
    pageReplySettings[pageId] = {};
  }
  
  pageReplySettings[pageId].publicReply = publicReply;
  pageReplySettings[pageId].privateReply = privateReply;
  
  res.sendStatus(200);
});

app.post('/add-keyword', async (req, res) => {
  const accessToken = req.query.access_token;
  if (!accessToken) return res.status(403).send('Token required');

  let pageId = null;
  for (const [pid, tk] of Object.entries(pageTokenMap)) {
    if (tk === accessToken) {
      pageId = pid;
      break;
    }
  }

  if (!pageId) return res.status(403).send('Invalid token');

  const { keyword, publicReply, privateReply } = req.body;
  
  if (!pageReplySettings[pageId]) {
    pageReplySettings[pageId] = { activeKeywords: {} };
  }
  
  if (!pageReplySettings[pageId].activeKeywords) {
    pageReplySettings[pageId].activeKeywords = {};
  }
  
  pageReplySettings[pageId].activeKeywords[keyword] = {
    publicReply,
    privateReply
  };
  
  // Update keywords file
  const keywordsData = loadKeywords();
  if (!keywordsData[pageId]) keywordsData[pageId] = {};
  keywordsData[pageId][keyword] = { publicReply, privateReply };
  saveKeywords(keywordsData);
  
  res.sendStatus(200);
});

app.delete('/delete-keyword', async (req, res) => {
  const accessToken = req.query.access_token;
  const keyword = req.query.keyword;
  
  if (!accessToken || !keyword) return res.status(400).send('Missing parameters');

  let pageId = null;
  for (const [pid, tk] of Object.entries(pageTokenMap)) {
    if (tk === accessToken) {
      pageId = pid;
      break;
    }
  }

  if (!pageId) return res.status(403).send('Invalid token');

  if (pageReplySettings[pageId]?.activeKeywords?.[keyword]) {
    delete pageReplySettings[pageId].activeKeywords[keyword];
    
    // Update keywords file
    const keywordsData = loadKeywords();
    if (keywordsData[pageId]?.[keyword]) {
      delete keywordsData[pageId][keyword];
      saveKeywords(keywordsData);
    }
    
    res.sendStatus(200);
  } else {
    res.status(404).send('Keyword not found');
  }
});

(async () => {
  await initializePageData();
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
})();