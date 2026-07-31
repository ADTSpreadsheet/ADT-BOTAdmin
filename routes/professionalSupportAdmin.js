const express = require("express");

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

  const bodyContents = [
    {
      type: "text",
      text: displayName,
      size: "md",
      weight: "bold",
      color: "#111827",
      wrap: true
    },
    {
      type: "text",
      text: bookingNo,
      size: "xs",
      color: "#2563EB",
      margin: "xs"
    },
    {
      type: "text",
      text: cleanMessage || "ผู้ใช้งานส่งไฟล์แนบ",
      size: "sm",
      color: "#1F2937",
      wrap: true,
      margin: "md"
    }
  ];

  if (hasAttachment) {
    bodyContents.push({
      type: "button",
      style: "link",
      height: "sm",
      margin: "md",
      action: {
        type: "uri",
        label: "เปิดไฟล์แนบ",
        uri: fileUrl
      }
    });
  }

  return {
    type: "flex",
    altText:
      `${displayName}: ${cleanMessage || "ส่งไฟล์แนบ"}`.slice(
        0,
        390
      ),
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        contents: bodyContents
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "12px",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: "#1357B8",
            action: {
              type: "postback",
              label: "ตอบกลับ",
              data:
                `action=support_prefill` +
                `&message_id=${encodeURIComponent(messageId)}` +
                `&booking_no=${encodeURIComponent(bookingNo)}`,
              inputOption: "openKeyboard",
              fillInText: `${bookingNo} : `
            }
          }
        ]
      }
    }
  };
}

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
