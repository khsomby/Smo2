const express = require('express');
const bodyParser = require('body-parser');
const axios = require("axios");

const app = express();
const PORT = 8080;

const PAGE_ACCESS_TOKEN = process.env.tok;

const LANGUAGES = [
    { code: "af", name: "Afrikaans 🇿🇦" },
    { code: "sq", name: "Albanian 🇦🇱" },
    { code: "am", name: "Amharic 🇪🇹" },
    { code: "ar", name: "Arabic 🇸🇦" },
    { code: "hy", name: "Armenian 🇦🇲" },
    { code: "az", name: "Azerbaijani 🇦🇿" },
    { code: "eu", name: "Basque 🇪🇸" },
    { code: "be", name: "Belarusian 🇧🇾" },
    { code: "bn", name: "Bengali 🇧🇩" },
    { code: "bs", name: "Bosnian 🇧🇦" },
    { code: "bg", name: "Bulgarian 🇧🇬" },
    { code: "my", name: "Burmese 🇲🇲" },
    { code: "ca", name: "Catalan 🇪🇸" },
    { code: "zh", name: "Chinese 🇨🇳" },
    { code: "hr", name: "Croatian 🇭🇷" },
    { code: "cs", name: "Czech 🇨🇿" },
    { code: "da", name: "Danish 🇩🇰" },
    { code: "nl", name: "Dutch 🇳🇱" },
    { code: "en", name: "English 🇬🇧" },
    { code: "et", name: "Estonian 🇪🇪" },
    { code: "fi", name: "Finnish 🇫🇮" },
    { code: "fr", name: "French 🇫🇷" },
    { code: "gl", name: "Galician 🇪🇸" },
    { code: "ka", name: "Georgian 🇬🇪" },
    { code: "de", name: "German 🇩🇪" },
    { code: "el", name: "Greek 🇬🇷" },
    { code: "gu", name: "Gujarati 🇮🇳" },
    { code: "ht", name: "Haitian Creole 🇭🇹" },
    { code: "he", name: "Hebrew 🇮🇱" },
    { code: "hi", name: "Hindi 🇮🇳" },
    { code: "hu", name: "Hungarian 🇭🇺" },
    { code: "is", name: "Icelandic 🇮🇸" },
    { code: "id", name: "Indonesian 🇮🇩" },
    { code: "ga", name: "Irish 🇮🇪" },
    { code: "it", name: "Italian 🇮🇹" },
    { code: "ja", name: "Japanese 🇯🇵" },
    { code: "kn", name: "Kannada 🇮🇳" },
    { code: "kk", name: "Kazakh 🇰🇿" },
    { code: "km", name: "Khmer 🇰🇭" },
    { code: "ko", name: "Korean 🇰🇷" },
    { code: "lo", name: "Lao 🇱🇦" },
    { code: "lv", name: "Latvian 🇱🇻" },
    { code: "lt", name: "Lithuanian 🇱🇹" },
    { code: "mk", name: "Macedonian 🇲🇰" },
    { code: "mg", name: "Malagasy 🇲🇬" },
    { code: "ms", name: "Malay 🇲🇾" },
    { code: "ml", name: "Malayalam 🇮🇳" },
    { code: "mt", name: "Maltese 🇲🇹" },
    { code: "mi", name: "Maori 🇳🇿" },
    { code: "mr", name: "Marathi 🇮🇳" },
    { code: "mn", name: "Mongolian 🇲🇳" },
    { code: "ne", name: "Nepali 🇳🇵" },
    { code: "no", name: "Norwegian 🇳🇴" },
    { code: "ps", name: "Pashto 🇦🇫" },
    { code: "fa", name: "Persian 🇮🇷" },
    { code: "pl", name: "Polish 🇵🇱" },
    { code: "pt", name: "Portuguese 🇵🇹" },
    { code: "pa", name: "Punjabi 🇮🇳" },
    { code: "ro", name: "Romanian 🇷🇴" },
    { code: "ru", name: "Russian 🇷🇺" },
    { code: "sr", name: "Serbian 🇷🇸" },
    { code: "si", name: "Sinhala 🇱🇰" },
    { code: "sk", name: "Slovak 🇸🇰" },
    { code: "sl", name: "Slovenian 🇸🇮" },
    { code: "so", name: "Somali 🇸🇴" },
    { code: "es", name: "Spanish 🇪🇸" },
    { code: "sw", name: "Swahili 🇰🇪" },
    { code: "sv", name: "Swedish 🇸🇪" },
    { code: "tl", name: "Tagalog 🇵🇭" },
    { code: "tg", name: "Tajik 🇹🇯" },
    { code: "ta", name: "Tamil 🇮🇳" },
    { code: "te", name: "Telugu 🇮🇳" },
    { code: "th", name: "Thai 🇹🇭" },
    { code: "tr", name: "Turkish 🇹🇷" },
    { code: "uk", name: "Ukrainian 🇺🇦" },
    { code: "ur", name: "Urdu 🇵🇰" },
    { code: "uz", name: "Uzbek 🇺🇿" },
    { code: "vi", name: "Vietnamese 🇻🇳" },
    { code: "cy", name: "Welsh 🏴󠁧󠁢󠁷󠁬󠁳󠁿" },
    { code: "xh", name: "Xhosa 🇿🇦" },
    { code: "yi", name: "Yiddish" },
    { code: "yo", name: "Yoruba 🇳🇬" },
    { code: "zu", name: "Zulu 🇿🇦" }
];

const ITEMS_PER_PAGE = 14;

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
    throw err;
  }
};

const askForLanguage = async (senderId, originalMessage, page = 0) => {
  const startIdx = page * ITEMS_PER_PAGE;
  const endIdx = startIdx + ITEMS_PER_PAGE;
  const languagesForPage = LANGUAGES.slice(startIdx, endIdx);
  
  const quick_replies = languagesForPage.map(language => ({
    content_type: "text",
    title: language.name,
    payload: JSON.stringify({ 
      type: "language_selection",
      language: language.code,
      originalMessage 
    }),
  }));

  // Add "Next" button if there are more languages
  if (endIdx < LANGUAGES.length) {
    quick_replies.push({
      content_type: "text",
      title: "Next ➡️",
      payload: JSON.stringify({
        type: "language_page",
        page: page + 1,
        originalMessage
      })
    });
  }

  // Add "Previous" button if not on first page
  if (page > 0) {
    quick_replies.unshift({
      content_type: "text",
      title: "⬅️ Previous",
      payload: JSON.stringify({
        type: "language_page",
        page: page - 1,
        originalMessage
      })
    });
  }

  return sendMessage(senderId, {
    text: "Select a language:",
    quick_replies,
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

    const translatedText = response.data[0][0][0];
    
    return translatedText;
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
  const quickReplyPayload = event.message.quick_reply.payload;
  
  if (!quickReplyPayload) return;
  
  try {
    const payload = JSON.parse(quickReplyPayload);
    
    if (payload.type === "language_page") {
      // Handle pagination request
      return askForLanguage(senderID, payload.originalMessage, payload.page);
    } else if (payload.type === "language_selection") {
      // Handle language selection
      const { language, originalMessage } = payload;
      const translatedText = await translateText(originalMessage, language);
      return sendMessage(senderID, `${translatedText}`);
    }
  } catch (err) {
    console.error("Error processing quick reply:", err);
    return sendMessage(senderID, "❌ There was an error processing your request.");
  }
};

const handleEvent = async (event) => {
  if (event.message && event.message.quick_reply) {
    await listenQuickReply(event);
  } else if (event.message) {
    await listenMessage(event);
  }
};

app.use(bodyParser.json());

app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = "veme";
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