require("dotenv").config();

const express = require("express");
const line = require("@line/bot-sdk");

const app = express();

const lineConfig = {
  channelAccessToken: process.env.LINE_ADMIN_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_ADMIN_CHANNEL_SECRET
};

const lineClient = new line.Client(lineConfig);

const EARLY_BIRD_LIMIT = 150;
const EARLY_BIRD_PRICE = 3500;
const NORMAL_PRICE = 4999;

app.get("/", (req, res) => {
  res.send("ADT BOTAdmin is running 🚀");
});

app.post("/webhook", line.middleware(lineConfig), async (req, res) => {
  try {
    const events = req.body.events || [];

    for (const event of events) {
      console.log("LINE EVENT:", JSON.stringify(event, null, 2));

      if (event.source?.groupId && event.replyToken) {
        console.log("GROUP ID:", event.source.groupId);
      }
    }

    res.status(200).end();
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).end();
  }
});

app.post("/api/report-register", express.json(), async (req, res) => {
  try {
    const {
      booking_no,
      queue_no,
      full_name,
      phone,
      email,
      facebook_account,
      early_bird,
      price
    } = req.body;

    const groupId = process.env.LINE_ADMIN_GROUP_ID;

    if (!groupId) {
      return res.status(500).json({
        success: false,
        message: "LINE_ADMIN_GROUP_ID is missing"
      });
    }

    const queueNo = Number(queue_no || 0);
    const isEarlyBird =
      typeof early_bird === "boolean"
        ? early_bird
        : queueNo > 0 && queueNo <= EARLY_BIRD_LIMIT;

    const finalPrice = Number(price || (isEarlyBird ? EARLY_BIRD_PRICE : NORMAL_PRICE));

    const reportText = isEarlyBird
      ? `🎉 ADT PileFix | มีผู้จองสิทธิ์ใหม่

━━━━━━━━━━━━━━
🆔 หมายเลขจอง: ${booking_no || "-"}
🎫 ลำดับจอง: #${queueNo} / ${EARLY_BIRD_LIMIT}

👤 ชื่อ: ${full_name || "-"}
📞 โทร: ${phone || "-"}
📧 Email: ${email || "-"}
📘 Facebook: ${facebook_account || "-"}

✅ สิทธิ์: EARLY BIRD
💰 ราคา: ${finalPrice.toLocaleString()} บาท
จากราคาเต็ม ${NORMAL_PRICE.toLocaleString()} บาท

📌 สถานะ: REGISTERED
⏳ รอทีม Admin ตรวจสอบ`
      : `📢 ADT PileFix | มีผู้ลงทะเบียนใหม่

━━━━━━━━━━━━━━
🆔 หมายเลขจอง: ${booking_no || "-"}
🎫 ลำดับจอง: #${queueNo}

👤 ชื่อ: ${full_name || "-"}
📞 โทร: ${phone || "-"}
📧 Email: ${email || "-"}
📘 Facebook: ${facebook_account || "-"}

⚠️ Early Bird ครบ ${EARLY_BIRD_LIMIT} ท่านแล้ว
💰 ราคาปกติ: ${finalPrice.toLocaleString()} บาท

📌 สถานะ: REGISTERED
⏳ รอทีม Admin ตรวจสอบ`;

    await lineClient.pushMessage(groupId, {
      type: "text",
      text: reportText
    });

    return res.json({
      success: true,
      message: "Admin report sent"
    });
  } catch (err) {
    console.error("Report register error:", err);

    return res.status(500).json({
      success: false,
      message: "Cannot send admin report"
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`ADT BOTAdmin running on port ${PORT}`);
});
