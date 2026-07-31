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
    String(fullName || bookingNo || "ผู้ใช้งาน")
      .trim();

  const cleanMessage =
    String(messageText || "")
      .trim();

  const fileUrl =
    String(attachmentUrl || "")
      .trim();

  const hasAttachment =
    /^https?:\/\//i.test(fileUrl);

  const messageComponent = {
    type: "text",
    text:
      `${displayName} : ${cleanMessage}` +
      (hasAttachment ? " 📎" : ""),
    size: "sm",
    color: "#222222",
    wrap: true,
    flex: 7
  };

  /*
    ถ้ามีไฟล์แนบ:
    กดที่ข้อความเพื่อเปิดไฟล์ใน LINE ได้
  */

  if (hasAttachment) {
    messageComponent.action = {
      type: "uri",
      label: "เปิดไฟล์แนบ",
      uri: fileUrl
    };
  }

  const replyPostback =
    new URLSearchParams({
      action: "support_reply",
      message_id: messageId,
      booking_no: bookingNo
    }).toString();

  const closePostback =
    new URLSearchParams({
      action: "support_close",
      message_id: messageId,
      booking_no: bookingNo
    }).toString();

  return {
    type: "flex",

    altText:
      `${displayName} : ${cleanMessage}`
        .slice(0, 390),

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
          messageComponent,

          {
            type: "button",
            style: "primary",
            height: "sm",
            color: "#1357B8",
            flex: 2,

            action: {
              type: "postback",
              label: "ตอบ",
              data: replyPostback
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
              data: closePostback
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
          messageText:
            messageText || "ส่งไฟล์แนบ",
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
