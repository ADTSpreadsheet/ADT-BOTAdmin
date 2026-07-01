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
      }
    }
  };
}

module.exports = ({ supabase, adminLineClient }) => {
  const router = express.Router();

  router.post("/submit-slip", upload.single("slip"), async (req, res) => {
    try {
      const bookingNo = String(req.body.booking_no || "").trim();
      const slipFile = req.file;

      if (!bookingNo) {
        return res.status(400).json({
          success: false,
          message: "MISSING_BOOKING_NO"
        });
      }

      if (!slipFile) {
        return res.status(400).json({
          success: false,
          message: "MISSING_SLIP_FILE"
        });
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
        return res.status(500).json({
          success: false,
          message: "UPLOAD_SLIP_FAILED"
        });
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
        return res.status(500).json({
          success: false,
          message: "UPDATE_RESERVATION_FAILED"
        });
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
      return res.status(500).json({
        success: false,
        message: "SERVER_ERROR"
      });
    }
  });

  return router;
};
