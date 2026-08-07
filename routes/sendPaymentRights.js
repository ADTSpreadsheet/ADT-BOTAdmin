const express = require("express");
const crypto = require("crypto");

const router = express.Router();

function checkAdminKey(req) {
  const key = req.query.key || req.body?.key;
  return key && key === process.env.ADMIN_SECRET_KEY;
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString("th-TH");
}

function replaceMessageTemplate(message, item) {
  return String(message || "")
    .replaceAll("{name}", item.full_name || "ลูกค้า")
    .replaceAll("{booking_no}", item.booking_no || "-")
    .replaceAll(
      "{price}",
      formatPrice(item.payment_price || item.price || 3500)
    );
}

function getRightsSecret() {
  return (
    process.env.RIGHTS_ACTION_SECRET ||
    process.env.ADMIN_SECRET_KEY ||
    ""
  );
}

function createActionToken(bookingNo, action) {
  const secret = getRightsSecret();

  if (!secret) {
    throw new Error(
      "Missing RIGHTS_ACTION_SECRET or ADMIN_SECRET_KEY"
    );
  }

  return crypto
    .createHmac("sha256", secret)
    .update(`${String(bookingNo).toUpperCase()}|${String(action).toUpperCase()}`)
    .digest("hex");
}

function verifyActionToken(bookingNo, action, token) {
  try {
    const expected = createActionToken(bookingNo, action);

    const a = Buffer.from(expected);
    const b = Buffer.from(String(token || ""));

    if (a.length !== b.length) return false;

    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    return false;
  }
}

function getPublicRightsBaseUrl() {
  return (
    process.env.PAYMENT_RIGHTS_BASE_URL ||
    "https://adt-linebot-pilefix.onrender.com/api/payment-rights"
  ).replace(/\/+$/, "");
}

function getPaymentPageUrl(bookingNo) {
  const paymentPageBaseUrl =
    process.env.PAYMENT_PAGE_URL ||
    "https://adt-pilefix.onrender.com/payment.html";

  const separator = paymentPageBaseUrl.includes("?") ? "&" : "?";

  return (
    `${paymentPageBaseUrl}${separator}` +
    `booking_no=${encodeURIComponent(bookingNo)}`
  );
}

function getActionUrl(bookingNo, action) {
  const baseUrl = getPublicRightsBaseUrl();
  const token = createActionToken(bookingNo, action);

  return (
    `${baseUrl}/${String(action).toLowerCase()}` +
    `?booking_no=${encodeURIComponent(bookingNo)}` +
    `&token=${encodeURIComponent(token)}`
  );
}

function buildPaymentRightsFlex(item, adminMessage) {
  const bookingNo = item.booking_no;
  const name = item.full_name || "ลูกค้า";
  const price = formatPrice(item.payment_price || item.price || 3500);

  const paymentUrl = getActionUrl(bookingNo, "PAY");
  const extendUrl = getActionUrl(bookingNo, "EXTEND");
  const cancelUrl = getActionUrl(bookingNo, "CANCEL");

  return {
    type: "flex",
    altText: `ADT PileFix | จัดการสิทธิ์ ${bookingNo}`,
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
            text: "ADT PileFix",
            weight: "bold",
            size: "xl",
            color: "#0B3B86"
          },
          {
            type: "text",
            text: `สวัสดีครับ คุณ${name}`,
            size: "md",
            wrap: true
          },
          {
            type: "separator",
            margin: "md"
          },
          {
            type: "text",
            text:
              adminMessage ||
              "วันนี้เป็นวันสุดท้ายของรอบชำระเงินราคา Early Bird 3,500 บาท กรุณาเลือกดำเนินการด้านล่างตามความสะดวกครับ",
            wrap: true,
            size: "sm",
            margin: "md"
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: `หมายเลขจอง: ${bookingNo}`,
                size: "sm",
                color: "#333333"
              },
              {
                type: "text",
                text: `ยอดชำระ: ${price} บาท`,
                size: "sm",
                weight: "bold",
                color: "#D32F2F"
              }
            ]
          },
          {
            type: "text",
            text:
              "หากยังไม่สะดวกชำระวันนี้ สามารถขอรักษาสิทธิ์ราคาเดิมเพิ่มอีก 7 วันได้ 1 ครั้ง",
            wrap: true,
            size: "xs",
            margin: "lg",
            color: "#666666"
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
            color: "#16A34A",
            action: {
              type: "uri",
              label: "ชำระเงินตอนนี้",
              uri: paymentUrl
            }
          },
          {
            type: "button",
            style: "primary",
            color: "#EAB308",
            action: {
              type: "uri",
              label: "ขอรักษาสิทธิ์ 7 วัน",
              uri: extendUrl
            }
          },
          {
            type: "button",
            style: "secondary",
            action: {
              type: "uri",
              label: "ขอยกเลิกสิทธิ์",
              uri: cancelUrl
            }
          }
        ]
      }
    }
  };
}


async function notifyAdmin(lineClient, message) {
  const adminLineUserId = String(
    process.env.ADMIN_LINE_USER_ID || ""
  ).trim();

  if (!adminLineUserId) {
    console.warn(
      "ADMIN_LINE_USER_ID is not configured. Skip admin notification."
    );
    return;
  }

  try {
    await lineClient.pushMessage(adminLineUserId, {
      type: "text",
      text: String(message || "")
    });
  } catch (err) {
    console.error(
      "Notify admin failed:",
      err?.originalError?.response?.data ||
      err
    );

    /*
      ไม่ throw ต่อ
      เพราะการแจ้ง Admin ล้มเหลว
      ต้องไม่ทำให้ action ของลูกค้าล้มเหลวตาม
    */
  }
}

function formatThaiDateTime(value) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString(
    "th-TH",
    {
      timeZone: "Asia/Bangkok",
      dateStyle: "medium",
      timeStyle: "short"
    }
  );
}

function htmlPage(title, message, buttonHtml = "") {
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
body{margin:0;background:#eef3fa;font-family:Tahoma,sans-serif;color:#1f2937}
.wrap{max-width:560px;margin:50px auto;padding:18px}
.card{background:#fff;border-radius:18px;padding:28px;box-shadow:0 10px 30px rgba(0,0,0,.08)}
h1{margin-top:0;color:#0b3b86;font-size:24px}
p{line-height:1.8}
.btn{display:block;width:100%;box-sizing:border-box;border:0;border-radius:10px;padding:14px 18px;font-size:16px;font-weight:bold;cursor:pointer;text-align:center;text-decoration:none}
.btn-red{background:#dc2626;color:#fff}
.btn-gray{background:#e5e7eb;color:#374151;margin-top:10px}
.note{font-size:13px;color:#64748b;margin-top:18px}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
    ${buttonHtml}
    <div class="note">ทีมงาน ADT</div>
  </div>
</div>
</body>
</html>`;
}

module.exports = function sendPaymentRightsRoutes({
  supabase,
  lineClient
}) {
  /*
    POST /api/payment-rights/send

    ส่ง Flex ตัวที่ 2
    - ไม่แก้ payment_status
    - ไม่แก้ early_bird_payment_deadline
    - ไม่แก้ราคา
  */
  router.post("/send", async (req, res) => {
    try {
      if (!checkAdminKey(req)) {
        return res.status(401).json({
          success: false,
          message: "Invalid admin key"
        });
      }

      const bookingNos = req.body.booking_nos || [];
      const message = req.body.message || "";

      if (!Array.isArray(bookingNos) || bookingNos.length === 0) {
        return res.status(400).json({
          success: false,
          message: "booking_nos is required"
        });
      }

      const normalizedBookingNos = bookingNos
        .map((bookingNo) =>
          String(bookingNo || "").trim().toUpperCase()
        )
        .filter(Boolean);

      if (normalizedBookingNos.length === 0) {
        return res.status(400).json({
          success: false,
          message: "ไม่พบหมายเลขการจองที่ถูกต้อง"
        });
      }

      const { data, error } = await supabase
        .from("reservations")
        .select(`
          id,
          booking_no,
          full_name,
          phone,
          line_user_id,
          price,
          payment_price,
          payment_status,
          rights_status,
          extension_count
        `)
        .in("booking_no", normalizedBookingNos);

      if (error) throw error;

      const items = data || [];

      if (items.length === 0) {
        return res.status(404).json({
          success: false,
          message: "ไม่พบข้อมูล PF No. ที่เลือก"
        });
      }

      let sentCount = 0;
      const failed = [];

      const foundBookingNos = new Set(
        items.map((item) => item.booking_no)
      );

      for (const bookingNo of normalizedBookingNos) {
        if (!foundBookingNos.has(bookingNo)) {
          failed.push({
            booking_no: bookingNo,
            reason: "ไม่พบข้อมูลการจอง"
          });
        }
      }

      for (const item of items) {
        try {
          if (!item.line_user_id) {
            failed.push({
              booking_no: item.booking_no,
              reason: "ไม่มี line_user_id"
            });
            continue;
          }

          const paymentStatus = String(
            item.payment_status || ""
          ).toUpperCase();

          if (
            ["PAYMENT_REVIEW", "APPROVED", "ACTIVE"].includes(
              paymentStatus
            )
          ) {
            failed.push({
              booking_no: item.booking_no,
              reason: `สถานะ ${paymentStatus} ไม่ควรส่ง Flex จัดการสิทธิ์`
            });
            continue;
          }

          const finalMessage = replaceMessageTemplate(
            message,
            item
          );

          const flex = buildPaymentRightsFlex(
            item,
            finalMessage
          );

          await lineClient.pushMessage(
            item.line_user_id,
            flex
          );

          sentCount++;
        } catch (err) {
          console.error(
            `Send payment rights failed for ${item.booking_no}:`,
            err
          );

          failed.push({
            booking_no: item.booking_no,
            reason: err.message || "ไม่ทราบสาเหตุ"
          });
        }
      }

      const allFailed = sentCount === 0;

      return res.status(allFailed ? 500 : 200).json({
        success: !allFailed,
        sent_count: sentCount,
        failed_count: failed.length,
        failed,
        message: allFailed
          ? "ส่ง Flex จัดการสิทธิ์ไม่สำเร็จ"
          : failed.length > 0
            ? `ส่งสำเร็จ ${sentCount} รายการ และไม่สำเร็จ ${failed.length} รายการ`
            : `ส่งสำเร็จ ${sentCount} รายการ`
      });
    } catch (err) {
      console.error("Send payment rights error:", err);

      return res.status(500).json({
        success: false,
        message:
          err.message ||
          "เกิดข้อผิดพลาดในการส่ง Flex จัดการสิทธิ์"
      });
    }
  });

  /*
    GET /api/payment-rights/pay

    ลูกค้ากดปุ่ม "ชำระเงินตอนนี้"
    - บันทึก rights_status = PAYMENT_CLICKED
    - บันทึกเวลาที่กด
    - จากนั้น redirect ไป payment.html
  */
  router.get("/pay", async (req, res) => {
    try {
      const bookingNo = String(
        req.query.booking_no || ""
      )
        .trim()
        .toUpperCase();

      const token = String(req.query.token || "");

      if (!bookingNo) {
        return res
          .status(400)
          .send(
            htmlPage(
              "ไม่พบหมายเลขจอง",
              "กรุณาเปิดลิงก์จากข้อความ LINE ที่ระบบส่งให้ครับ"
            )
          );
      }

      if (!verifyActionToken(bookingNo, "PAY", token)) {
        return res
          .status(403)
          .send(
            htmlPage(
              "ลิงก์ไม่ถูกต้อง",
              "ไม่สามารถตรวจสอบสิทธิ์จากลิงก์นี้ได้ กรุณาติดต่อทีมงาน ADT"
            )
          );
      }

      const { data: item, error } = await supabase
        .from("reservations")
        .select(`
          booking_no,
          full_name,
          phone,
          payment_status,
          payment_price,
          price,
          rights_status
        `)
        .eq("booking_no", bookingNo)
        .maybeSingle();

      if (error) throw error;

      if (!item) {
        return res
          .status(404)
          .send(
            htmlPage(
              "ไม่พบข้อมูลการจอง",
              `ไม่พบข้อมูลหมายเลขจอง ${bookingNo}`
            )
          );
      }

      const paymentStatus = String(
        item.payment_status || ""
      ).toUpperCase();

      if (
        ["PAYMENT_REVIEW", "APPROVED", "ACTIVE"].includes(
          paymentStatus
        )
      ) {
        return res.redirect(getPaymentPageUrl(bookingNo));
      }

      if (
        String(item.rights_status || "").toUpperCase() ===
        "CANCELLED"
      ) {
        return res.send(
          htmlPage(
            "สิทธิ์ถูกยกเลิกแล้ว",
            "รายการนี้ได้ยกเลิกสิทธิ์ไปแล้ว กรุณาติดต่อทีมงานหากต้องการกลับมาใช้งานอีกครั้ง"
          )
        );
      }

      const now = new Date();

      const { error: updateError } = await supabase
        .from("reservations")
        .update({
          rights_status: "PAYMENT_CLICKED",
          rights_action_updated_at: now.toISOString()
        })
        .eq("booking_no", bookingNo);

      if (updateError) throw updateError;

      return res.redirect(getPaymentPageUrl(bookingNo));
    } catch (err) {
      console.error("Payment rights pay error:", err);

      return res
        .status(500)
        .send(
          htmlPage(
            "เกิดข้อผิดพลาด",
            "ระบบไม่สามารถเปิดหน้าชำระเงินได้ในขณะนี้ กรุณาติดต่อทีมงาน ADT"
          )
        );
    }
  });

  /*
    GET /api/payment-rights/extend

    ลูกค้ากดปุ่ม "ขอรักษาสิทธิ์ 7 วัน"
    - ขยายได้ 1 ครั้ง
    - ล็อกราคา Early Bird ที่ 3,500
    - อัปเดต early_bird_payment_deadline ด้วย
      เพื่อให้ระบบ payment เดิมยังใช้งานต่อได้
  */
  router.get("/extend", async (req, res) => {
    try {
      const bookingNo = String(
        req.query.booking_no || ""
      )
        .trim()
        .toUpperCase();

      const token = String(req.query.token || "");

      if (!bookingNo) {
        return res
          .status(400)
          .send(
            htmlPage(
              "ไม่พบหมายเลขจอง",
              "กรุณาเปิดลิงก์จากข้อความ LINE ที่ระบบส่งให้ครับ"
            )
          );
      }

      if (!verifyActionToken(bookingNo, "EXTEND", token)) {
        return res
          .status(403)
          .send(
            htmlPage(
              "ลิงก์ไม่ถูกต้อง",
              "ไม่สามารถตรวจสอบสิทธิ์จากลิงก์นี้ได้ กรุณาติดต่อทีมงาน ADT"
            )
          );
      }

      const { data: item, error } = await supabase
        .from("reservations")
        .select(`
          id,
          booking_no,
          full_name,
          phone,
          payment_status,
          payment_price,
          price,
          rights_status,
          extension_count,
          extension_deadline
        `)
        .eq("booking_no", bookingNo)
        .maybeSingle();

      if (error) throw error;

      if (!item) {
        return res
          .status(404)
          .send(
            htmlPage(
              "ไม่พบข้อมูลการจอง",
              `ไม่พบข้อมูลหมายเลขจอง ${bookingNo}`
            )
          );
      }

      const paymentStatus = String(
        item.payment_status || ""
      ).toUpperCase();

      if (
        ["PAYMENT_REVIEW", "APPROVED", "ACTIVE"].includes(
          paymentStatus
        )
      ) {
        return res.send(
          htmlPage(
            "ไม่ต้องขยายสิทธิ์",
            "รายการนี้เข้าสู่ขั้นตอนชำระเงินหรืออนุมัติแล้วครับ"
          )
        );
      }

      if (
        String(item.rights_status || "").toUpperCase() ===
        "CANCELLED"
      ) {
        return res.send(
          htmlPage(
            "สิทธิ์ถูกยกเลิกแล้ว",
            "รายการนี้ได้ยกเลิกสิทธิ์ไปแล้ว กรุณาติดต่อทีมงานหากต้องการสอบถามเพิ่มเติม"
          )
        );
      }

      const extensionCount = Number(
        item.extension_count || 0
      );

      if (extensionCount >= 1) {
        const deadlineText = item.extension_deadline
          ? new Date(item.extension_deadline).toLocaleString(
              "th-TH",
              { dateStyle: "long" }
            )
          : "-";

        return res.send(
          htmlPage(
            "คุณได้ใช้สิทธิ์ขยายเวลาแล้ว",
            `หมายเลขจอง ${bookingNo}<br><br>สิทธิ์ Early Bird ของคุณถูกขยายไว้แล้วถึง <b>${deadlineText}</b>`
          )
        );
      }

      const now = new Date();
      const deadline = new Date(now);
      deadline.setDate(deadline.getDate() + 7);

      const { error: updateError } = await supabase
        .from("reservations")
        .update({
          rights_status: "EXTENDED",
          extension_requested_at: now.toISOString(),
          extension_deadline: deadline.toISOString(),
          extension_count: extensionCount + 1,
          rights_action_updated_at: now.toISOString(),

          // ใช้ deadline เดิมของระบบ payment ต่อได้ทันที
          early_bird_payment_deadline:
            deadline.toISOString(),

          // รักษาราคา Early Bird
          payment_price: 3500,
          payment_status: "WAIT_PAYMENT"
        })
        .eq("booking_no", bookingNo);

      if (updateError) throw updateError;

      const deadlineText = formatThaiDateTime(deadline);
      const actionTimeText = formatThaiDateTime(now);
      const displayPrice = formatPrice(
        item.payment_price ||
        item.price ||
        3500
      );

      await notifyAdmin(
        lineClient,
        `🟡 ADT PileFix | ขอรักษาสิทธิ์\n\n` +
        `ลูกค้าได้กด "ขอรักษาสิทธิ์ 7 วัน"\n\n` +
        `👤 ชื่อ : ${item.full_name || "-"}\n` +
        `📋 หมายเลขจอง : ${bookingNo}\n` +
        `📞 โทร : ${item.phone || "-"}\n` +
        `💳 ราคา : ${displayPrice} บาท\n\n` +
        `📅 สิทธิ์ใหม่ถึง : ${deadlineText}\n` +
        `🔁 ขอขยายครั้งที่ : ${extensionCount + 1}\n\n` +
        `🕒 เวลา : ${actionTimeText}`
      );

      return res.send(
        htmlPage(
          "รักษาสิทธิ์สำเร็จ ✅",
          `หมายเลขจอง <b>${bookingNo}</b><br><br>
          ระบบได้รักษาสิทธิ์ราคา <b>3,500 บาท</b> ให้คุณเพิ่มอีก 7 วันแล้ว<br><br>
          กรุณาชำระเงินภายใน <b>${deadlineText}</b><br><br>
          เมื่อพ้นกำหนด ระบบจะปรับเป็นราคาปกติตามเงื่อนไขที่กำหนด`
        )
      );
    } catch (err) {
      console.error("Extend payment rights error:", err);

      return res
        .status(500)
        .send(
          htmlPage(
            "เกิดข้อผิดพลาด",
            "ระบบไม่สามารถรักษาสิทธิ์ได้ในขณะนี้ กรุณาติดต่อทีมงาน ADT"
          )
        );
    }
  });

  /*
    GET /api/payment-rights/cancel

    แสดงหน้ายืนยันก่อนยกเลิก
    ยังไม่แก้ข้อมูลทันที เพื่อกันลูกค้ากดพลาด
  */
  router.get("/cancel", async (req, res) => {
    const bookingNo = String(
      req.query.booking_no || ""
    )
      .trim()
      .toUpperCase();

    const token = String(req.query.token || "");

    if (
      !bookingNo ||
      !verifyActionToken(bookingNo, "CANCEL", token)
    ) {
      return res
        .status(403)
        .send(
          htmlPage(
            "ลิงก์ไม่ถูกต้อง",
            "ไม่สามารถตรวจสอบสิทธิ์จากลิงก์นี้ได้ กรุณาติดต่อทีมงาน ADT"
          )
        );
    }

    const actionUrl =
      `${getPublicRightsBaseUrl()}/cancel-confirm` +
      `?booking_no=${encodeURIComponent(bookingNo)}` +
      `&token=${encodeURIComponent(token)}`;

    const paymentUrl = getPaymentPageUrl(bookingNo);

    return res.send(
      htmlPage(
        "ยืนยันการยกเลิกสิทธิ์",
        `คุณต้องการยกเลิกสิทธิ์ Early Bird ของหมายเลขจอง <b>${bookingNo}</b> ใช่หรือไม่?<br><br>
        หากยืนยัน ระบบจะยกเลิกสิทธิ์ราคาพิเศษของรายการนี้`,
        `
        <a class="btn btn-red" href="${actionUrl}">
          ยืนยันยกเลิกสิทธิ์
        </a>
        <a class="btn btn-gray" href="${paymentUrl}">
          กลับไปชำระเงิน
        </a>
        `
      )
    );
  });

  /*
    GET /api/payment-rights/cancel-confirm

    ยืนยันยกเลิกจริง
  */
  router.get("/cancel-confirm", async (req, res) => {
    try {
      const bookingNo = String(
        req.query.booking_no || ""
      )
        .trim()
        .toUpperCase();

      const token = String(req.query.token || "");

      if (
        !bookingNo ||
        !verifyActionToken(bookingNo, "CANCEL", token)
      ) {
        return res
          .status(403)
          .send(
            htmlPage(
              "ลิงก์ไม่ถูกต้อง",
              "ไม่สามารถตรวจสอบสิทธิ์จากลิงก์นี้ได้ กรุณาติดต่อทีมงาน ADT"
            )
          );
      }

      const { data: item, error } = await supabase
        .from("reservations")
        .select(`
          booking_no,
          payment_status,
          rights_status
        `)
        .eq("booking_no", bookingNo)
        .maybeSingle();

      if (error) throw error;

      if (!item) {
        return res
          .status(404)
          .send(
            htmlPage(
              "ไม่พบข้อมูลการจอง",
              `ไม่พบข้อมูลหมายเลขจอง ${bookingNo}`
            )
          );
      }

      const paymentStatus = String(
        item.payment_status || ""
      ).toUpperCase();

      if (
        ["PAYMENT_REVIEW", "APPROVED", "ACTIVE"].includes(
          paymentStatus
        )
      ) {
        return res.send(
          htmlPage(
            "ไม่สามารถยกเลิกได้",
            "รายการนี้เข้าสู่ขั้นตอนชำระเงินหรืออนุมัติแล้ว กรุณาติดต่อทีมงาน ADT"
          )
        );
      }

      if (
        String(item.rights_status || "").toUpperCase() ===
        "CANCELLED"
      ) {
        return res.send(
          htmlPage(
            "ยกเลิกสิทธิ์แล้ว",
            `หมายเลขจอง ${bookingNo} ถูกยกเลิกสิทธิ์เรียบร้อยแล้ว`
          )
        );
      }

      const now = new Date();

      const { error: updateError } = await supabase
        .from("reservations")
        .update({
          rights_status: "CANCELLED",
          rights_cancelled_at: now.toISOString(),
          rights_action_updated_at: now.toISOString(),
          payment_status: "EXPIRED"
        })
        .eq("booking_no", bookingNo);

      if (updateError) throw updateError;

      const displayPrice = formatPrice(
        item.payment_price ||
        item.price ||
        3500
      );

      await notifyAdmin(
        lineClient,
        `🔴 ADT PileFix | ยกเลิกสิทธิ์\n\n` +
        `ลูกค้าแจ้งไม่ประสงค์ใช้สิทธิ์ Early Bird\n\n` +
        `👤 ชื่อ : ${item.full_name || "-"}\n` +
        `📋 หมายเลขจอง : ${bookingNo}\n` +
        `📞 โทร : ${item.phone || "-"}\n` +
        `💳 ราคาเดิม : ${displayPrice} บาท\n\n` +
        `สถานะถูกบันทึกเรียบร้อยแล้ว\n\n` +
        `🕒 เวลา : ${formatThaiDateTime(now)}`
      );

      return res.send(
        htmlPage(
          "ยกเลิกสิทธิ์เรียบร้อยแล้ว",
          `ทีมงานได้รับการยืนยันยกเลิกสิทธิ์ของหมายเลขจอง <b>${bookingNo}</b> เรียบร้อยแล้วครับ<br><br>
          ขอบคุณที่ให้ความสนใจ ADT-PILEFiX Professional`
        )
      );
    } catch (err) {
      console.error("Cancel payment rights error:", err);

      return res
        .status(500)
        .send(
          htmlPage(
            "เกิดข้อผิดพลาด",
            "ระบบไม่สามารถยกเลิกสิทธิ์ได้ในขณะนี้ กรุณาติดต่อทีมงาน ADT"
          )
        );
    }
  });

  return router;
};
