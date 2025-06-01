const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.token;

const userVideoAttachmentsMap = new Map();

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

    // Initialize storage for this user
    if (!userVideoAttachmentsMap.has(senderId)) {
      userVideoAttachmentsMap.set(senderId, []);
    }

    for (const video of results.slice(0, 5)) {
      // Send pre-message
      await sendTextWithRetry(senderId, "Sending video, please wait...");

      try {
        // First try to send by URL
        const attachmentId = await sendVideoWithRetry(senderId, video.contentUrl);
        
        // If successful, store the attachment ID
        if (attachmentId) {
          const currentAttachments = userVideoAttachmentsMap.get(senderId);
          currentAttachments.push({
            url: video.contentUrl,
            attachmentId: attachmentId
          });
          userVideoAttachmentsMap.set(senderId, currentAttachments);
        }
      } catch (error) {
        console.error("Failed to send video by URL, trying attachment ID if available", error);
        
        // Try to find existing attachment ID for this URL
        const existingAttachment = userVideoAttachmentsMap.get(senderId)
          .find(item => item.url === video.contentUrl);
        
        if (existingAttachment && existingAttachment.attachmentId) {
          await sendVideoByAttachmentIdWithRetry(senderId, existingAttachment.attachmentId);
        } else {
          await sendTextWithRetry(senderId, "⚠️ Failed to send video.");
        }
      }
    }

    // Clear the map after sending all videos
    userVideoAttachmentsMap.delete(senderId);

  } catch (error) {
    console.error(error);
    await sendTextWithRetry(senderId, "⚠️ Error occurred while searching.");
  }
}

async function sendVideoWithRetry(recipientId, videoUrl, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.post(
        "https://graph.facebook.com/v17.0/me/messages",
        {
          recipient: { id: recipientId },
          message: {
            attachment: {
              type: "video",
              payload: {
                url: videoUrl,
                is_reusable: true
              }
            }
          }
        },
        {
          params: { access_token: PAGE_ACCESS_TOKEN },
        }
      );
      
      // Return the attachment ID if available in response
      return response.data?.message_id?.split("mid.$")[1]; // Simplified extraction
    } catch (error) {
      if (i === retries - 1) {
        console.error("Failed to send video:", error);
        throw error; // Re-throw to handle in calling function
      }
      await new Promise((resolve) => setTimeout(resolve, 3000 * (i + 1)));
    }
  }
}

async function sendVideoByAttachmentIdWithRetry(recipientId, attachmentId, retries = 3) {
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
                attachment_id: attachmentId
              }
            }
          }
        },
        {
          params: { access_token: PAGE_ACCESS_TOKEN },
        }
      );
      return true;
    } catch (error) {
      if (i === retries - 1) {
        console.error("Failed to send video by attachment ID:", error);
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000 * (i + 1)));
    }
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

app.listen(2008, () => console.log("Bot is running on port 2008"));