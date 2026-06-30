const express = require("express");

const router = express.Router();

function checkAdminKey(req) {
  const key = req.query.key || req.body?.key;
  return key && key === process.env.ADMIN_SECRET_KEY;
}

function getDaysLeft(deadline) {
  if (!deadline) return null;

  const diff = new Date(deadline).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

module.exports = function paymentInviteRoutes({ supabase }) {
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

      const items = (data || []).map((item) => ({
        ...item,
        days_left: getDaysLeft(item.early_bird_payment_deadline)
      }));

      const summary = {
        not_sent: items.filter((item) =>
          item.status === "REGISTERED" &&
          (item.payment_status === "NOT_SENT" || !item.payment_status)
        ).length,

        sent_waiting: items.filter((item) =>
          item.payment_invite_sent === true &&
          item.payment_status !== "APPROVED"
        ).length,

        expired_7_days: items.filter((item) =>
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

  return router;
};
