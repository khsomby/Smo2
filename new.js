require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.token;

// Facebook webhook verification
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
        for (const entry of body.entry) {
            const event = entry.messaging[0];
            const senderId = event.sender.id;

            if (event.postback && event.postback.payload === "get_started") {
                await sendText(senderId, "Welcome! Send a keyword to find videos.");
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
    const videoQueue = [];

    try {
        const response = await axios.post("https://minecraft-server-production-db6b.up.railway.app/api/videos", {
            search: text,
            sort: "rating",
            filterDuration: "5-20min",
            filterQuality: "all",
            pagination: Math.floor(Math.random() * 50) + 1;
        });

        const videos = response.data;

        const filtered = videos.filter(v => {
            const mins = parseInt(v.duration);
            return mins >= 5 && mins <= 20;
        }).slice(0, 5);

        if (filtered.length === 0) {
            await sendText(senderId, "No videos found between 5 and 20 minutes.");
            return;
        }

        // Store in videoQueue
        filtered.forEach(video => videoQueue.push(video.contentUrl));

        // Send videos
        for (const url of videoQueue) {
            await sendVideo(senderId, url);
        }

        // Clear queue
        videoQueue.length = 0;

    } catch (error) {
        console.error("Search error:", error.message || error);
        await sendText(senderId, "An error occurred while searching for videos. Please try again later.");
    }
}

async function sendText(recipientId, text, retries = 2) {
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

app.listen(2008, () => console.log("Bot is running on port 2008"));