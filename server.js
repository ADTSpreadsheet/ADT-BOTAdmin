require("dotenv").config();

const express = require("express");
const line = require("@line/bot-sdk");

const app = express();

const lineConfig = {
  channelAccessToken: process.env.LINE_ADMIN_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_ADMIN_CHANNEL_SECRET
};

const lineClient = new line.Client(lineConfig);

app.get("/", (req, res) => {
  res.send("ADT BOTAdmin is running 🚀");
});

app.post("/webhook", line.middleware(lineConfig), async (req, res) => {
  try {
    const events = req.body.events || [];

    for (const event of events) {
      console.log("LINE EVENT:", JSON.stringify(event, null, 2));

      if (event.source?.groupId && event.replyToken) {
        await lineClient.replyMessage(event.replyToken, {
          type: "text",
          text: `GROUP ID:\n${event.source.groupId}`
        });
      }
    }

    res.status(200).end();
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).end();
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`ADT BOTAdmin running on port ${PORT}`);
});
