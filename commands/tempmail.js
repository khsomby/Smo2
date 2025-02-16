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

        if (response.data && response.data.address) {
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

      const token = prompt;
      console.log('Checking inbox with token:', token);

      try {
        const response = await axios.get('https://kaiz-apis.gleeze.com/api/tempmail-inbox', { params: { token } });

        if (response.data && response.data.emails) {
          const messages = response.data.emails;

          if (messages.length > 0) {
            const inboxMessages = messages.map((message, index) =>
              `───────────────────\n📩 ${index + 1}\nTo: ${message.to}\nFrom: ${message.from}\nSubject: ${message.subject}\n\nMessage:\n${message.body.trim()}\n───────────────────`
            ).join('\n\n');

            await sendMessage(senderId, { text: `📬 Inbox:\n${inboxMessages}` });
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
