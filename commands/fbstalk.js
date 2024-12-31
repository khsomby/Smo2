const axios = require("axios");

module.exports = {
  name: "stalk",
  description: "Retrieves detailed information about a Facebook user.",
  async execute(prompt, senderId, sendMessage) {
    const useId = prompt;

    if (!useId) {
      return sendMessage(senderId, {
        text: "❌ Please provide a valid Facebook user ID to stalk.",
      });
    }

    const ac = "EAAAAUaZA8jlABO6pADqah9n2Tipgv9vnx24uQbTbzxDdumbC8mAOU8sbajx4AEYhMfxq1zBUhKapuAzGaFhytZBIZBzp4c8ULtUHOMZAGc9qVnQMlFhvLpAwsOOgktYyMcVrLlULBUcBfrn1r105PntUFHZCieKYSpcf1SyRgnqDILJkniaPsBYGA2yZBHOZAqcIca8ZCZBIEXQZDZD";
    const apiUrl = `https://graph.facebook.com/${useId}?fields=name,picture,gender,about,id,username,relationship_status,is_verified,birthday,education,hometown,languages,quotes,work,location,significant_other&access_token=${ac}`;

    try {
      const { data } = await axios.get(apiUrl);

      const userName = data.name || "Unknown User";
      const profilePic = `https://graph.facebook.com/${useId}/picture?width=720&height=720&access_token=${ac}`;
      const gender = data.gender || "Not specified";
      const about = data.about || "No about information available.";
      const userId = data.id || "Not available";
      const username = data.username || "Not available";
      const relationshipStatus = data.relationship_status || "Not available";
      const ver = data.is_verified || "Not available";
      const birthday = data.birthday || "Not available";
      const hometown = data.hometown?.name || "Not available";
      const languages = data.languages?.map((lang) => lang.name).join(", ") || "Not available";
      const quotes = data.quotes || "No quotes available.";
      const work = data.work?.map((job) => `${job.position?.name} at ${job.employer?.name} (${job.start_date})`).join("\n") || "Not available";
      const significantOther = data.significant_other?.name || "Not available";

      let message = `🔍 Stalking Profile of: ${userName}\n\n\n`;
      message += `👤 Gender: ${gender}\n\n`;
      message += `📖 About: ${about}\n\n`;
      message += `🔑 User ID: ${userId}\n\n`;
      message += `📝 Username: ${username}\n\n`;
      message += `❤️ Relationship Status: ${relationshipStatus}\n\n`;
      message += `✅ Verified ?: ${ver}\n\n`;
      message += `🎂 Birthday: ${birthday}\n\n`;
      message += `🌍 Hometown: ${hometown}\n\n`;
      message += `🌐 Languages: ${languages}\n\n`;
      message += `💬 Quotes: ${quotes}\n\n`;
      message += `💼 Work History:\n${work}\n\n`;
      message += `💑 Significant Other: ${significantOther}\n\n`;

      await sendMessage(senderId, { text: message });
      await sendMessage(senderId, { attachment: { type: 'image', payload: { url: profilePic } } });
    } catch (error) {
      console.error("❌ Error fetching Facebook profile:", error.message);

      await sendMessage(senderId, {
        text: "❌ An error occurred while trying to fetch the profile.",
      });
    }
  },
};
