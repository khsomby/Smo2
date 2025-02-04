const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const description = `/dalle <prompt>
Example: /dalle cut cat`;

module.exports = { description, 
  execute: async (prompt, senderId, sendMessage) => {
    if (!prompt) {
      return sendMessage(senderId, { text: "❌ Please provide a prompt after /dalle." });
    }

    try {
      const response = `https://zaikyoo.onrender.com/api/ideogramturbo?prompt=${prompt}`;
      
      await sendMessage(senderId, {
            attachment: { type: "image", payload: { url: response, is_reusable: true } }
          });
        
    } catch (error) {
      console.error("Error generating image:", error.message);
      sendMessage(senderId, { text: "❌ Error generating image." });
    }
  }
};
