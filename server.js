ADT BOTAdmin Professional Support - Complete Code

============================================================
FILE 1: server.js
============================================================

require("dotenv").config();

const express = require("express");
const line = require("@line/bot-sdk");
const { createClient } = require("@supabase/supabase-js");

const paymentInviteRoutes =
  require("./routes/paymentInvite");

const paymentSubmitRoutes =
  require("./routes/paymentSubmit");

const professionalNewsRoutes =
  require("./routes/professionalNews");

const professionalReleaseRoutes =
  require("./routes/professionalReleases");

const professionalUpdateRoutes =
  require("./routes/professionalUpdate");


const professionalSupportAdminRoutes =
  require("./routes/professionalSupportAdmin");

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
   PROFESSIONAL SUPPORT
   ADMIN REPLY SESSION

   เก็บชั่วคราวในหน่วยความจำ
   หมดอายุภายใน 30 นาที
=========================== */

const supportReplySessions = new Map();
const SUPPORT_REPLY_TTL_MS =
  30 * 60 * 1000;

function setSupportReplySession(
  adminUserId,
  session
) {
  supportReplySessions.set(
    adminUserId,
    {
      ...session,
      expiresAt:
        Date.now() + SUPPORT_REPLY_TTL_MS
    }
  );
}

function getSupportReplySession(
  adminUserId
) {
  const session =
    supportReplySessions.get(adminUserId);

  if (!session) {
    return null;
  }

  if (Date.now() > session.expiresAt) {
    supportReplySessions.delete(adminUserId);
    return null;
  }

  return session;
}

function clearSupportReplySession(
  adminUserId
) {
  supportReplySessions.delete(adminUserId);
}

function isAllowedAdmin(userId) {
  const allowedAdminUserId =
    String(
      process.env.LINE_ADMIN_USER_ID || ""
    ).trim();

  return (
    !allowedAdminUserId ||
    userId === allowedAdminUserId
  );
}

/* ===========================
   CORS MIDDLEWARE
=========================== */

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
    "Content-Type,X-Cron-Secret,X-Admin-Secret"
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
   HELPER : ANALYTICS
=========================== */

function getBangkokDate(offsetDays = 0) {
  const bangkokNow =
    new Date(Date.now() + (7 * 60 * 60 * 1000));

  bangkokNow.setUTCDate(
    bangkokNow.getUTCDate() + offsetDays
  );

  return bangkokNow
    .toISOString()
    .slice(0, 10);
}

function formatThaiDate(dateString) {
  const [year, month, day] =
    String(dateString)
      .split("-")
      .map(Number);

  const monthNames = [
    "",
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม"
  ];

  return (
    `${day} ${monthNames[month]} ` +
    `${year + 543}`
  );
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number
    : 0;
}

function safeObject(value) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value;
  }

  return {};
}

function getDeviceCount(summary, key) {
  const object = safeObject(summary);

  return safeNumber(
    object[key] ??
    object[
      key.charAt(0).toUpperCase() +
      key.slice(1)
    ]
  );
}

function calculatePercent(value, total) {
  if (total <= 0) {
    return "0.00";
  }

  return (
    safeNumber(value) /
    safeNumber(total) *
    100
  ).toFixed(2);
}

function buildAnalyticsFlex(summary) {
  const visitors =
    safeNumber(summary.visitors);

  const pageViews =
    safeNumber(summary.page_views);

  const registerVisitors =
    safeNumber(summary.register_visitors);

  const successVisitors =
    safeNumber(summary.success_visitors);

  const deviceSummary =
    safeObject(summary.device_summary);

  const mobileCount =
    getDeviceCount(deviceSummary, "mobile");

  const desktopCount =
    getDeviceCount(deviceSummary, "desktop");

  const tabletCount =
    getDeviceCount(deviceSummary, "tablet");

  const conversionRate =
    safeNumber(summary.conversion_rate)
      .toFixed(2);

  const registerRate =
    safeNumber(summary.register_rate)
      .toFixed(2);

  const summaryDate =
    summary.summary_date;

  const thaiDate =
    formatThaiDate(summaryDate);

  const topBrowser =
    summary.top_browser || "-";

  const topBrowserCount =
    safeNumber(summary.top_browser_count);

  const topOs =
    summary.top_operating_system || "-";

  const topOsCount =
    safeNumber(
      summary.top_operating_system_count
    );

  return {
    type: "flex",

    altText:
      `รายงานผู้เข้าชมเว็บไซต์ ` +
      `${thaiDate}`,

    contents: {
      type: "bubble",
      size: "mega",

      header: {
        type: "box",
        layout: "vertical",
        paddingAll: "20px",
        backgroundColor: "#0B3B82",

        contents: [
          {
            type: "text",
            text:
              "📊 รายงานผู้เข้าชมเว็บไซต์",
            weight: "bold",
            size: "xl",
            color: "#FFFFFF"
          },
          {
            type: "text",
            text:
              `ประจำวันที่ ${thaiDate}`,
            size: "sm",
            color: "#DCEBFF",
            margin: "sm"
          }
        ]
      },

      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "20px",

        contents: [
          {
            type: "box",
            layout: "horizontal",
            spacing: "md",

            contents: [
              {
                type: "box",
                layout: "vertical",
                flex: 1,
                backgroundColor: "#EEF5FF",
                cornerRadius: "12px",
                paddingAll: "12px",
                alignItems: "center",

                contents: [
                  {
                    type: "text",
                    text: String(visitors),
                    size: "xxl",
                    weight: "bold",
                    color: "#1357B8"
                  },
                  {
                    type: "text",
                    text: "ผู้เข้าชม",
                    size: "sm",
                    color: "#555555"
                  }
                ]
              },

              {
                type: "box",
                layout: "vertical",
                flex: 1,
                backgroundColor: "#FFF7E6",
                cornerRadius: "12px",
                paddingAll: "12px",
                alignItems: "center",

                contents: [
                  {
                    type: "text",
                    text:
                      String(registerVisitors),
                    size: "xxl",
                    weight: "bold",
                    color: "#D97706"
                  },
                  {
                    type: "text",
                    text: "เข้าลงทะเบียน",
                    size: "sm",
                    color: "#555555"
                  }
                ]
              },

              {
                type: "box",
                layout: "vertical",
                flex: 1,
                backgroundColor: "#ECFDF3",
                cornerRadius: "12px",
                paddingAll: "12px",
                alignItems: "center",

                contents: [
                  {
                    type: "text",
                    text:
                      String(successVisitors),
                    size: "xxl",
                    weight: "bold",
                    color: "#159447"
                  },
                  {
                    type: "text",
                    text: "สำเร็จ",
                    size: "sm",
                    color: "#555555"
                  }
                ]
              }
            ]
          },

          {
            type: "separator",
            margin: "md"
          },

          {
            type: "box",
            layout: "vertical",
            spacing: "sm",

            contents: [
              {
                type: "text",
                text: "ข้อมูลภาพรวม",
                weight: "bold",
                color: "#0B3B82"
              },

              {
                type: "box",
                layout: "horizontal",

                contents: [
                  {
                    type: "text",
                    text:
                      "จำนวนการเปิดหน้าเว็บ",
                    size: "sm",
                    color: "#666666",
                    flex: 3
                  },
                  {
                    type: "text",
                    text:
                      `${pageViews} ครั้ง`,
                    size: "sm",
                    weight: "bold",
                    align: "end",
                    flex: 2
                  }
                ]
              },

              {
                type: "box",
                layout: "horizontal",

                contents: [
                  {
                    type: "text",
                    text:
                      "อัตราเข้าหน้าลงทะเบียน",
                    size: "sm",
                    color: "#666666",
                    flex: 3
                  },
                  {
                    type: "text",
                    text:
                      `${registerRate}%`,
                    size: "sm",
                    weight: "bold",
                    align: "end",
                    flex: 2
                  }
                ]
              },

              {
                type: "box",
                layout: "horizontal",

                contents: [
                  {
                    type: "text",
                    text:
                      "อัตราลงทะเบียนสำเร็จ",
                    size: "sm",
                    color: "#666666",
                    flex: 3
                  },
                  {
                    type: "text",
                    text:
                      `${conversionRate}%`,
                    size: "sm",
                    weight: "bold",
                    color: "#6D28D9",
                    align: "end",
                    flex: 2
                  }
                ]
              }
            ]
          },

          {
            type: "separator",
            margin: "md"
          },

          {
            type: "box",
            layout: "vertical",
            spacing: "sm",

            contents: [
              {
                type: "text",
                text: "อุปกรณ์ที่ใช้",
                weight: "bold",
                color: "#0B3B82"
              },

              {
                type: "text",
                text:
                  `📱 มือถือ ${mobileCount} คน ` +
                  `(${calculatePercent(
                    mobileCount,
                    visitors
                  )}%)`,
                size: "sm"
              },

              {
                type: "text",
                text:
                  `💻 คอมพิวเตอร์ ` +
                  `${desktopCount} คน ` +
                  `(${calculatePercent(
                    desktopCount,
                    visitors
                  )}%)`,
                size: "sm"
              },

              {
                type: "text",
                text:
                  `📟 แท็บเล็ต ` +
                  `${tabletCount} คน ` +
                  `(${calculatePercent(
                    tabletCount,
                    visitors
                  )}%)`,
                size: "sm"
              }
            ]
          },

          {
            type: "separator",
            margin: "md"
          },

          {
            type: "box",
            layout: "vertical",
            spacing: "sm",

            contents: [
              {
                type: "text",
                text: "ข้อมูลเด่น",
                weight: "bold",
                color: "#0B3B82"
              },

              {
                type: "text",
                text:
                  `🌐 เบราว์เซอร์อันดับ 1: ` +
                  `${topBrowser} ` +
                  `(${topBrowserCount} คน)`,
                size: "sm",
                wrap: true
              },

              {
                type: "text",
                text:
                  `⚙️ ระบบปฏิบัติการอันดับ 1: ` +
                  `${topOs} (${topOsCount} คน)`,
                size: "sm",
                wrap: true
              }
            ]
          },

          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#F0FDF4",
            cornerRadius: "10px",
            paddingAll: "12px",
            margin: "md",

            contents: [
              {
                type: "text",
                text:
                  "✅ ระบบสรุปข้อมูลรายวันเรียบร้อยแล้ว",
                size: "sm",
                weight: "bold",
                color: "#15803D",
                wrap: true
              },

              {
                type: "text",
                text:
                  "ข้อมูลดิบยังอยู่ครบ " +
                  "และยังไม่ได้ถูกลบ",
                size: "xs",
                color: "#555555",
                margin: "sm",
                wrap: true
              }
            ]
          }
        ]
      },

      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "20px",

        contents: [
          {
            type: "text",
            text:
              "ต้องการล้างข้อมูลดิบของวันนี้หรือไม่?",
            size: "sm",
            weight: "bold",
            align: "center",
            wrap: true
          },

          {
            type: "button",
            style: "primary",
            color: "#D9363E",
            height: "sm",

            action: {
              type: "postback",
              label: "🗑️ ล้างข้อมูลดิบ",
              data:
                `action=delete_analytics` +
                `&date=${summaryDate}`,
              displayText:
                `ล้างข้อมูลดิบวันที่ ${thaiDate}`
            }
          },

          {
            type: "button",
            style: "secondary",
            height: "sm",

            action: {
              type: "postback",
              label: "📦 เก็บไว้ก่อน",
              data:
                `action=keep_analytics` +
                `&date=${summaryDate}`,
              displayText:
                `เก็บข้อมูลดิบวันที่ ${thaiDate} ไว้ก่อน`
            }
          }
        ]
      }
    }
  };
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
   LINE WEBHOOK

   ต้องอยู่ก่อน express.json()
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

        const userId =
          event.source?.userId;

        if (
          userId &&
          !isAllowedAdmin(userId)
        ) {
          if (event.replyToken) {
            await adminLineClient.replyMessage(
              event.replyToken,
              {
                type: "text",
                text:
                  "⛔ บัญชีนี้ไม่มีสิทธิ์ใช้งานระบบ Admin ครับ"
              }
            );
          }

          continue;
        }

        /* ===============================================
           ADMIN TEXT REPLY
        =============================================== */

        if (
          event.type === "message" &&
          event.message?.type === "text"
        ) {
          if (!userId) {
            continue;
          }

          const session =
            getSupportReplySession(userId);

          if (!session) {
            continue;
          }

          const replyText =
            String(
              event.message.text || ""
            ).trim();

          if (!replyText) {
            continue;
          }

          if (
            replyText.toLowerCase() ===
            "cancel"
          ) {
            clearSupportReplySession(userId);

            await adminLineClient.replyMessage(
              event.replyToken,
              {
                type: "text",
                text:
                  `ยกเลิกการตอบ ${session.bookingNo} แล้วครับ`
              }
            );

            continue;
          }

          const {
            data: originalMessage,
            error: originalError
          } = await supabase
            .from("professional_user_messages")
            .select(
              "id,reservation_id,booking_no," +
              "machine_id,program_version"
            )
            .eq("id", session.messageId)
            .single();

          if (
            originalError ||
            !originalMessage
          ) {
            console.error(
              "Read original support message error:",
              originalError
            );

            await adminLineClient.replyMessage(
              event.replyToken,
              {
                type: "text",
                text:
                  `❌ ไม่พบข้อความต้นทางของ ${session.bookingNo}`
              }
            );

            clearSupportReplySession(userId);
            continue;
          }

          const {
            error: insertReplyError
          } = await supabase
            .from(
              "professional_user_messages"
            )
            .insert({
              reservation_id:
                originalMessage.reservation_id,
              booking_no:
                originalMessage.booking_no,
              machine_id:
                originalMessage.machine_id,
              program_version:
                originalMessage.program_version,
              message_text:
                replyText,
              message_status:
                "NEW",
              sender_type:
                "ADMIN"
            });

          if (insertReplyError) {
            console.error(
              "Insert admin reply error:",
              insertReplyError
            );

            await adminLineClient.replyMessage(
              event.replyToken,
              {
                type: "text",
                text:
                  `❌ บันทึกคำตอบของ ${session.bookingNo} ไม่สำเร็จ`
              }
            );

            continue;
          }

          await supabase
            .from(
              "professional_user_messages"
            )
            .update({
              message_status:
                "ANSWERED",
              read_at:
                new Date().toISOString()
            })
            .eq("id", session.messageId);

          clearSupportReplySession(userId);

          await adminLineClient.replyMessage(
            event.replyToken,
            {
              type: "text",
              text:
                `✅ ตอบ ${session.bookingNo} เรียบร้อยแล้ว`
            }
          );

          continue;
        }

        /* ===============================================
           POSTBACK ACTION
        =============================================== */

        if (event.type !== "postback") {
          continue;
        }

        const params =
          new URLSearchParams(
            String(
              event.postback?.data || ""
            )
          );

        const action =
          params.get("action");

        /* ===============================================
           SUPPORT: REPLY
        =============================================== */

        if (action === "support_reply") {
          const messageId =
            String(
              params.get("message_id") || ""
            ).trim();

          const bookingNo =
            String(
              params.get("booking_no") || ""
            )
              .trim()
              .toUpperCase();

          if (
            !userId ||
            !messageId ||
            !bookingNo
          ) {
            await adminLineClient.replyMessage(
              event.replyToken,
              {
                type: "text",
                text:
                  "❌ ข้อมูลสำหรับตอบกลับไม่ครบ"
              }
            );

            continue;
          }

          setSupportReplySession(
            userId,
            {
              messageId,
              bookingNo
            }
          );

          await adminLineClient.replyMessage(
            event.replyToken,
            {
              type: "text",
              text:
                `กำลังตอบ ${bookingNo} : พิมพ์ข้อความได้เลย\n` +
                `พิมพ์ cancel เพื่อยกเลิก`
            }
          );

          continue;
        }

        /* ===============================================
           SUPPORT: CLOSE
        =============================================== */

        if (action === "support_close") {
          const messageId =
            String(
              params.get("message_id") || ""
            ).trim();

          const bookingNo =
            String(
              params.get("booking_no") || ""
            )
              .trim()
              .toUpperCase();

          if (!messageId || !bookingNo) {
            await adminLineClient.replyMessage(
              event.replyToken,
              {
                type: "text",
                text:
                  "❌ ข้อมูลสำหรับปิดเรื่องไม่ครบ"
              }
            );

            continue;
          }

          const {
            error: closeError
          } = await supabase
            .from(
              "professional_user_messages"
            )
            .update({
              message_status:
                "RESOLVED",
              resolved_at:
                new Date().toISOString()
            })
            .eq("id", messageId);

          if (closeError) {
            console.error(
              "Close support message error:",
              closeError
            );

            await adminLineClient.replyMessage(
              event.replyToken,
              {
                type: "text",
                text:
                  `❌ ปิดเรื่อง ${bookingNo} ไม่สำเร็จ`
              }
            );

            continue;
          }

          if (userId) {
            clearSupportReplySession(userId);
          }

          await adminLineClient.replyMessage(
            event.replyToken,
            {
              type: "text",
              text:
                `✅ ปิดเรื่อง ${bookingNo} เรียบร้อยแล้ว`
            }
          );

          continue;
        }

        /* ===============================================
           ANALYTICS POSTBACK
        =============================================== */

        const summaryDate =
          params.get("date");

        if (
          !summaryDate ||
          !/^\d{4}-\d{2}-\d{2}$/.test(
            summaryDate
          )
        ) {
          await adminLineClient.replyMessage(
            event.replyToken,
            {
              type: "text",
              text:
                "❌ วันที่ของข้อมูลไม่ถูกต้อง"
            }
          );

          continue;
        }

        const thaiDate =
          formatThaiDate(summaryDate);

        if (action === "keep_analytics") {
          await adminLineClient.replyMessage(
            event.replyToken,
            {
              type: "text",
              text:
                `📦 เก็บข้อมูลดิบวันที่ ` +
                `${thaiDate} ไว้ก่อนแล้วครับ\n\n` +
                `ระบบยังไม่ได้ลบข้อมูลใด ๆ`
            }
          );

          continue;
        }

        if (action === "delete_analytics") {
          const {
            data: deletedCount,
            error: deleteError
          } = await supabase.rpc(
            "delete_analytics_day",
            {
              p_summary_date:
                summaryDate
            }
          );

          if (deleteError) {
            console.error(
              "Delete analytics error:",
              deleteError
            );

            await adminLineClient.replyMessage(
              event.replyToken,
              {
                type: "text",
                text:
                  `❌ ล้างข้อมูลดิบไม่สำเร็จ\n\n` +
                  `${deleteError.message || ""}`
              }
            );

            continue;
          }

          await adminLineClient.replyMessage(
            event.replyToken,
            {
              type: "text",
              text:
                `✅ ล้างข้อมูลดิบเรียบร้อยแล้ว\n\n` +
                `📅 วันที่: ${thaiDate}\n` +
                `🗑️ จำนวนที่ลบ: ` +
                `${safeNumber(deletedCount)} แถว\n\n` +
                `ข้อมูลสรุปรายวันยังถูกเก็บไว้ครบครับ`
            }
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

/*
  JSON Parser ต้องอยู่หลัง LINE Webhook
  เพื่อไม่ให้ LINE Signature Verification เสีย
*/

app.use(express.json());

/* ===========================
   PROFESSIONAL SUPPORT ADMIN

   POST
   /api/admin/professional/support/send
=========================== */

app.use(
  "/api/admin/professional/support",

  professionalSupportAdminRoutes({
    pushLineMessageWithRetry
  })
);


/* ===========================
   PROFESSIONAL NEWS API

   GET  /api/admin/professional/news
   POST /api/admin/professional/news
   GET  /api/admin/professional/display
=========================== */

app.use(
  "/api/admin/professional",
  professionalNewsRoutes
);

/* ===========================
   PROFESSIONAL RELEASE API

   GET  /api/admin/professional/releases
   POST /api/admin/professional/releases
   POST /api/admin/professional/releases/upload
=========================== */

app.use(
  "/api/admin/professional/releases",
  professionalReleaseRoutes({
    supabase
  })
);

/* ===========================
   PROFESSIONAL PUBLIC UPDATE API

   GET  /api/professional/update/latest
   POST /api/professional/update/download
=========================== */

app.use(
  "/api/professional/update",
  professionalUpdateRoutes({
    supabase
  })
);

/* ===========================
   ANALYTICS DAILY REPORT API
=========================== */

app.post(
  "/api/analytics-daily-report",

  async (req, res) => {
    try {
      const cronSecret =
        req.headers["x-cron-secret"];

      if (
        !process.env.ANALYTICS_CRON_SECRET ||
        cronSecret !==
          process.env.ANALYTICS_CRON_SECRET
      ) {
        return res.status(403).json({
          success: false,
          message: "FORBIDDEN"
        });
      }

      const groupId =
        process.env.LINE_ADMIN_GROUP_ID;

      if (!groupId) {
        return res.status(500).json({
          success: false,
          message:
            "LINE_ADMIN_GROUP_ID is missing"
        });
      }

      const requestedDate =
        String(
          req.body?.summary_date || ""
        ).trim();

      const summaryDate =
        /^\d{4}-\d{2}-\d{2}$/.test(
          requestedDate
        )
          ? requestedDate
          : getBangkokDate(-1);

      /*
        สรุปข้อมูลของวันที่ต้องการ
        ฟังก์ชันนี้ไม่ลบ Raw Data
      */

      const {
        error: summarizeError
      } = await supabase.rpc(
        "summarize_analytics_day",
        {
          p_summary_date:
            summaryDate
        }
      );

      if (summarizeError) {
        console.error(
          "Summarize analytics error:",
          summarizeError
        );

        return res.status(500).json({
          success: false,
          message:
            "Cannot summarize analytics",
          detail:
            summarizeError.message
        });
      }

      /*
        อ่านข้อมูลสรุปที่เพิ่งบันทึก
      */

      const {
        data: summary,
        error: summaryError
      } = await supabase
        .from("analytics_daily_summary")
        .select("*")
        .eq("summary_date", summaryDate)
        .single();

      if (summaryError || !summary) {
        console.error(
          "Read analytics summary error:",
          summaryError
        );

        return res.status(500).json({
          success: false,
          message:
            "Cannot read analytics summary"
        });
      }

      const flexMessage =
        buildAnalyticsFlex(summary);

      const pushResult =
        await pushLineMessageWithRetry(
          groupId,
          flexMessage,
          `analytics-${summaryDate}`
        );

      return res.status(200).json({
        success: true,
        message:
          "Analytics daily report sent",
        summary_date:
          summaryDate,
        visitors:
          summary.visitors,
        page_views:
          summary.page_views,
        attempt:
          pushResult.attempt
      });

    } catch (err) {
      const errorDetail =
        err?.originalError?.response?.data ||
        err?.message ||
        err;

      console.error(
        "Analytics report error:",
        errorDetail
      );

      return res.status(500).json({
        success: false,
        message:
          "Cannot send analytics report"
      });
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

============================================================
FILE 2: routes/professionalSupportAdmin.js
============================================================

const express = require("express");

/* =========================================================
   BUILD COMPACT SUPPORT FLEX
========================================================= */

function buildSupportFlex({
  messageId,
  bookingNo,
  fullName,
  messageText,
  attachmentUrl
}) {
  const displayName =
    String(fullName || bookingNo || "ผู้ใช้งาน").trim();

  const cleanMessage =
    String(messageText || "").trim();

  const fileUrl =
    String(attachmentUrl || "").trim();

  const hasAttachment =
    /^https?:\/\//i.test(fileUrl);

  const lineText =
    `${displayName} : ${cleanMessage || "ส่งไฟล์แนบ"}` +
    (hasAttachment ? " 📎" : "");

  const replyData =
    new URLSearchParams({
      action: "support_reply",
      message_id: String(messageId),
      booking_no: String(bookingNo)
    }).toString();

  const closeData =
    new URLSearchParams({
      action: "support_close",
      message_id: String(messageId),
      booking_no: String(bookingNo)
    }).toString();

  const messageBox = {
    type: "text",
    text: lineText,
    size: "sm",
    color: "#222222",
    wrap: true,
    flex: 8
  };

  if (hasAttachment) {
    messageBox.action = {
      type: "uri",
      label: "เปิดไฟล์แนบ",
      uri: fileUrl
    };
  }

  return {
    type: "flex",
    altText: lineText.slice(0, 390),

    contents: {
      type: "bubble",
      size: "mega",

      body: {
        type: "box",
        layout: "horizontal",
        alignItems: "center",
        spacing: "sm",
        paddingAll: "10px",

        contents: [
          messageBox,
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: "#1357B8",
            flex: 2,

            action: {
              type: "postback",
              label: "ตอบ",
              data: replyData
            }
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            flex: 2,

            action: {
              type: "postback",
              label: "ปิด",
              data: closeData
            }
          }
        ]
      }
    }
  };
}

/* =========================================================
   ROUTER
========================================================= */

module.exports = function professionalSupportAdminRoutes({
  pushLineMessageWithRetry
}) {
  const router = express.Router();

  if (
    typeof pushLineMessageWithRetry !== "function"
  ) {
    throw new Error(
      "pushLineMessageWithRetry is required"
    );
  }

  /* =======================================================
     POST /send

     Headers:
       Content-Type: application/json
       X-Admin-Secret: <PROFESSIONAL_SUPPORT_ADMIN_SECRET>
  ======================================================= */

  router.post("/send", async (req, res) => {
    try {
      const requestSecret =
        String(
          req.headers["x-admin-secret"] || ""
        ).trim();

      const expectedSecret =
        String(
          process.env
            .PROFESSIONAL_SUPPORT_ADMIN_SECRET ||
          ""
        ).trim();

      if (!expectedSecret) {
        console.error(
          "Missing PROFESSIONAL_SUPPORT_ADMIN_SECRET"
        );

        return res.status(500).json({
          success: false,
          message:
            "Professional support secret is missing"
        });
      }

      if (requestSecret !== expectedSecret) {
        return res.status(403).json({
          success: false,
          message: "FORBIDDEN"
        });
      }

      const {
        message_id,
        booking_no,
        full_name,
        message_text,
        attachment_url
      } = req.body || {};

      const messageId =
        String(message_id || "").trim();

      const bookingNo =
        String(booking_no || "")
          .trim()
          .toUpperCase();

      const fullName =
        String(full_name || "").trim();

      const messageText =
        String(message_text || "").trim();

      const attachmentUrl =
        String(attachment_url || "").trim();

      if (!messageId) {
        return res.status(400).json({
          success: false,
          message: "message_id is required"
        });
      }

      if (!bookingNo) {
        return res.status(400).json({
          success: false,
          message: "booking_no is required"
        });
      }

      if (!messageText && !attachmentUrl) {
        return res.status(400).json({
          success: false,
          message:
            "message_text or attachment_url is required"
        });
      }

      const groupId =
        process.env.LINE_ADMIN_GROUP_ID;

      if (!groupId) {
        return res.status(500).json({
          success: false,
          message:
            "LINE_ADMIN_GROUP_ID is missing"
        });
      }

      const flexMessage =
        buildSupportFlex({
          messageId,
          bookingNo,
          fullName,
          messageText,
          attachmentUrl
        });

      const pushResult =
        await pushLineMessageWithRetry(
          groupId,
          flexMessage,
          `support-${bookingNo}-${messageId}`
        );

      return res.status(200).json({
        success: true,
        message:
          "Professional support notification sent",
        data: {
          message_id: messageId,
          booking_no: bookingNo,
          attempt: pushResult.attempt
        }
      });

    } catch (error) {
      const errorDetail =
        error?.originalError
          ?.response?.data ||
        error?.message ||
        error;

      console.error(
        "Professional support notify error:",
        errorDetail
      );

      return res.status(500).json({
        success: false,
        message:
          "Cannot notify professional support admin"
      });
    }
  });

  return router;
};


============================================================
ENVIRONMENT VARIABLE
============================================================

PROFESSIONAL_SUPPORT_ADMIN_SECRET=change-this-to-a-long-random-secret
