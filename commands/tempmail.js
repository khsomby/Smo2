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
        const response = await axios.get('https://kaiz-apis.gleeze.com/api/tempmail-create');

        if (response.data && response.data.email) {
          const tempEmail = response.data.address;
          await sendMessage(senderId, { text: `📧 Temp Email Generated: ${tempEmail}\n\nYour token is below. Use it to check inbox: /tempmail <your_token>` });
          sendMessage(senderId, { text: response.data.token });
        } else {
          await sendMessage(senderId, { text: "❌ Failed to generate temp email." });
        }
      } catch (error) {
        console.error("Error generating temp email:", error.message);
        await sendMessage(senderId, { text: "❌ Error generating temp email." });
      }
    } else {
      if (!prompt) {
        return sendMessage(senderId, { text: "❌ Please provide a token to check after /tempmail." });
      }

      const emailToCheck = prompt;
      console.log('Email to check:', emailToCheck);

      try {
        const response = await axios.get('https://kaiz-apis.gleeze.com/api/tempmail-inbox', { params: { token: emailToCheck } });

        if (response.data && response.data.emails) {
          const messages = response.data.emails;

          if (messages.length > 0) {
            const inboxMessages = messages.map((message, index) =>
              `───────────────────\n📩 ${index + 1}. From: ${message.from}\nSubject: ${message.subject}\n\nMessage:\n${message.body}\n───────────────────`
            ).join('\n\n');

            await sendMessage(senderId, { text: `📬 Inbox for ${message.to}:\n${inboxMessages}` });
          } else {
            await sendMessage(senderId, { text: `📭 Inbox is empty.` });
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
