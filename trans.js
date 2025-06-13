const express = require('express');
const bodyParser = require('body-parser');
const axios = require("axios");

const app = express();
const PORT = 8080;
const PAGE_ACCESS_TOKEN = process.env.tok;

const LANGUAGES = [
  { code: "mg", name: "Malagasy 🇲🇬" }, { code: "en", name: "English 🇬🇧" },
  { code: "fr", name: "French 🇫🇷" }, { code: "es", name: "Spanish 🇪🇸" },
  { code: "de", name: "German 🇩🇪" }, { code: "zh", name: "Chinese 🇨🇳" },
  { code: "ru", name: "Russian 🇷🇺" }, { code: "ja", name: "Japanese 🇯🇵" },
  { code: "hi", name: "Hindi 🇮🇳" }, { code: "ar", name: "Arabic 🇸🇦" },
  { code: "pt", name: "Portuguese 🇵🇹" }, { code: "it", name: "Italian 🇮🇹" },
  { code: "id", name: "Indonesian 🇮🇩" }, { code: "tr", name: "Turkish 🇹🇷" },
  { code: "ko", name: "Korean 🇰🇷" }, { code: "pl", name: "Polish 🇵🇱" },
  { code: "ro", name: "Romanian 🇷🇴" }, { code: "vi", name: "Vietnamese 🇻🇳" },
  { code: "th", name: "Thai 🇹🇭" }, { code: "uk", name: "Ukrainian 🇺🇦" },
  { code: "ms", name: "Malay 🇲🇾" }, { code: "nl", name: "Dutch 🇳🇱" },
  { code: "sv", name: "Swedish 🇸🇪" }, { code: "fi", name: "Finnish 🇫🇮" },
  { code: "no", name: "Norwegian 🇳🇴" }, { code: "da", name: "Danish 🇩🇰" },
  { code: "hu", name: "Hungarian 🇭🇺" }, { code: "he", name: "Hebrew 🇮🇱" },
  { code: "cs", name: "Czech 🇨🇿" }, { code: "el", name: "Greek 🇬🇷" },
  { code: "sr", name: "Serbian 🇷🇸" }, { code: "hr", name: "Croatian 🇭🇷" },
  { code: "bg", name: "Bulgarian 🇧🇬" }, { code: "sk", name: "Slovak 🇸🇰" },
  { code: "sl", name: "Slovenian 🇸🇮" }, { code: "fa", name: "Persian 🇮🇷" },
  { code: "et", name: "Estonian 🇪🇪" }, { code: "lv", name: "Latvian 🇱🇻" },
  { code: "lt", name: "Lithuanian 🇱🇹" }, { code: "bn", name: "Bengali 🇧🇩" },
  { code: "ta", name: "Tamil 🇮🇳" }, { code: "te", name: "Telugu 🇮🇳" },
  { code: "kn", name: "Kannada 🇮🇳" }, { code: "ml", name: "Malayalam 🇮🇳" },
  { code: "mr", name: "Marathi 🇮🇳" }, { code: "ur", name: "Urdu 🇵🇰" },
  { code: "pa", name: "Punjabi 🇮🇳" }, { code: "gu", name: "Gujarati 🇮🇳" },
  { code: "am", name: "Amharic 🇪🇹" }, { code: "zu", name: "Zulu 🇿🇦" }
];

const languagePaginationMap = {}; // Store original text + page index per sender

const sendMessage = async (senderId, message) => {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v11.0/me/messages`,
      {
        recipient: { id: senderId },
        message: typeof message === "object" ? message : { text: message },
      },
      {
        params: { access_token: PAGE_ACCESS_TOKEN },
        headers: { "Content-Type": "application/json" },
      }
    );
    return response.data;
  } catch (err) {
    console.error('Error sending message:', err.response ? err.response.data : err);
  }
};

const askForLanguage = async (senderId, originalMessage, page = 0) => {
  languagePaginationMap[senderId] = { originalMessage, page };

  const pageSize = 12;
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
      title: "➡️ Next",
      payload: "LANG_NEXT"
    });
  }

  return sendMessage(senderId, {
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

    return response.data[0][0][0];
  } catch (err) {
    console.error("Translation Error:", err.response ? err.response.data : err);
    return "❌ Translation failed.";
  }
};

const listenMessage = async (event) => {
  const senderID = event.sender.id;
  const message = event.message.text;
  if (!senderID || !message) return;

  return askForLanguage(senderID, message);
};

const listenQuickReply = async (event) => {
  const senderID = event.sender.id;
  const payload = event.message.quick_reply.payload;

  if (!payload.startsWith("LANG_")) return;

  const state = languagePaginationMap[senderID];
  if (!state) return sendMessage(senderID, "❌ No text to translate.");

  if (payload === "LANG_NEXT") {
    const nextPage = state.page + 1;
    return askForLanguage(senderID, state.originalMessage, nextPage);
  }

  const langCode = payload.replace("LANG_", "");
  const translated = await translateText(state.originalMessage, langCode);
  return sendMessage(senderID, translated);
};

const handleEvent = async (event) => {
  if (event.message && event.message.quick_reply) {
    await listenQuickReply(event);
  } else if (event.message && event.message.text) {
    await listenMessage(event);
  }
};

app.use(bodyParser.json());

app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "somby";
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Webhook verified!');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

app.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    body.entry.forEach(async entry => {
      const webhookEvent = entry.messaging[0];
      await handleEvent(webhookEvent);
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});