require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const app = express();
app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.token;
const VERIFY_TOKEN = 'somby';

let waitingPaymentInfo = {};

async function getAdminId() {
  try {
    const res = await axios.get(`https://graph.facebook.com/v17.0/me/roles?access_token=${PAGE_ACCESS_TOKEN}`);
    return res.data.data[0]?.user || null;
  } catch {
    return null;
  }
}

const payMethods = JSON.parse(fs.readFileSync('./pay.json'));
const payMethodKeys = Object.keys(payMethods);

function send(recipientId, message) {
  return axios.post(`https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
    recipient: { id: recipientId },
    message,
  });
}

async function sendVideoWithFallback(sender, videoUrl) {
  let attempts = 0;
  let success = false;

  while (attempts < 3 && !success) {
    try {
      await axios.post(`https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        recipient: { id: sender },
        message: {
          attachment: {
            type: 'video',
            payload: { url: videoUrl },
          },
        },
      });
      success = true;
    } catch {
      attempts++;
    }
  }

  if (!success) {
    try {
      const upload = await axios.post(`https://graph.facebook.com/v17.0/me/message_attachments?access_token=${PAGE_ACCESS_TOKEN}`, {
        message: {
          attachment: {
            type: 'video',
            payload: { url: videoUrl, is_reusable: true },
          },
        },
      });
      const attachmentId = upload.data.attachment_id;

      await axios.post(`https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        recipient: { id: sender },
        message: {
          attachment: {
            type: 'video',
            payload: { attachment_id: attachmentId },
          },
        },
      });
    } catch {
      await send(sender, { text: 'Erreur lors de l\'envoi de la vid\u00e9o.' });
    }
  }
}

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  const entry = req.body.entry?.[0];
  const messaging = entry?.messaging?.[0];
  const sender = messaging?.sender?.id;
  const message = messaging?.message;
  const text = message?.text?.trim();

  if (!sender || !text) return res.sendStatus(200);

  const adminId = await getAdminId();
  const premiumIds = (await axios.get('https://your-online-file.com/premium.txt')).data.split('\n');
  const isPremium = premiumIds.includes(sender);

  if (messaging.postback?.payload === 'GET_STARTED') {
    await send(sender, {
      text: 'Bienvenue! Envoyez un titre pour rechercher des vid\u00e9os. Les vid\u00e9os longues sont r\u00e9serv\u00e9es aux utilisateurs premium.',
    });
    return res.sendStatus(200);
  }

  if (payMethodKeys.includes(text)) {
    waitingPaymentInfo[sender] = text;
    await send(sender, { text: `Envoyez maintenant le num\u00e9ro ou l'adresse que vous avez utilis\u00e9 pour le paiement via ${text}` });
    return res.sendStatus(200);
  }

  if (waitingPaymentInfo[sender]) {
    await send(adminId, {
      text: `Demande Premium\nDe: ${sender}\nM\u00e9thode: ${waitingPaymentInfo[sender]}\nInfo de paiement: ${text}`,
    });
    delete waitingPaymentInfo[sender];
    await send(sender, { text: 'Merci ! Votre demande a \u00e9t\u00e9 envoy\u00e9e \u00e0 l\'admin.' });
    return res.sendStatus(200);
  }

  // Process as search title
  try {
    const result = await axios.get(`https://minecraft-server-production-db6b.up.railway.app/search?title=${encodeURIComponent(text)}&type=${isPremium ? 'premium' : 'free'}`);
    const videos = result.data.slice(0, isPresendVideoWithFallbackfor (const video of videos) {
      await sendVideoWithFallback(sender, video.contentUrl);
    }
  } catch {
    await send(sender, { text: 'Erreur de recherche ou aucun r\u00e9sultat.' });
  }

  res.sendStatus(200);
});

app.listen(2008, () => console.log('Bot listening on port 2008'));

// Remember to also serve your `/search` API on port 3000 separately
