const axios = require("axios");

const description = `/lyrics <prompt>
Example: /lyrics Alan Walker - Play`;

module.exports = { description, 
  execute: async (prompt, senderId, sendMessage) => {
    if (!prompt) return sendMessage(senderId, { text: "❌ Please provide a prompt after /lyrics." });

    try {
      const response = await axios.get(`https://lyrist.vercel.app/api/${encodeURIComponent(prompt)}`);
      const { artist, title, lyrics, image } = response.data;

      await sendMessage(senderId, { attachment: { type: "image", payload: { url: image, is_reusable: true } } });
      sendMessage(senderId, { text: `𝗧𝗶𝘁𝗹𝗲: ${title}\n𝗔𝗿𝘁𝗶𝘀𝘁: ${artist}\n\n𝗟𝘆𝗿𝗶𝗰𝘀:\n${lyrics}` });
    } catch (error) {
      console.error("Lyrics error:", error.message);
      sendMessage(senderId, { text: "❌ Error retrieving lyrics." });
    }
  }
};
