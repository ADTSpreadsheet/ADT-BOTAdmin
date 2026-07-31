const express = require("express");

function formatBangkokDateTime(date = new Date()) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function buildSupportFlex({
  messageId,
  bookingNo,
  fullName,
  messageText,
  attachmentUrl
}) {
  const displayName =
    String(
      fullName ||
      bookingNo ||
      "ผู้ใช้งาน"
    ).trim();

  const cleanMessage =
    String(messageText || "").trim();

  const fileUrl =
    String(attachmentUrl || "").trim();

  const hasAttachment =
    /^https?:\/\//i.test(fileUrl);

  const sentAt =
    formatBangkokDateTime();

  const headerText =
    `${displayName} ${sentAt}`;

  const bodyText =
    cleanMessage || "ส่งไฟล์แนบ";

  const altText =
    `${displayName} : ${bodyText}` +
    (hasAttachment ? " 📎" : "");

  const replyData =
    new URLSearchParams({
      action: "support_reply",
      message_id: String(messageId),
      booking_no: String(bookingNo)
    }).toString();

  const messageBox = {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    flex: 9,
    contents: [
      {
        type: "text",
        text: headerText,
        size: "sm",
        weight: "bold",
        color: "#1357B8",
        wrap: true
      },
      {
        type: "text",
        text: bodyText,
        size: "sm",
        color: "#222222",
        wrap: true
      },
      {
        type: "text",
        text: bookingNo,
        size: "xs",
        color: "#888888",
        wrap: true
      }
    ]
  };

  if (hasAttachment) {
    messageBox.contents.push({
      type: "text",
      text: "📎 เปิดไฟล์แนบ",
      size: "xs",
      color: "#1357B8",
      weight: "bold",
      margin: "sm",
      action: {
        type: "uri",
        label: "เปิดไฟล์แนบ",
        uri: fileUrl
      }
    });
  }

  return {
    type: "flex",
    altText: altText.slice(0, 390),
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
          }
        ]
      }
    }
  };
}

module.exports =
function professionalSupportAdminRoutes({
  pushLineMessageWithRetry
}) {
  const router = express.Router();

  if (
    typeof pushLineMessageWithRetry !==
    "function"
  ) {
    throw new Error(
      "pushLineMessageWithRetry is required"
    );
  }

  router.post("/send", async (req, res) => {
    try {
      const requestSecret =
        String(
          req.headers["x-admin-secret"] ||
          ""
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

      if (
        requestSecret !== expectedSecret
      ) {
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
        String(
          attachment_url || ""
        ).trim();

      const uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      if (!messageId) {
        return res.status(400).json({
          success: false,
          message:
            "message_id is required"
        });
      }

      if (!uuidPattern.test(messageId)) {
        return res.status(400).json({
          success: false,
          message:
            "message_id must be a valid UUID"
        });
      }

      if (!bookingNo) {
        return res.status(400).json({
          success: false,
          message:
            "booking_no is required"
        });
      }

      if (
        !/^PF-\d+$/i.test(bookingNo)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "booking_no format is invalid"
        });
      }

      if (
        !messageText &&
        !attachmentUrl
      ) {
        return res.status(400).json({
          success: false,
          message:
            "message_text or attachment_url is required"
        });
      }

      const groupId =
        String(
          process.env.LINE_ADMIN_GROUP_ID ||
          ""
        ).trim();

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
