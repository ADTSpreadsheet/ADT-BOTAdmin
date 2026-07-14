require("dotenv").config();

const express = require("express");
const line = require("@line/bot-sdk");
const { createClient } = require("@supabase/supabase-js");

const paymentInviteRoutes = require("./routes/paymentInvite");
const paymentSubmitRoutes = require("./routes/paymentSubmit");

const app = express();

/* ===========================
   LINE BOT ADMIN
=========================== */

const adminLineConfig = {
  channelAccessToken:
    process.env.LINE_ADMIN_CHANNEL_ACCESS_TOKEN,

  channelSecret:
    process.env.LINE_ADMIN_CHANNEL_SECRET
};

if (!adminLineConfig.channelAccessToken) {
  throw new Error(
    "Missing LINE_ADMIN_CHANNEL_ACCESS_TOKEN"
  );
}

if (!adminLineConfig.channelSecret) {
  throw new Error(
    "Missing LINE_ADMIN_CHANNEL_SECRET"
  );
}

const adminLineClient =
  new line.Client(adminLineConfig);

/* ===========================
   SUPABASE
=========================== */

if (!process.env.SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL");
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_SERVICE_ROLE_KEY"
  );
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/* ===========================
   MIDDLEWARE
=========================== */

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

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
   HELPER : DELAY
=========================== */

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/* ===========================
   HELPER : LINE PUSH RETRY

   - ส่งซ้ำสูงสุด 3 ครั้ง
   - ครั้งที่ 1 ส่งทันที
   - ครั้งที่ 2 รอ 2 วินาที
   - ครั้งที่ 3 รอ 5 วินาที
=========================== */

async function pushLineMessageWithRetry(
  destinationId,
  message,
  reference = "-"
) {
  const retryDelays = [0, 2000, 5000];

  let lastError = null;

  for (
    let attempt = 0;
    attempt < retryDelays.length;
    attempt++
  ) {
    const waitMs =
      retryDelays[attempt];

    if (waitMs > 0) {
      await delay(waitMs);
    }

    try {
      console.log(
        `LINE Admin push attempt ` +
        `${attempt + 1}/${retryDelays.length} ` +
        `reference=${reference}`
      );

      await adminLineClient.pushMessage(
        destinationId,
        message
      );

      console.log(
        `LINE Admin push success ` +
        `reference=${reference}`
      );

      return {
        success: true,
        attempt: attempt + 1
      };

    } catch (error) {
      lastError = error;

      const lineError =
        error?.originalError?.response?.data ||
        error?.message ||
        error;

      console.error(
        `LINE Admin push attempt ` +
        `${attempt + 1} failed ` +
        `reference=${reference}:`,
        lineError
      );
    }
  }

  throw (
    lastError ||
    new Error(
      "LINE Admin push failed after all retries"
    )
  );
}

/* ===========================
   HOME
=========================== */

app.get("/", (req, res) => {
  res.send("ADT BOTAdmin is running 🚀");
});

/* ===========================
   HEALTH CHECK
=========================== */

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "ADT BOTAdmin",
    time: new Date().toISOString()
  });
});

/* ===========================
   WEBHOOK
=========================== */

app.post(
  "/webhook",
  line.middleware(adminLineConfig),

  async (req, res) => {
    try {
      const events =
        req.body.events || [];

      for (const event of events) {
        console.log(
          "LINE EVENT:",
          JSON.stringify(
            event,
            null,
            2
          )
        );

        if (event.source?.groupId) {
          console.log(
            "GROUP ID:",
            event.source.groupId
          );
        }
      }

      return res.status(200).end();

    } catch (err) {
      console.error(
        "Webhook error:",
        err
      );

      return res.status(500).end();
    }
  }
);

/* ===========================
   REPORT REGISTER
=========================== */

app.post(
  "/api/report-register",

  async (req, res) => {
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
      } = req.body || {};

      const bookingNo =
        String(booking_no || "").trim();

      const groupId =
        process.env.LINE_ADMIN_GROUP_ID;

      if (!groupId) {
        console.error(
          "LINE_ADMIN_GROUP_ID is missing"
        );

        return res.status(500).json({
          success: false,
          message:
            "LINE_ADMIN_GROUP_ID is missing"
        });
      }

      if (!bookingNo) {
        return res.status(400).json({
          success: false,
          message:
            "booking_no is required"
        });
      }

      const queueNo =
        Number(queue_no || 0);

      const isEarlyBird =
        typeof early_bird === "boolean"
          ? early_bird
          : (
              queueNo > 0 &&
              queueNo <= EARLY_BIRD_LIMIT
            );

      const defaultPrice =
        isEarlyBird
          ? EARLY_BIRD_PRICE
          : NORMAL_PRICE;

      const parsedPrice =
        Number(price);

      const finalPrice =
        Number.isFinite(parsedPrice) &&
        parsedPrice > 0
          ? parsedPrice
          : defaultPrice;

      const reportText =
        `🎉 ADT-PILEFiX | มีผู้จองสิทธิ์ใหม่\n\n` +
        `━━━━━━━━━━━━━━\n` +
        `🆔 หมายเลขจอง: ${bookingNo}\n` +
        `🎫 ลำดับจอง: #${queueNo} / ` +
        `${EARLY_BIRD_LIMIT}\n\n` +
        `👤 ชื่อ: ${full_name || "-"}\n` +
        `📞 โทร: ${phone || "-"}\n` +
        `📧 Email: ${email || "-"}\n` +
        `📘 Facebook: ` +
        `${facebook_account || "-"}\n\n` +
        (
          isEarlyBird
            ? "✅ สิทธิ์: EARLY BIRD\n"
            : "⚠️ สิทธิ์: ราคาปกติ\n"
        ) +
        `💰 ราคา: ` +
        `${finalPrice.toLocaleString()} บาท\n\n` +
        `📌 สถานะ: REGISTERED\n` +
        `⏳ รอทีม Admin ตรวจสอบ`;

      const pushResult =
        await pushLineMessageWithRetry(
          groupId,
          {
            type: "text",
            text: reportText
          },
          bookingNo
        );

      return res.status(200).json({
        success: true,
        message: "Admin report sent",
        booking_no: bookingNo,
        attempt: pushResult.attempt
      });

    } catch (err) {
      const errorDetail =
        err?.originalError?.response?.data ||
        err?.message ||
        err;

      console.error(
        "Report register error:",
        errorDetail
      );

      return res.status(500).json({
        success: false,
        message:
          "Cannot send admin report"
      });
    }
  }
);

/* ===========================
   PAYMENT INVITE API
=========================== */

app.use(
  "/api/payment-invite",

  paymentInviteRoutes({
    supabase,
    adminLineClient
  })
);

/* ===========================
   PAYMENT SUBMIT SLIP API
=========================== */

app.use(
  "/api/payment",

  paymentSubmitRoutes({
    supabase,
    adminLineClient
  })
);

/* ===========================
   START SERVER
=========================== */

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `ADT BOTAdmin running on port ${PORT}`
  );
});
