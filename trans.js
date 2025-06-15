
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
        title: "🔤 Translate",
        payload: "MODE_TRANSLATE"
      },
      {
        content_type: "text",
        title: "💬 Chat",
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
      title: "➡️ More",
      payload: "LANG_NEXT"
    });
  }

  quick_replies.push({
    content_type: "text",
    title: "🔄 Switch Mode",
    payload: "SWITCH_MODE"
  });

  return sendMessage(senderId, {
    text: "Select the target language:",
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
  const reply = `You said: "${message}"`;

  const quickReplies = [
    {
      content_type: "text",
      title: "🔄 Switch Mode",
      payload: "SWITCH_MODE"
    }
  ];

  await sendMessage(senderId, {
    text: reply,
    quick_replies: quickReplies
  }, token);
};

const handleQuickReply = async (event, token) => {
  const senderID = event.sender.id;
  const payload = event.message.quick_reply.payload;

  if (payload === "MODE_TRANSLATE") {
    userModes[senderID] = "translate";
    return askForLanguage(senderID, null, token, 0);
  }

  if (payload === "MODE_CHAT") {
    userModes[senderID] = "chat";
    return sendMessage(senderID, "💬 Chat mode enabled. Send me any message.", token);
  }

  if (payload === "SWITCH_MODE") {
    delete userModes[senderID];
    delete languagePaginationMap[senderID];
    return sendModeQuickReply(senderID, token);
  }

  if (payload === "LANG_NEXT") {
    const state = languagePaginationMap[senderID];
    if (!state) {
      return sendMessage(senderID, "❌ No active translation request.", token);
    }
    return askForLanguage(senderID, state.originalMessage, token, state.page + 1);
  }

  const langMatch = payload.match(/^LANG_(\d+)_(.+)$/);
  if (langMatch) {
    const [, pageStr, langCode] = langMatch;
    const state = languagePaginationMap[senderID];
    if (!state) {
      return sendMessage(senderID, "❌ No active translation request.", token);
    }
    const selectedPage = parseInt(pageStr);
    if (selectedPage !== state.page) {
      return sendMessage(senderID, "⚠️ Language selection expired, please try again.", token);
    }

    const originalMessage = state.originalMessage;
    if (!originalMessage) {
      return sendMessage(senderID, "❌ No text to translate.", token);
    }

    const translated = await translateText(originalMessage, langCode);
    return sendMessage(senderID, {
      text: translated,
      quick_replies: [
        {
          content_type: "text",
          title: "🔄 Switch Mode",
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

  if (userModes[senderID] === "translate") {
    return askForLanguage(senderID, message, token, 0);
  }

  if (userModes[senderID] === "chat") {
    const mess = `[Prompt: Your name is AI. Never format your answer with latex calcuation. Just use normal text especially for calcul]\n${message}`;
    return chatWithAI(mess, senderID, token);
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