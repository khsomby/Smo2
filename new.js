const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.token;

const userVideosMap = new Map();

app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === "somby"
  ) {
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const senderId = event.sender.id;

      if (event.postback && event.postback.payload === "get_started") {
        await sendTextWithRetry(senderId, "👋 Welcome! Send a title to search for videos.");
      } else if (event.message && event.message.text) {
        await handleMessage(senderId, event.message.text);
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

async function handleMessage(senderId, text) {
  try {
    const response = await axios.get(
      `https://minecraft-server-production-db6b.up.railway.app/search?title=${encodeURIComponent(text)}`
    );

    const results = response.data;

    if (!results || results.length === 0) {
      await sendTextWithRetry(senderId, "❌ No videos found.");
      return;
    }

    const filtered = results.filter((v) => v.duration >= 600);

    if (filtered.length === 0) {
      await sendTextWithRetry(senderId, "❌ No videos longer than 10 minutes found.");
      return;
    }

    const links = [];
    for (const video of filtered.slice(0, 15)) {
      links.push(video.contentUrl);
      await sendVideoWithRetry(senderId, video.contentUrl);
    }

    userVideosMap.set(senderId, links);
    setTimeout(() => userVideosMap.delete(senderId), 5 * 60 * 1000); // auto-clear after 5 min

  } catch (error) {
    console.error(error);
    await sendTextWithRetry(senderId, "⚠️ Error occurred while searching.");
  }
}

async function sendTextWithRetry(recipientId, text, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await axios.post(
        "https://graph.facebook.com/v17.0/me/messages",
        {
          recipient: { id: recipientId },
          message: { text: text },
        },
        {
          params: { access_token: PAGE_ACCESS_TOKEN },
        }
      );
      return;
    } catch (error) {
      if (i === retries - 1) console.error("Failed to send message:", error);
      await new Promise((resolve) => setTimeout(resolve, 3000 * (i + 1)));
    }
  }
}

async function sendVideoWithRetry(recipientId, videoUrl, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await axios.post(
        "https://graph.facebook.com/v17.0/me/messages",
        {
          recipient: { id: recipientId },
          message: {
            attachment: {
              type: "video",
              payload: {
                url: videoUrl,
              },
            },
          },
        },
        {
          params: { access_token: PAGE_ACCESS_TOKEN },
        }
      );
      return;
    } catch (error) {
      if (i === retries - 1) console.error("Failed to send video:", error);
      await new Promise((resolve) => setTimeout(resolve, 3000 * (i + 1)));
    }
  }
}

app.listen(2008, () => console.log("Bot is running on port 2008"));