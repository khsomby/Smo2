const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const description = `/flux <prompt>
Example: /flux cut cat`;

module.exports = {
  description,
  execute: async (prompt, senderId, sendMessage) => {
    if (!prompt) {
      return sendMessage(senderId, { text: "❌ Please provide a prompt after /flux." });
    }

    try {
      const imgUrl = `https://betadash-api-swordslush-production.up.railway.app/fluxwebui?prompt=${encodeURIComponent(prompt)}`;
  
      await sendMessage(senderId, {
        attachment: { type: "image", payload: { url: imgUrl, is_reusable: true } }
      });
    } catch (error) {
      console.error("Error:", error.message);
      sendMessage(senderId, { text: "❌ Error generating image." });
    }
  }
};
