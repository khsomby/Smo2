const axios = require("axios");

module.exports = {
  execute: async (prompt, senderId, sendMessage) => {
    if (!prompt) {
      return sendMessage(senderId, { text: "❌ Please provide a prompt after /bing." });
    }

    try {
      const response = await axios.get(`https://jerome-web.onrender.com/service/api/dalle2-image`, {
        params: { prompt: prompt }
      });

      const data = response.data;

      if (data.status === "success" && data.data.status === "completed") {
        const webpUrl = data.data.images[0];
        
        const conversionResponse = await axios.get(`https://ezgif.com/webp-to-jpg?url=${webpUrl}`, {
          responseType: "arraybuffer"
        });

        const jpgUrl = conversionResponse.data.result_url;

        await sendMessage(senderId, {
          attachment: { type: "image", payload: { url: jpgUrl, is_reusable: true } }
        });
      } else {
        sendMessage(senderId, { text: "❌ Failed to generate image." });
      }
    } catch (error) {
      console.error("Error generating image:", error.message);
      sendMessage(senderId, { text: "❌ Error generating image." });
    }
  }
};
