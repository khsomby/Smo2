const express = require('express');
const bodyParser = require('body-parser');
const axios = require("axios");

const app = express();
const PORT = process.env.PORT;

const PAGE_ACCESS_TOKEN = process.env.T2;

const LANGUAGES = [
    { code: "mg", name: "Malagasy 🇲🇬" },
    { code: "en", name: "English 🇬🇧" },
    { code: "es", name: "Spanish 🇪🇸" },
    { code: "fr", name: "French 🇫🇷" },
    { code: "de", name: "German 🇩🇪" },
    { code: "zh", name: "Chinese 🇨🇳" },
    { code: "ru", name: "Russian 🇷🇺" },
    { code: "ja", name: "Japanese 🇯🇵" },
    { code: "hi", name: "Hindi 🇮🇳" },
    { code: "ar", name: "Arabic 🇸🇦" },
    { code: "pt", name: "Portuguese 🇵🇹" }
];

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

const askForLanguage = async (senderId, originalMessage) => {
  const quick_replies = LANGUAGES.map(language => ({
    content_type: "text",
    title: language.name,
    payload: JSON.stringify({ language: language.code, originalMessage }),
  }));

  return sendMessage(senderId, {
    text: "Adika amin'ny teny:",
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
    const { language, originalMessage } = JSON.parse(quickReplyPayload);
    
    const translatedText = await translateText(originalMessage, language);
    return sendMessage(senderID, `${translatedText}`);
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