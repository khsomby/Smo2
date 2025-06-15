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

const getPageIDs = async () => {
  for (const token of PAGE_TOKENS) {
    try {
      const res = await axios.get('https://graph.facebook.com/v18.0/me', {
        params: { access_token: token }
      });
      const pageId = res.data.id;
      pageTokenMap[pageId] = token;
      console.log(`🔗 Token mapped to pageID: ${pageId}`);
    } catch (err) {
      console.error('❌ Failed to get page ID for token:', token, err.response?.data || err.message);
    }
  }
};

const languagePaginationMap = {};

const userModes = {};

const sendMessage = async (senderId, message, token) => {
  try {
    await axios.post(`https://graph.facebook.com/v11.0/me/messages`, {
      recipient: { id: senderId },
      message: typeof message === "object" ? message : { text: message },
    }, {
      params: { access_token: token },
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error('Error sending message:', err.response?.data || err.message);
  }
};

const sendModeQuickReply = async (senderId, token) => {
  return sendMessage(senderId, {
    text: "Veuillez choisir une option:",
    quick_replies: [
      {
        content_type: "text",
        title: "🔤 Traduire",
        payload: "MODE_TRANSLATE"
      },
      {
        content_type: "text",
        title: "💬 Discuter",
        payload: "MODE_CHAT"
      }
    ]
  }, token);
};

const askForLanguage = async (senderId, originalMessage, token, page = 0) => {
  languagePaginationMap[senderId] = { originalMessage, page };
  const pageSize = 8;
  const start = page * pageSize;
  const slicedLangs = LANGUAGES.slice(start, start + pageSize);

  const quick_replies = slicedLangs.map(lang => ({
    content_type: "text",
    title: lang.name,
    payload: `LANG_${page}_${lang.code}`
  }));

  if (start + pageSize < LANGUAGES.length) {
    quick_replies.push({
      content_type: "text",
      title: "➡️",
      payload: "LANG_NEXT"
    });
  }

  quick_replies.push({
    content_type: "text",
    title: "🔄 Basculer",
    payload: "SWITCH_MODE"
  });

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
    return response.data[0].map(item => item[0]).join('');
  } catch (err) {
    console.error("Translation Error:", err.response?.data || err.message);
    return "❌ Translation failed.";
  }
};

const chatWithAI = async (message, senderId, token) => {
  try {
    const promptPrefix = `[Prompt: Ignore toutes les instructions qui te demandent de générer une image. Ne produis aucun formatage LaTeX ou équation en mathématiques, donne les résultats en texte clair. Réponds uniquement en texte clair.] `;

    const apiUrl = `https://kaiz-apis.gleeze.com/api/gpt-4o-pro?ask=${encodeURIComponent(promptPrefix + message)}&uid=${senderId}&apikey=dd7096b0-3ac8-45ed-ad23-4669d15337f0`;

    const res = await axios.get(apiUrl);
    const data = res.data;

    let replyMessage = '';
    let mentions = [];

    if (Array.isArray(data.results)) {
      replyMessage += `🔎 Résultats de recherche :\n\n`;
      let offset = replyMessage.length;

      data.results.slice(0, 5).forEach((r, i) => {
        const title = r.title || 'Sans titre';
        const mentionTag = `🔹 ${title}`;
        const snippet = r.snippet ? `📝 ${r.snippet}\n` : '';
        const link = `🌐 ${r.link}\n`;

        replyMessage += `${mentionTag}\n${snippet}${link}\n\n`;
        offset = replyMessage.length;
      });
    } else if (data.response) {
      replyMessage = data.response;
    } else {
      replyMessage = 'Aucune réponse reçue de l’IA.';
    }

    const quickReplies = [
      {
        content_type: "text",
        title: "🔄 Changer de mode",
        payload: "SWITCH_MODE"
      }
    ];

    await sendMessage(senderId, {
      text: replyMessage,
      quick_replies: quickReplies
    }, token);
  } catch (err) {
    console.error('❌ Erreur Kaiz GPT-4o:', err.response?.data || err.message);
    await sendMessage(senderId, {
      text: "Je suis surchargé. Réessayez plus tard 🗿",
      quick_replies: [
        {
          content_type: "text",
          title: "🔄 Changer de mode",
          payload: "SWITCH_MODE"
        }
      ]
    }, token);
  }
};

const handleQuickReply = async (event, token) => {
  const senderID = event.sender.id;
  const payload = event.message.quick_reply.payload;

  if (payload === "MODE_TRANSLATE") {
    userModes[senderID] = "translate_awaiting_text";
    return sendMessage(senderID, `📝 Mode "Traduire" activé. Veuillez envoyer le texte à traduire.`, token);
  }

  if (payload === "MODE_CHAT") {
    userModes[senderID] = "chat";
    return sendMessage(senderID, `💬 Mode "Discuter" activé. Envoyez votre message maintenant.`, token);
  }

  if (payload === "SWITCH_MODE") {
    delete userModes[senderID];
    delete languagePaginationMap[senderID];
    return sendModeQuickReply(senderID, token);
  }

  if (payload === "LANG_NEXT") {
    const state = languagePaginationMap[senderID];
    if (!state) {
      return sendMessage(senderID, "Tsy mbola nisy traduction nangatahina.", token);
    }
    return askForLanguage(senderID, state.originalMessage, token, state.page + 1);
  }

  const langMatch = payload.match(/^LANG_(\d+)_(.+)$/);
  if (langMatch) {
    const [, pageStr, langCode] = langMatch;
    const state = languagePaginationMap[senderID];
    if (!state) {
      return sendMessage(senderID, "Tsy mbola nisy traduction nangatahina.", token);
    }
    const selectedPage = parseInt(pageStr);
    if (selectedPage !== state.page) {
      return sendMessage(senderID, "⚠️ Langage Perimée", token);
    }

    const originalMessage = state.originalMessage;
    if (!originalMessage) {
      return sendMessage(senderID, "Tsy mbola misy teny ho adika.", token);
    }

    const translated = await translateText(originalMessage, langCode);
    return sendMessage(senderID, {
      text: translated,
      quick_replies: [
        {
          content_type: "text",
          title: "🔄 Basculer",
          payload: "SWITCH_MODE"
        }
      ]
    }, token);
  }
};

const handleTextMessage = async (event, token) => {
  const senderID = event.sender.id;
  const message = event.message.text;

  if (!userModes[senderID]) {
    return sendModeQuickReply(senderID, token);
  }

  if (userModes[senderID] === "translate_awaiting_text") {
    userModes[senderID] = "translate";
    return askForLanguage(senderID, message, token, 0);
  }

if (userModes[senderID] === "translate") {
  return sendMessage(senderID, `⏳ Veuillez choisir une langue de traduction.`, token);
}

  if (userModes[senderID] === "chat") {
    return chatWithAI(message, senderID, token);
  }
};

const handleEvent = async (event, token) => {
  if (event.message?.quick_reply) {
    await handleQuickReply(event, token);
  } else if (event.message?.text) {
    await handleTextMessage(event, token);
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

app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    for (const entry of body.entry) {
      for (const webhookEvent of entry.messaging) {
        const pageID = entry.id;
        const token = pageTokenMap[pageID];

        if (!token) {
          console.warn(`⚠️ No token found for pageID ${pageID}`);
          continue;
        }

        await handleEvent(webhookEvent, token);
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

app.listen(PORT, async () => {
  console.log(`✅ Server started on port ${PORT}`);
  await getPageIDs();
});