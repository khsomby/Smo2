const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const description = `/stadium <id>
Example: /stadium 4`;

module.exports = {
  description,
  execute: async (prompt, senderId, sendMessage) => {
    if (!prompt) {
      return sendMessage(senderId, { text: "❌ Please provide an UID after /stadium" });
    }

    try {
      const imgUrl = `https://betadash-api-swordslush-production.up.railway.app/stadium?userid=${encodeURIComponent(prompt)}`;
  
      await sendMessage(senderId, {
        attachment: { type: "image", payload: { url: imgUrl, is_reusable: true } }
      });
    } catch (error) {
      console.error("Error:", error.message);
      sendMessage(senderId, { text: "❌ Error generating image." });
    }
  }
};