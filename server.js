require("dotenv").config();

const express = require("express");
const line = require("@line/bot-sdk");
const { createClient } = require("@supabase/supabase-js");

const paymentInviteRoutes = require("./routes/paymentInvite");

const app = express();

/* ===========================
   LINE BOT ADMIN
=========================== */

const adminLineConfig = {
  channelAccessToken: process.env.LINE_ADMIN_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_ADMIN_CHANNEL_SECRET
};

const adminLineClient = new line.Client(adminLineConfig);

/* ===========================
   SUPABASE
=========================== */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ===========================
   MIDDLEWARE
=========================== */

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

/* ===========================
   CONSTANT
=========================== */

const EARLY_BIRD_LIMIT = 150;
const EARLY_BIRD_PRICE = 3500;
const NORMAL_PRICE = 4999;

/* ===========================
   HOME
=========================== */

app.get("/", (req, res) => {
  res.send("ADT BOTAdmin is running 🚀");
});

/* ===========================
   WEBHOOK
=========================== */

app.post(
  "/webhook",
  line.middleware(adminLineConfig),
  async (req, res) => {
    try {
      const events = req.body.events || [];

      for (const event of events) {
        console.log(
          "LINE EVENT:",
          JSON.stringify(event, null, 2)
        );

        if (event.source?.groupId) {
          console.log("GROUP ID:", event.source.groupId);
        }
      }

      res.status(200).end();
    } catch (err) {
      console.error("Webhook error:", err);
      res.status(500).end();
    }
  }
);

/* ===========================
   REPORT REGISTER
=========================== */

app.post("/api/report-register", async (req, res) => {
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

    const finalPrice = Number(
      price || (isEarlyBird ? EARLY_BIRD_PRICE : NORMAL_PRICE)
    );

    const reportText = `🎉 ADT PileFix | มีผู้จองสิทธิ์ใหม่

━━━━━━━━━━━━━━
🆔 หมายเลขจอง: ${booking_no || "-"}
🎫 ลำดับจอง: #${queueNo} / ${EARLY_BIRD_LIMIT}

👤 ชื่อ: ${full_name || "-"}
📞 โทร: ${phone || "-"}
📧 Email: ${email || "-"}
📘 Facebook: ${facebook_account || "-"}

${isEarlyBird ? "✅ สิทธิ์: EARLY BIRD" : "⚠️ สิทธิ์: ราคาปกติ"}
💰 ราคา: ${finalPrice.toLocaleString()} บาท

📌 สถานะ: REGISTERED
⏳ รอทีม Admin ตรวจสอบ`;

    await adminLineClient.pushMessage(groupId, {
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

/* ===========================
   PAYMENT INVITE API
=========================== */

app.use(
  "/api/payment-invite",
  paymentInviteRoutes({
    supabase
  })
);

/* ===========================
   START SERVER
=========================== */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`ADT BOTAdmin running on port ${PORT}`);
});
