const axios = require("axios");

let faceSwapQueue = {};

module.exports = {
  description: "Swap faces between two images. Usage: /faceswap",
  execute: async (args, senderId, sendMessage, event) => {
    if (!faceSwapQueue[senderId]) {
      faceSwapQueue[senderId] = { stage: 1 };
      await sendMessage(senderId, { text: "📸 Please send the target photo for the face swap." });
    } else if (faceSwapQueue[senderId].stage === 1 && event.message.attachments) {
      const targetPhoto = event.message.attachments[0];
      if (targetPhoto.type === "image") {
        faceSwapQueue[senderId] = { stage: 2, targetUrl: targetPhoto.payload.url };
        await sendMessage(senderId, { text: "🔄 Now send the **source photo** for the face swap." });
      } else {
        await sendMessage(senderId, { text: "❌ Invalid target photo. Please send a valid image." });
      }
    } else if (faceSwapQueue[senderId].stage === 2 && event.message.attachments) {
      const sourcePhoto = event.message.attachments[0];
      if (sourcePhoto.type === "image") {
        const { targetUrl } = faceSwapQueue[senderId];
        const sourceUrl = sourcePhoto.payload.url;

        try {
          const response = `https://kaiz-apis.gleeze.com/api/faceswap-v2?targetUrl=${targetUrl}&sourceUrl=${sourceUrl}`;
          await sendMessage(senderId, {
              attachment: {
                type: "image",
                payload: {
                  url: response,
                  is_reusable: true,
                },
              },
            });
          } else {
            await sendMessage(senderId, { text: "❌ Failed to perform face swap. Please try again." });
          }
        } catch (error) {
          console.error("Face swap error:", error.message);
          await sendMessage(senderId, { text: "❌ An error occurred during the face swap." });
        } finally {
          delete faceSwapQueue[senderId];
        }
      } else {
        await sendMessage(senderId, { text: "❌ Invalid source photo. Please send a valid image." });
      }
    } else {
      await sendMessage(senderId, { text: "❌ Invalid operation. Start over by sending /faceswap." });
      delete faceSwapQueue[senderId];
    }
  },
};