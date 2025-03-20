const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const description = `/emojimix <emoji1> | <emoji2>
Example: /emojimix 😀 | 😘`;

module.exports = {
  description,
  execute: async (prompt, senderId, sendMessage) => {
    if (!prompt) {
      return sendMessage(senderId, { text: "❌ Please provide emojis after /emojimix" });
    }

    try {
      const [e1, e2] = prompt.split(' | ').map(item => item.trim());

      const imgUrl = `https://betadash-api-swordslush-production.up.railway.app/emojimix?emoji1=${encodeURIComponent(e1)}&emoji2=${encodeURIComponent(e2)}`;
  
      await sendMessage(senderId, {
        attachment: { type: "image", payload: { url: imgUrl, is_reusable: true } }
      });
    } catch (error) {
      console.error("Error:", error.message);
      sendMessage(senderId, { text: "❌ Error generating image." });
    }
  }
};
