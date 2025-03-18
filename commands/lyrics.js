const axios = require("axios");

const description = `/lyrics <prompt>
Example: /lyrics Alan Walker - Play`;

module.exports = { description, 
  execute: async (prompt, senderId, sendMessage) => {
    if (!prompt) return sendMessage(senderId, { text: "❌ Please provide a prompt after /lyrics." });

    try {
      const res = await axios.get(`https://betadash-api-swordslush-production.up.railway.app/lyrics-finder?title=${encodeURIComponent(prompt)}`);
      const { Title, response, Thumbnail } = res.data;

      await sendMessage(senderId, { attachment: { type: "image", payload: { url: Thumbnail, is_reusable: true } } });
      sendMessage(senderId, { text: `𝗧𝗶𝘁𝗹𝗲: ${Title}\n\n${response}` });
    } catch (error) {
      console.error("Lyrics error:", error.message);
      sendMessage(senderId, { text: "❌ Error retrieving lyrics." });
    }
  }
};
