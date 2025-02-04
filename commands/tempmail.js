const axios = require('axios');
const description = `1) With prompt 'gen' to get tempmail:
/tempmail gen

2) Without prompt to check inbox:
/tempmail <tempmail>`;

module.exports = {
  description,
  execute: async (prompt, senderId, sendMessage, event) => {
    console.log('Received args:', prompt);

    if (prompt === 'gen') {
      try {
        const response = await axios.get('https://zaikyoo.onrender.com/api/tmail1-gen');

        if (response.data && response.data.email) {
          const tempEmail = response.data.email;
          await sendMessage(senderId, { text: `📧 Temp Email Generated: ${tempEmail}` });
        } else {
          await sendMessage(senderId, { text: "❌ Failed to generate temp email." });
        }
      } catch (error) {
        console.error("Error generating temp email:", error.message);
        await sendMessage(senderId, { text: "❌ Error generating temp email." });
      }
    } else {
      if (!prompt) {
        return sendMessage(senderId, { text: "❌ Please provide an email to check after /tempmail <email>." });
      }

      const emailToCheck = prompt;
      console.log('Email to check:', emailToCheck);

      try {
        const response = await axios.get('https://zaikyoo.onrender.com/api/tmail1-inbox', { params: { email: emailToCheck } });

        if (response.data && response.data.inbkx) {
          const messages = response.data.inbkx;

          if (messages.length > 0) {
            const inboxMessages = messages.map((message, index) =>
              `───────────────────\n📩 ${index + 1}. From: ${message.headerfrom}\nDate: ${message.date}\nSubject: ${message.ll}\n\nMessage:\n${message.mail}\n───────────────────`
            ).join('\n\n');

            await sendMessage(senderId, { text: `📬 Inbox for ${emailToCheck}:\n${inboxMessages}` });
          } else {
            await sendMessage(senderId, { text: `📭 Inbox for ${emailToCheck} is empty.` });
          }
        } else {
          await sendMessage(senderId, { text: "❌ Failed to fetch inbox messages." });
        }
      } catch (error) {
        console.error("Error checking inbox:", error.message);
        await sendMessage(senderId, { text: "❌ Error checking inbox." });
      }
    }
  }
};
