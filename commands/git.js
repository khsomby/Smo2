const axios = require("axios");

module.exports = {
  execute: async (prompt, senderId, sendMessage) => {
    const allowedSenderId = "6881956545251284";
    if (senderId !== allowedSenderId) {
      return sendMessage(senderId, { text: "❌ You are not authorized to use this command." });
    }

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      return sendMessage(senderId, { text: "❌ GitHub token is not set in the environment." });
    }

    const separator = " | ";
    const splitIndex = prompt.indexOf(separator);

    if (splitIndex === -1) {
      return sendMessage(senderId, { text: "❌ Please provide both filename and file content in the format: /git filename | file_content." });
    }

    const filename = prompt.slice(0, splitIndex).trim();
    const fileContent = prompt.slice(splitIndex + separator.length).trim();

    if (!filename || !fileContent) {
      return sendMessage(senderId, { text: "❌ Both filename and file content must be provided." });
    }

    const repoOwner = "khsomby"; // Replace with your GitHub username
    const repoName = "Smo2"; // Replace with your GitHub repository name
    const branch = "main";

    try {
      const url = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/commands/${filename}`;
      const data = {
        message: `Add new file: ${filename} to /commands/ directory`,
        content: Buffer.from(fileContent, "utf8").toString("base64"),
        branch: branch,
      };

      const response = await axios.put(url, data, {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (response.data && response.data.content) {
        await sendMessage(senderId, { text: `✅ Successfully added file: ${filename} to /commands/ directory in the repository.` });
      } else {
        await sendMessage(senderId, { text: "❌ Failed to add the file to the repository." });
      }
    } catch (error) {
      console.error("Error adding file to GitHub:", error.response?.data || error.message);
      await sendMessage(senderId, { text: "❌ Error adding file to GitHub repository." });
    }
  }
};
