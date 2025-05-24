const express = require('express');
const bodyParser = require('body-parser');
const axios = require("axios");
const fs = require('fs');
const path = require('path');
const { gpt } = require("gpti");

const app = express();
const PORT = 2008;
const PAGE_ACCESS_TOKEN = process.env.token;

const chatGpt = async (text, senderId) => {
  try {
    const repl = `[Prompt: Never use LaTex for formatting formules]\n\n${text}`;
    const response = await axios.get(`https://kaiz-apis.gleeze.com/api/pixtral-12b?q=${encodeURIComponent(repl)}&uid=${senderId}`);

    const reply = response.data.content;

    return reply;
  } catch (err) {
    console.error("GPT error:", err.message);
    return "❌ An error has occurred while processing your request.";
  }
};

const sendMessage = async (senderId, message) => {
  try {
    const PAGE_ACCESS_TOKEN = process.env.token;
    if (!PAGE_ACCESS_TOKEN) {
      throw new Error("PAGE_ACCESS_TOKEN is not set in the environment variables.");
    }

    const sendTypingAction = async (action) => {
      try {
        await axios.post(
          `https://graph.facebook.com/v21.0/me/messages`,
          {
            recipient: { id: senderId },
            sender_action: action,
          },
          {
            params: { access_token: PAGE_ACCESS_TOKEN },
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (error) {
        console.error(`Error sending typing action (${action}):`, error.response?.data || error.message);
      }
    };

    await sendTypingAction("typing_on");

    if (typeof message === "string" || message.text) {
      const messageText = typeof message === "string" ? message : message.text;
      if (!messageText || messageText.trim() === '') {
        throw new Error("Message cannot be empty.");
      }

      const maxLength = 2000;
      for (let i = 0; i < messageText.length; i += maxLength) {
        const chunk = messageText.substring(i, i + maxLength);
        await axios.post(
          `https://graph.facebook.com/v21.0/me/messages`,
          {
            recipient: { id: senderId },
            message: { text: chunk },
          },
          {
            params: { access_token: PAGE_ACCESS_TOKEN },
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    } else if (message.attachment) {
      const { type, payload } = message.attachment;

      if (type === "image" || type === "audio" || type === "video") {
        await axios.post(
          `https://graph.facebook.com/v21.0/me/messages`,
          {
            recipient: { id: senderId },
            message: {
              attachment: {
                type,
                payload: {
                  url: payload.url,
                  is_reusable: true,
                },
              },
            },
          },
          {
            params: { access_token: PAGE_ACCESS_TOKEN },
            headers: { "Content-Type": "application/json" },
          }
        );
      } else {
        throw new Error("Unsupported attachment type. Only 'image' and 'audio' are supported.");
      }
    } else {
      throw new Error("Unsupported message format.");
    }

    await sendTypingAction("typing_off");
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
  }
};

const commands = {};
fs.readdirSync(path.join(__dirname, 'commands')).forEach(file => {
  if (file.endsWith('.js')) {
    const commandName = file.replace('.js', '');
    commands[commandName] = require(`./commands/${file}`);
  }
});
const commandCount = Object.keys(commands).length;

const handleCommand = async (commandName, args, senderId, event) => {
  const command = commands[commandName];
  if (command) {
    await command.execute(args.join(' '), senderId, sendMessage, event);
  } else {
    await sendMessage(senderId, { text: "❌ Unknown command." });
  }
};

let pendingImageDescriptions = {};

const describeImage = async (imageUrl, prompt, senderId) => {
  try {
    if (prompt.toLowerCase() === "vampire") {
      const vampUrl = `https://kaiz-apis.gleeze.com/api/vampire?imageUrl=${encodeURIComponent(imageUrl)}`;
      
      await sendMessage(senderId, {
        attachment: {
          type: "image",
          payload: { url: vampUrl, is_reusable: true }
        }
      });

    } else if (prompt.toLowerCase() === "enhance") {
      const gUrl = `https://api.zetsu.xyz/tools/restore?url=${encodeURIComponent(imageUrl)}&apikey=88802b996b598bd8bd315ea68a743ed1`;
      
      await sendMessage(senderId, {
        attachment: {
          type: "image",
          payload: { url: gUrl, is_reusable: true }
        }
      });

    } else if (prompt.toLowerCase() === "removebg") {
      const removeBgUrl = `https://kaiz-apis.gleeze.com/api/removebg?url=${encodeURIComponent(imageUrl)}`;
      
      await sendMessage(senderId, {
        attachment: {
          type: "image",
          payload: { url: removeBgUrl, is_reusable: true }
        }
      });

    } else if (prompt.toLowerCase() === "xmas") {
      const xmUrl = `https://kaiz-apis.gleeze.com/api/xmas-cap?imageUrl=${encodeURIComponent(imageUrl)}&color=red`;
      
      await sendMessage(senderId, {
        attachment: {
          type: "image",
          payload: { url: xmUrl, is_reusable: true }
        }
      });

    } else if (prompt.toLowerCase() === "zombie") {
      const zUrl = `https://kaiz-apis.gleeze.com/api/zombie?url=${encodeURIComponent(imageUrl)}`;
      
      await sendMessage(senderId, {
        attachment: {
          type: "image",
          payload: { url: zUrl, is_reusable: true }
        }
      }); 
    } else if (prompt.toLowerCase() === "zombie2") {
      const zUrl = `https://kaiz-apis.gleeze.com/api/zombie-v2?url=${encodeURIComponent(imageUrl)}`;
      
      await sendMessage(senderId, {
        attachment: {
          type: "image",
          payload: { url: zUrl, is_reusable: true }
        }
      }); 
    } else {
       const response = await axios.get(`https://kaiz-apis.gleeze.com/api/gemini-vision`, {
        params: { q: prompt, uid: senderId, imageUrl: imageUrl }
       });
       const description = response.data.response;
       await sendMessage(senderId, { text: description || "❌ Could not describe the image." });
    }
  } catch (error) {
    console.error("Image processing error:", error.message);
    await sendMessage(senderId, { text: "❌ Error processing the image." });
  }
};

const handleMessage = async (event) => {
  const senderID = event.sender.id;
  const message = event.message.text;

  if (!senderID || !message) return;

  if (pendingImageDescriptions[senderID]) {
    const imageUrl = pendingImageDescriptions[senderID];
    delete pendingImageDescriptions[senderID];
    return describeImage(imageUrl, message, senderID);
  }

  if (message.toLowerCase().startsWith('cmdlist')) {
    const args = message.split(' ');
    if (args.length > 1) {
      const commandName = args[1];
      const command = commands[commandName];
      if(command && command.description) {
        return sendMessage(senderID, { text: `📄 Description for /${commandName}: \n${command.description}` });
      } else {
        return sendMessage(senderID, { text: `❌ No description found for /${commandName}.` });
      }
    } else {
      const commandList = Object.keys(commands).map(cmd => `┃➠ /${cmd}`).join('\n');
      const helpMessage = `╭─〘 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦 〙─❍\n${commandList}\n╰───〘 ${commandCount} 〙───❍`;
      return sendMessage(senderID, { text: helpMessage });
    }
  }

  if (message.startsWith('/')) {
    const [cmd, ...args] = message.slice(1).split(' ');
    return handleCommand(cmd, args, senderID, event);
  } else {
    const botResponse = await chatGpt(message, senderID);
    return sendMessage(senderID, { text: botResponse });
  }
};

const handleImage = async (event) => {
  const senderID = event.sender.id;
  const attachments = event.message.attachments;

  if (attachments && attachments[0].type === "image") {
    const imageUrl = attachments[0].payload.url;
    pendingImageDescriptions[senderID] = imageUrl;
    await sendMessage(senderID, { text: "📷 Image received! Now send 'removebg' - 'zombie' - 'zombie2' - 'vampire' - 'enhance' or 'xmas' or other prompt." });
  }
};

const handleGetStarted = async (senderId) => {
  await sendMessage(senderId, { text: "👋 Welcome! I'm here to assist you. Type 'Cmdlist' to see what I can do.\n\nAdmin: Somby Ny Aina\nLink: facebook.com/100086980630281" });
};

const handleEvent = async (event) => {
  if (event.postback && event.postback.payload === "GET_STARTED_PAYLOAD") {
    return handleGetStarted(event.sender.id);
  }

  if (event.message) {
    if (event.message.text) {
      await handleMessage(event);
    } else if (event.message.attachments && event.message.attachments[0].type === "image") {
      await handleImage(event);
    }
  }
};

app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = "somby";

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.use(bodyParser.json());

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

const ACCESS_TOKEN = 'EAAAAUaZA8jlABO6pADqah9n2Tipgv9vnx24uQbTbzxDdumbC8mAOU8sbajx4AEYhMfxq1zBUhKapuAzGaFhytZBIZBzp4c8ULtUHOMZAGc9qVnQMlFhvLpAwsOOgktYyMcVrLlULBUcBfrn1r105PntUFHZCieKYSpcf1SyRgnqDILJkniaPsBYGA2yZBHOZAqcIca8ZCZBIEXQZDZD';

const getVideoId = async (url) => {
    try {
        const response = await axios.post('https://id.traodoisub.com/api.php', `link=${encodeURIComponent(url)}`, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        return response.data.id;
    } catch (error) {
        return null;
    }
};

app.get('/info', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing video ID' });

    try {
        const fbUrl = `https://graph.facebook.com/v18.0/${id}?fields=source,picture&access_token=${ACCESS_TOKEN}`;
        const response = await axios.get(fbUrl);

        res.json({
            video_thumbnail: response.data.picture,
            video_source: response.data.source,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch video details' });
    }
});


app.listen(PORT, () => {
  console.log(`Alefa Smo ah 🤖 🇲🇬`);
});
