const express = require("express");
const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

function getExt(filename = "") {
  const ext = filename.split(".").pop();
  return ext ? ext.toLowerCase() : "jpg";
}

function adminSlipUrl(bookingNo) {
  const base = "https://adt-botadmin.onrender.com";
  const key = encodeURIComponent(process.env.ADMIN_SECRET_KEY || "");

  return `${base}/api/payment/view-slip?booking_no=${encodeURIComponent(bookingNo)}&key=${key}`;
}

function botApiUrl(action, bookingNo) {
  const base = "https://adt-linebot-pilefix.onrender.com";
  const key = encodeURIComponent(process.env.BOT_API_SECRET || "");

  return `${base}/api/admin/payment-action?booking_no=${encodeURIComponent(bookingNo)}&action=${encodeURIComponent(action)}&key=${key}`;
}

function buildAdminFlex({ bookingNo, fullName, amount }) {
  return {
    type: "flex",
    altText: `มีผู้ส่งสลิป ${bookingNo}`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "📩 มีผู้ส่งหลักฐานชำระเงิน",
            weight: "bold",
            size: "lg",
            color: "#0B4DA2"
          },
          { type: "separator", margin: "md" },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            margin: "md",
            contents: [
              { type: "text", text: `Booking No: ${bookingNo}`, weight: "bold" },
              { type: "text", text: `ชื่อ: ${fullName || "-"}` },
              {
                type: "text",
                text: `ยอดชำระ: ${Number(amount || 3500).toLocaleString("th-TH")} บาท`
              },
              {
                type: "text",
                text: "สถานะ: รอตรวจสอบสลิป",
                color: "#D97706",
                weight: "bold"
              }
            ]
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "secondary",
            action: {
              type: "uri",
              label: "👁 ดูสลิป",
              uri: adminSlipUrl(bookingNo)
            }
          },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
              {
                type: "button",
                style: "primary",
                color: "#16A34A",
                action: {
                  type: "uri",
                  label: "✅ AP",
                  uri: botApiUrl("AP", bookingNo)
                }
              },
              {
                type: "button",
                style: "primary",
                color: "#DC2626",
                action: {
                  type: "uri",
                  label: "❌ RJ",
                  uri: botApiUrl("RJ", bookingNo)
                }
              }
            ]
          }
        ]
      }
    }
  };
}

module.exports = ({ supabase, adminLineClient }) => {
  const router = express.Router();

  function checkAdminKey(req, res) {
    const key = req.query.key;

    if (!process.env.ADMIN_SECRET_KEY || key !== process.env.ADMIN_SECRET_KEY) {
      res.status(403).send("FORBIDDEN");
      return false;
    }

    return true;
  }

  router.post("/submit-slip", upload.single("slip"), async (req, res) => {
    try {
      const bookingNo = String(req.body.booking_no || "").trim();
      const slipFile = req.file;

      if (!bookingNo) {
        return res.status(400).json({ success: false, message: "MISSING_BOOKING_NO" });
      }

      if (!slipFile) {
        return res.status(400).json({ success: false, message: "MISSING_SLIP_FILE" });
      }

      const ext = getExt(slipFile.originalname);
      const filePath = `PAYSLIPS-${bookingNo}/PAYSLIPS-${bookingNo}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("payment-slips")
        .upload(filePath, slipFile.buffer, {
          contentType: slipFile.mimetype,
          upsert: true
        });

      if (uploadError) {
        console.error("UPLOAD ERROR:", uploadError);
        return res.status(500).json({ success: false, message: "UPLOAD_SLIP_FAILED" });
      }

      const { data: reservation, error: updateError } = await supabase
        .from("reservations")
        .update({
          payment_slip_url: filePath,
          payment_submitted_at: new Date().toISOString(),
          payment_status: "PAYMENT_REVIEW"
        })
        .eq("booking_no", bookingNo)
        .select("booking_no, full_name, payment_price")
        .single();

      if (updateError) {
        console.error("UPDATE ERROR:", updateError);
        return res.status(500).json({ success: false, message: "UPDATE_RESERVATION_FAILED" });
      }

      res.status(200).json({
        success: true,
        message: "PAYMENT_SUBMITTED",
        redirect: "/payment-waiting.html"
      });

      const flex = buildAdminFlex({
        bookingNo: reservation.booking_no,
        fullName: reservation.full_name,
        amount: reservation.payment_price
      });

      adminLineClient
        .pushMessage(process.env.LINE_ADMIN_GROUP_ID, flex)
        .catch((err) => console.error("LINE FLEX ERROR:", err));

    } catch (err) {
      console.error("SUBMIT SLIP ERROR:", err);
      return res.status(500).json({ success: false, message: "SERVER_ERROR" });
    }
  });

  router.get("/view-slip", async (req, res) => {
    try {
      if (!checkAdminKey(req, res)) return;

      const bookingNo = String(req.query.booking_no || "").trim();

      const { data, error } = await supabase
        .from("reservations")
        .select("payment_slip_url")
        .eq("booking_no", bookingNo)
        .single();

      if (error || !data?.payment_slip_url) {
        return res.status(404).send("ไม่พบสลิป");
      }

      const { data: signed, error: signedError } = await supabase.storage
        .from("payment-slips")
        .createSignedUrl(data.payment_slip_url, 60 * 5);

      if (signedError || !signed?.signedUrl) {
        return res.status(500).send("สร้างลิงก์ดูสลิปไม่สำเร็จ");
      }

      return res.redirect(signed.signedUrl);

    } catch (err) {
      console.error("VIEW SLIP ERROR:", err);
      return res.status(500).send("SERVER ERROR");
    }
  });

  return router;
};
