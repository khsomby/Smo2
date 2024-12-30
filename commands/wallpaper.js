const axios = require("axios");
const description = `/wallpaper <prompt> | <page>
E.g: /wallpaper Free Fire | 1`;


module.exports = { description,
  execute: async (args, senderId, sendMessage) => {
    const [query, page] = args.split("|").map(arg => arg.trim());
    
    if (!query || !page) {
      return sendMessage(senderId, { text: "❌ Please provide both a search query and a page number, e.g: /wallpaper batman | 1." });
    }

    try {
      const response = await axios.get(`https://walpaper-kshitiz.vercel.app/wp`, {
        params: {
          page: page,
          query: query
        }
      });

      const data = response.data;
      
      if (data && data.result && data.result.length > 0) {
        const images = data.result.slice(0, 10);

        for (let image of images) {
          await sendMessage(senderId, {
            attachment: {
              type: "image",
              payload: { url: `https://simple-messenger-bot-cvg1-nwr4.onrender.com/jpg?imageUrl=${image}`, is_reusable: true }
            }
          });
        }
      } else {
        await sendMessage(senderId, { text: "❌ No wallpapers found for your query." });
      }
    } catch (error) {
      console.error("Wallpaper command error:", error.message);
      await sendMessage(senderId, { text: "❌ Error retrieving wallpapers." });
    }
  }
};
