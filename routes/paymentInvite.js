const express = require("express");

const router = express.Router();

function checkAdminKey(req) {
  const key = req.query.key || req.body?.key;
  return key && key === process.env.ADMIN_SECRET_KEY;
}

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function getDaysLeft(deadline) {
  if (!deadline) return null;

  const diff = new Date(deadline).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getDashboardStatus(item) {
  const paymentStatus = normalize(item.payment_status);
  const accountStatus = normalize(item.account_status);

  if (accountStatus === "ACTIVE") return "ACTIVE";
  if (paymentStatus === "APPROVED") return "APPROVED";
  if (paymentStatus === "REJECTED") return "REJECTED";
  if (paymentStatus === "PAYMENT_REVIEW") return "PAYMENT_REVIEW";

  if (
    item.payment_invite_sent === true &&
    item.early_bird_payment_deadline &&
    new Date(item.early_bird_payment_deadline).getTime() < Date.now()
  ) {
    return "EXPIRED";
  }

  if (item.payment_invite_sent === true) return "WAIT_PAYMENT";

  return "NOT_SENT";
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
          payment_price,
          payment_invite_sent,
          payment_invite_sent_at,
          early_bird_payment_deadline,
          payment_slip_url,
          payment_submitted_at,
          payment_approved_at,
          payment_rejected_at,
          payment_verified,
          payment_verified_at,

          username,
          account_status,
          account_created_at,
          first_login,

          activated_at,
          license_status,
          license_type,
          last_login_at,
          last_api_at
        `)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const items = (data || []).map((item) => {
        const normalizedItem = {
          ...item,
          status: normalize(item.status),
          payment_status: normalize(item.payment_status),
          account_status: normalize(item.account_status),
          license_status: normalize(item.license_status),
          payment_invite_sent: item.payment_invite_sent === true,
          days_left: getDaysLeft(item.early_bird_payment_deadline)
        };

        return {
          ...normalizedItem,
          dashboard_status: getDashboardStatus(normalizedItem)
        };
      });

      const summary = {
        total: items.length,

        not_sent: items.filter((item) =>
          item.dashboard_status === "NOT_SENT"
        ).length,

        wait_payment: items.filter((item) =>
          item.dashboard_status === "WAIT_PAYMENT" ||
          item.dashboard_status === "EXPIRED"
        ).length,

        payment_review: items.filter((item) =>
          item.dashboard_status === "PAYMENT_REVIEW"
        ).length,

        approved: items.filter((item) =>
          item.dashboard_status === "APPROVED"
        ).length,

        rejected: items.filter((item) =>
          item.dashboard_status === "REJECTED"
        ).length,

        active: items.filter((item) =>
          item.dashboard_status === "ACTIVE"
        ).length,

        expired: items.filter((item) =>
          item.dashboard_status === "EXPIRED"
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
