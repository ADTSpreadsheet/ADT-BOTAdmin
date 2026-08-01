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

/**
 * สถานะหลังชำระเงิน
 *
 * NOT_APPLICABLE
 *   = ยังไม่ได้อนุมัติการชำระเงิน
 *
 * WAIT_JACKET_SELECTION
 *   = ชำระแล้ว อยู่ในสิทธิ์ 1-50 แต่ยังไม่มีข้อมูลใน jacket_orders
 *
 * DOWNLOAD_PENDING
 *   = บันทึกข้อมูลเสื้อแล้ว แต่ยังไม่มีผลการส่งลิงก์
 *
 * DOWNLOAD_FAILED
 *   = บันทึกข้อมูลเสื้อแล้ว แต่ส่งลิงก์ LINE ไม่สำเร็จ
 *
 * DOWNLOAD_SENT
 *   = ส่งลิงก์ดาวน์โหลดทาง LINE สำเร็จแล้ว
 *
 * NO_JACKET_REQUIRED
 *   = ชำระแล้ว แต่ไม่อยู่ในสิทธิ์เสื้อ 1-50
 */
function getFulfillmentStatus(item) {
  const paymentStatus = normalize(item.payment_status);
  const accountStatus = normalize(item.account_status);
  const isPaid =
    paymentStatus === "APPROVED" ||
    accountStatus === "ACTIVE";

  if (!isPaid) {
    return "NOT_APPLICABLE";
  }

  const bookingOrder = Number(item.booking_order || 0);
  const hasJacketRight =
    bookingOrder >= 1 &&
    bookingOrder <= 50;

  const jacket = item.jacket_order || null;

  if (!hasJacketRight) {
    return "NO_JACKET_REQUIRED";
  }

  if (!jacket) {
    return "WAIT_JACKET_SELECTION";
  }

  const messageStatus = normalize(
    jacket.download_message_status || "PENDING"
  );

  if (messageStatus === "SENT") {
    return "DOWNLOAD_SENT";
  }

  if (messageStatus === "FAILED") {
    return "DOWNLOAD_FAILED";
  }

  return "DOWNLOAD_PENDING";
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

      /*
       * ดึง reservations และ jacket_orders แยกกัน
       * แล้ว JOIN ใน Node.js
       *
       * วิธีนี้ชัวร์กว่า Supabase embedded select
       * เพราะไม่ต้องพึ่งชื่อ Foreign Key relation
       */

      const [
        reservationResult,
        jacketResult
      ] = await Promise.all([
        supabase
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
            created_at,

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
            last_api_at,

            download_token,
            download_count,
            last_download_at
          `)
          .order("created_at", { ascending: true }),

        supabase
          .from("jacket_orders")
          .select(`
            id,
            reservation_id,
            booking_no,
            jacket_color,
            jacket_size,
            jacket_status,
            submitted_at,
            updated_at,
            download_message_status,
            download_message_sent_at,
            download_message_error,
            download_message_retry_count
          `)
      ]);

      if (reservationResult.error) {
        throw reservationResult.error;
      }

      if (jacketResult.error) {
        throw jacketResult.error;
      }

      const reservations = reservationResult.data || [];
      const jacketOrders = jacketResult.data || [];

      /*
       * ทำ Map ด้วย reservation_id
       * เพราะเป็น key ที่แม่นกว่าการใช้ booking_no
       */
      const jacketMap = new Map();

      jacketOrders.forEach((jacket) => {
        if (!jacket.reservation_id) return;

        jacketMap.set(
          String(jacket.reservation_id),
          {
            ...jacket,
            jacket_status: normalize(jacket.jacket_status),
            download_message_status: normalize(
              jacket.download_message_status || "PENDING"
            ),
            download_message_retry_count: Number(
              jacket.download_message_retry_count || 0
            )
          }
        );
      });

      const items = reservations.map((item) => {
        const jacketOrder =
          jacketMap.get(String(item.id)) || null;

        const normalizedItem = {
          ...item,

          status: normalize(item.status),
          payment_status: normalize(item.payment_status),
          account_status: normalize(item.account_status),
          license_status: normalize(item.license_status),

          payment_invite_sent:
            item.payment_invite_sent === true,

          days_left:
            getDaysLeft(item.early_bird_payment_deadline),

          jacket_order: jacketOrder,

          has_jacket_order:
            jacketOrder !== null,

          jacket_status:
            jacketOrder?.jacket_status || null,

          jacket_color:
            jacketOrder?.jacket_color || null,

          jacket_size:
            jacketOrder?.jacket_size || null,

          jacket_submitted_at:
            jacketOrder?.submitted_at || null,

          download_message_status:
            jacketOrder?.download_message_status || null,

          download_message_sent_at:
            jacketOrder?.download_message_sent_at || null,

          download_message_error:
            jacketOrder?.download_message_error || null,

          download_message_retry_count:
            jacketOrder?.download_message_retry_count || 0
        };

        return {
          ...normalizedItem,

          dashboard_status:
            getDashboardStatus(normalizedItem),

          fulfillment_status:
            getFulfillmentStatus(normalizedItem)
        };
      });

      const summary = {
        total: items.length,

        not_sent: items.filter(
          (item) =>
            item.dashboard_status === "NOT_SENT"
        ).length,

        wait_payment: items.filter(
          (item) =>
            item.dashboard_status === "WAIT_PAYMENT" ||
            item.dashboard_status === "EXPIRED"
        ).length,

        payment_review: items.filter(
          (item) =>
            item.dashboard_status === "PAYMENT_REVIEW"
        ).length,

        approved: items.filter(
          (item) =>
            item.dashboard_status === "APPROVED"
        ).length,

        rejected: items.filter(
          (item) =>
            item.dashboard_status === "REJECTED"
        ).length,

        active: items.filter(
          (item) =>
            item.dashboard_status === "ACTIVE"
        ).length,

        expired: items.filter(
          (item) =>
            item.dashboard_status === "EXPIRED"
        ).length,

        /*
         * สรุปสถานะหลังการชำระเงิน
         */
        wait_jacket_selection: items.filter(
          (item) =>
            item.fulfillment_status ===
            "WAIT_JACKET_SELECTION"
        ).length,

        download_pending: items.filter(
          (item) =>
            item.fulfillment_status ===
            "DOWNLOAD_PENDING"
        ).length,

        download_failed: items.filter(
          (item) =>
            item.fulfillment_status ===
            "DOWNLOAD_FAILED"
        ).length,

        download_sent: items.filter(
          (item) =>
            item.fulfillment_status ===
            "DOWNLOAD_SENT"
        ).length,

        no_jacket_required: items.filter(
          (item) =>
            item.fulfillment_status ===
            "NO_JACKET_REQUIRED"
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
