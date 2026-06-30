const express = require("express");

const router = express.Router();

const EARLY_BIRD_PRICE = 3500;
const NORMAL_PRICE = 4999;

function checkAdminKey(req) {
  const key = req.query.key || req.body?.key;
  return key && key === process.env.ADMIN_SECRET_KEY;
}

function getDaysLeft(deadline) {
  if (!deadline) return null;

  const diff = new Date(deadline).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function buildPaymentFlex({ item, paymentUrl, message, payPrice }) {
  return {
    type: "flex",
    altText: "ยืนยันการสั่งซื้อ ADT PileFix",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0B3B86",
        paddingAll: "20px",
        contents: [
          {
            type: "text",
            text: "ADT PileFix",
            color: "#FFFFFF",
            weight: "bold",
            size: "xl"
          },
          {
            type: "text",
            text: "ยืนยันการสั่งซื้อ",
            color: "#DCEBFF",
            size: "sm",
            margin: "sm"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: message || "สิทธิ์การสั่งซื้อของคุณพร้อมใช้งานแล้ว",
            wrap: true,
            size: "sm",
            color: "#333333"
          },
          {
            type: "separator",
            margin: "md"
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            margin: "md",
            contents: [
              {
                type: "box",
                layout: "baseline",
                contents: [
                  {
                    type: "text",
                    text: "หมายเลขจอง",
                    size: "sm",
                    color: "#666666",
                    flex: 3
                  },
                  {
                    type: "text",
                    text: item.booking_no || "-",
                    size: "sm",
                    color: "#0B3B86",
                    weight: "bold",
                    flex: 4
                  }
                ]
              },
              {
                type: "box",
                layout: "baseline",
                contents: [
                  {
                    type: "text",
                    text: "ชื่อ",
                    size: "sm",
                    color: "#666666",
                    flex: 3
                  },
                  {
                    type: "text",
                    text: item.full_name || "-",
                    size: "sm",
                    color: "#111111",
                    wrap: true,
                    flex: 4
                  }
                ]
              },
              {
                type: "box",
                layout: "baseline",
                contents: [
                  {
                    type: "text",
                    text: "ยอดชำระ",
                    size: "sm",
                    color: "#666666",
                    flex: 3
                  },
                  {
                    type: "text",
                    text: `${Number(payPrice).toLocaleString()} บาท`,
                    size: "sm",
                    color: "#D32F2F",
                    weight: "bold",
                    flex: 4
                  }
                ]
              }
            ]
          },
          {
            type: "text",
            text: "กรุณากดยืนยันการสั่งซื้อเพื่อไปยังหน้าชำระเงินและแนบสลิป ภายใน 7 วัน",
            wrap: true,
            size: "xs",
            color: "#777777",
            margin: "md"
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
            style: "primary",
            color: "#0B4EA2",
            action: {
              type: "uri",
              label: "ยืนยันการสั่งซื้อ",
              uri: paymentUrl
            }
          }
        ]
      }
    }
  };
}

module.exports = function paymentInviteRoutes({ supabase, customerLineClient }) {
  router.get("/list", async (req, res) => {
    try {
      if (!checkAdminKey(req)) {
        return res.status(401).json({
          success: false,
          message: "Invalid admin key"
        });
      }

      const { data, error } = await supabase
        .from("reservations")
        .select(`
          id,
          booking_no,
          booking_order,
          full_name,
          phone,
          email,
          facebook_account,
          line_user_id,
          early_bird,
          price,
          status,
          payment_status,
          payment_invite_sent,
          payment_invite_sent_at,
          early_bird_payment_deadline,
          payment_price
        `)
        .eq("status", "REGISTERED")
        .order("booking_order", { ascending: true });

      if (error) throw error;

      const now = Date.now();

      const items = (data || []).map((item) => {
        const daysLeft = getDaysLeft(item.early_bird_payment_deadline);

        return {
          ...item,
          days_left: daysLeft
        };
      });

      const summary = {
        not_sent: items.filter(
          (item) =>
            item.status === "REGISTERED" &&
            (item.payment_status === "NOT_SENT" || !item.payment_status)
        ).length,

        sent_waiting: items.filter(
          (item) =>
            item.payment_invite_sent === true &&
            item.payment_status !== "APPROVED"
        ).length,

        expired_7_days: items.filter(
          (item) =>
            item.payment_invite_sent === true &&
            item.early_bird_payment_deadline &&
            new Date(item.early_bird_payment_deadline).getTime() < now &&
            item.payment_status !== "APPROVED"
        ).length
      };

      return res.json({
        success: true,
        summary,
        items
      });
    } catch (err) {
      console.error("Payment invite list error:", err);

      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
  });

  router.post("/send", async (req, res) => {
    try {
      if (!checkAdminKey(req)) {
        return res.status(401).json({
          success: false,
          message: "Invalid admin key"
        });
      }

      const bookingNos = req.body.booking_nos || [];
      const message = String(req.body.message || "").trim();

      if (!bookingNos.length) {
        return res.json({
          success: false,
          message: "ไม่พบรายการที่เลือก"
        });
      }

      const { data, error } = await supabase
        .from("reservations")
        .select(`
          id,
          booking_no,
          booking_order,
          full_name,
          phone,
          line_user_id,
          early_bird,
          price,
          status
        `)
        .in("booking_no", bookingNos)
        .eq("status", "REGISTERED");

      if (error) throw error;

      let sentCount = 0;
      const failed = [];

      for (const item of data || []) {
        try {
          if (!item.line_user_id) {
            failed.push({
              booking_no: item.booking_no,
              reason: "ไม่มี line_user_id"
            });
            continue;
          }

          const payPrice = item.early_bird ? EARLY_BIRD_PRICE : NORMAL_PRICE;

          const paymentUrl =
            `${process.env.PAYMENT_PAGE_URL}?booking=${encodeURIComponent(item.booking_no)}`;

          const deadline = new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000
          ).toISOString();

          const flexMessage = buildPaymentFlex({
            item,
            paymentUrl,
            message,
            payPrice
          });

          await customerLineClient.pushMessage(item.line_user_id, flexMessage);

          await supabase
            .from("reservations")
            .update({
              payment_status: "WAIT_PAYMENT",
              payment_invite_sent: true,
              payment_invite_sent_at: new Date().toISOString(),
              early_bird_payment_deadline: deadline,
              payment_price: payPrice
            })
            .eq("id", item.id);

          sentCount++;
        } catch (sendErr) {
          failed.push({
            booking_no: item.booking_no,
            reason: sendErr.message
          });
        }
      }

      return res.json({
        success: true,
        sent_count: sentCount,
        failed
      });
    } catch (err) {
      console.error("Payment invite send error:", err);

      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
  });

  return router;
};
