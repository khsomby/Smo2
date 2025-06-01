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
        // Iterate over each entry (in case of batched messaging)
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

// Use your /api/videos POST endpoint here
async function handleMessage(senderId, text) {
    try {
        // Adjust the URL to your API endpoint hosting /api/videos
        const response = await axios.post("https://minecraft-server-production-db6b.up.railway.app/api/videos", {
            search: text,
            sort: "latest",
            filterDate: undefined,
            filterDuration: "long",
            filterQuality: "low",
            viewWatched: undefined,
            pagination: 1
        });

        const videos = response.data;

        // Filter videos with duration between 5 and 20 minutes (just in case)
        const filtered = videos.filter(v => {
            const mins = parseInt(v.duration);
            return mins >= 5 && mins <= 20;
        }).slice(0, 15);

        if (filtered.length === 0) {
            await sendText(senderId, "No videos found between 5 and 20 minutes.");
            return;
        }

        // Send videos URLs one by one
        for (const video of filtered) {
            await sendText(senderId, `Title: ${video.title}\nDuration: ${video.duration}`);
            await sendVideo(senderId, video.contentUrl);
        }

    } catch (error) {
        console.error("Search error:", error.message || error);
        await sendText(senderId, "An error occurred while searching for videos. Please try again later.");
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

app.listen(2008, () => console.log("Bot is running on port 2008"));