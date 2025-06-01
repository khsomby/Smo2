require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.token;

app.get("/webhook", (req, res) => {
    if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === "somby") {
        res.status(200).send(req.query["hub.challenge"]);
    } else {
        res.sendStatus(403);
    }
});

app.post("/webhook", async (req, res) => {
    const body = req.body;

    if (body.object === "page") {
        body.entry.forEach(async (entry) => {
            const event = entry.messaging[0];
            const senderId = event.sender.id;

            if (event.postback && event.postback.payload === "get_started") {
                await sendText(senderId, "Welcome! Send a keyword to find videos.");
            } else if (event.message && event.message.text) {
                await handleMessage(senderId, event.message.text);
            }
        });
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

async function handleMessage(senderId, text) {
    try {
        const response = await axios.get(`https://minecraft-server-production-db6b.up.railway.app/search?title=${encodeURIComponent(text)}`);
        const videos = response.data;

        const filtered = videos.filter(v => v.duration >= 300).slice(0, 15);

        if (filtered.length === 0) {
            await sendText(senderId, "No videos found with at least 5 minutes.");
            return;
        }

        // Store video URLs in a temporary array
        const videoQueue = filtered.map(v => v.contentUrl);

        // Send videos from the queue
        for (const url of videoQueue) {
            await sendVideo(senderId, url);
        }

        // Clear the queue (if needed for logic)
        videoQueue.length = 0;

    } catch (error) {
        console.error("Search error:", error.message);
        await sendText(senderId, "An error occurred. Please try again.");
    }
}

async function sendText(recipientId, text, retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            await axios.post(
                `https://graph.facebook.com/v17.0/me/messages`,
                { recipient: { id: recipientId }, message: { text } },
                { params: { access_token: PAGE_ACCESS_TOKEN } }
            );
            return;
        } catch (err) {
            if (i === retries - 1) console.error("Failed to send text:", err.message);
            await new Promise(resolve => setTimeout(resolve, 3000 * (i + 1)));
        }
    }
}

async function sendVideo(recipientId, videoUrl, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            await axios.post(
                `https://graph.facebook.com/v17.0/me/messages`,
                {
                    recipient: { id: recipientId },
                    message: {
                        attachment: {
                            type: "video",
                            payload: { url: videoUrl }
                        }
                    }
                },
                { params: { access_token: PAGE_ACCESS_TOKEN } }
            );
            return;
        } catch (err) {
            if (i === retries - 1) console.error("Failed to send video:", err.message);
            await new Promise(resolve => setTimeout(resolve, 3000 * (i + 1)));
        }
    }
}

app.listen(2008, () => console.log("Bot is running"));