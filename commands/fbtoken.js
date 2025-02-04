const axios = require("axios");

module.exports = {
  description: "/fbtoken <email> | <password>",
  async execute(prompt, senderId, sendMessage) {
    const [email, pass] = prompt.split("|").map((item) => item.trim());

    if (!email || !pass) {
      return sendMessage(senderId, {
        text: "❌ Both email and password must be provided.",
      });
    }

    try {
      const response = await axios.get(
        "https://somby-production.up.railway.app/sombytoken",
        {
          params: {
            username: email,
            password: pass,
          },
        }
      );

      if (response.data.accessToken) {
        await sendMessage(senderId, {
          text: `✅ Token retrieved successfully: \n\n${response.data.accessToken}`,
        });
      } else {
        await sendMessage(senderId, {
          text: `❌ Something went wrong: ${response.data.message || "Unknown error"}`,
        });
      }
    } catch (error) {
      console.error("Error:", error.response?.data || error.message);

      const errorDetails = error.response?.data?.details?.error?.message || error.message;
      await sendMessage(senderId, {
        text: `❌ Failed to retrieve token: ${errorDetails}`,
      });
    }
  },
};
