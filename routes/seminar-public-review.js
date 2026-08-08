"use strict";

// =========================================================
// ADT-BOTAdmin
// File: routes/seminar-public-review.js
//
// หน้าที่:
// 1) รับ Request จาก Repo ใหม่ adt-website-api
//    เมื่อ OCR อ่านสลิปไม่ชัวร์
//
// 2) ส่ง Flex เข้า LINE Admin Group
//
// 3) ปุ่ม "ดูสลิป"
//    -> สร้าง Signed URL จาก Bucket seminar-payment-slips
//
// 4) ปุ่ม AP / RJ
//    -> ยิงกลับไป Repo ใหม่ adt-website-api
//       เพื่อให้ Repo ใหม่เป็นคน Update ตาราง 07
//
// IMPORTANT:
// - Repo นี้ "ไม่แก้สถานะ Payment เอง"
// - Repo นี้เป็น Admin Messenger / Admin Gateway
// =========================================================

const express = require("express");

module.exports = function seminarPublicReviewRoutes({
  seminarSupabase,
  adminLineClient
}) {

  if (!seminarSupabase) {
    throw new Error("seminarSupabase is required");
  }

  if (!adminLineClient) {
    throw new Error("adminLineClient is required");
  }

  const router = express.Router();


  // =======================================================
  // SETTINGS
  // =======================================================

  const TABLE_NAME =
    "07_seminar_public_registrations";

  const SLIP_BUCKET =
    "seminar-payment-slips";

  const SEMINAR_CODE =
    "ADT-PILEFIX-20260809";


  // =======================================================
  // HELPERS
  // =======================================================

  function checkIncomingSecret(
    req,
    res
  ) {

    const expected =
      String(
        process.env.BOT_ADMIN_API_SECRET ||
        ""
      );

    const incoming =
      String(
        req.get(
          "X-Admin-API-Secret"
        ) || ""
      );


    if (
      !expected ||
      incoming !== expected
    ) {

      res
        .status(403)
        .json({
          success: false,
          message:
            "FORBIDDEN"
        });

      return false;
    }


    return true;
  }


  function checkQueryKey(
    req,
    res
  ) {

    const expected =
      String(
        process.env.BOT_ADMIN_API_SECRET ||
        ""
      );

    const incoming =
      String(
        req.query?.key ||
        ""
      );


    if (
      !expected ||
      incoming !== expected
    ) {

      res
        .status(403)
        .send(
          "FORBIDDEN"
        );

      return false;
    }


    return true;
  }


  function getBotAdminBaseUrl() {

    return String(
      process.env.BOT_ADMIN_PUBLIC_URL ||
      "https://adt-botadmin.onrender.com"
    )
      .replace(
        /\/+$/,
        ""
      );
  }


  function getWebsiteApiBaseUrl() {

    return String(
      process.env.ADT_WEBSITE_API_URL ||
      ""
    )
      .replace(
        /\/+$/,
        ""
      );
  }


  function buildViewSlipUrl(
    registrationId
  ) {

    const base =
      getBotAdminBaseUrl();

    const key =
      encodeURIComponent(
        process.env.BOT_ADMIN_API_SECRET ||
        ""
      );


    return (
      `${base}` +
      `/api/seminar/public/view-slip` +
      `?registration_id=${encodeURIComponent(
        registrationId
      )}` +
      `&key=${key}`
    );
  }


  function buildActionUrl(
    action,
    registrationId
  ) {

    const base =
      getWebsiteApiBaseUrl();

    const key =
      encodeURIComponent(
        process.env.SEMINAR_ADMIN_ACTION_SECRET ||
        ""
      );


    return (
      `${base}` +
      `/api/seminar/public/admin/payment-action` +
      `?registration_id=${encodeURIComponent(
        registrationId
      )}` +
      `&action=${encodeURIComponent(
        action
      )}` +
      `&key=${key}`
    );
  }


  // =======================================================
  // FLEX
  // =======================================================

  function buildAdminFlex({
    registrationId,
    fullName,
    phone,
    amount
  }) {

    return {

      type:
        "flex",

      altText:
        `มีสลิปสัมมนารอตรวจสอบ: ${fullName || registrationId}`,

      contents: {

        type:
          "bubble",

        size:
          "mega",

        header: {

          type:
            "box",

          layout:
            "vertical",

          backgroundColor:
            "#06152D",

          paddingAll:
            "20px",

          contents: [
            {
              type:
                "text",

              text:
                "ADT SEMINAR",

              color:
                "#FFC928",

              size:
                "xs",

              weight:
                "bold"
            },
            {
              type:
                "text",

              text:
                "ตรวจสอบสลิปการชำระเงิน",

              color:
                "#FFFFFF",

              size:
                "xl",

              weight:
                "bold",

              margin:
                "sm"
            }
          ]
        },


        body: {

          type:
            "box",

          layout:
            "vertical",

          spacing:
            "md",

          paddingAll:
            "20px",

          contents: [
            {
              type:
                "text",

              text:
                "⚠️ OCR อ่านข้อมูลไม่ชัดเจน",

              weight:
                "bold",

              color:
                "#D97706",

              wrap:
                true
            },

            {
              type:
                "separator",

              margin:
                "md"
            },

            {
              type:
                "box",

              layout:
                "vertical",

              spacing:
                "sm",

              margin:
                "md",

              contents: [

                {
                  type:
                    "text",

                  text:
                    `ชื่อ: ${fullName || "-"}`,

                  wrap:
                    true,

                  weight:
                    "bold",

                  color:
                    "#06152D"
                },

                {
                  type:
                    "text",

                  text:
                    `เบอร์โทร: ${phone || "-"}`,

                  wrap:
                    true,

                  color:
                    "#475569"
                },

                {
                  type:
                    "text",

                  text:
                    `ยอดสัมมนา: ${Number(
                      amount || 399
                    ).toLocaleString(
                      "th-TH"
                    )} บาท`,

                  wrap:
                    true,

                  color:
                    "#475569"
                },

                {
                  type:
                    "text",

                  text:
                    `Registration ID: ${registrationId}`,

                  wrap:
                    true,

                  size:
                    "xs",

                  color:
                    "#94A3B8"
                },

                {
                  type:
                    "text",

                  text:
                    "สถานะ: รอ Admin ตรวจสลิป",

                  color:
                    "#D97706",

                  weight:
                    "bold",

                  margin:
                    "sm"
                }
              ]
            }
          ]
        },


        footer: {

          type:
            "box",

          layout:
            "vertical",

          spacing:
            "sm",

          paddingAll:
            "20px",

          contents: [

            {
              type:
                "button",

              style:
                "secondary",

              action: {

                type:
                  "uri",

                label:
                  "👁 ดูสลิป",

                uri:
                  buildViewSlipUrl(
                    registrationId
                  )
              }
            },


            {
              type:
                "box",

              layout:
                "horizontal",

              spacing:
                "sm",

              contents: [

                {
                  type:
                    "button",

                  style:
                    "primary",

                  color:
                    "#16A34A",

                  action: {

                    type:
                      "uri",

                    label:
                      "✅ AP",

                    uri:
                      buildActionUrl(
                        "AP",
                        registrationId
                      )
                  }
                },


                {
                  type:
                    "button",

                  style:
                    "primary",

                  color:
                    "#DC2626",

                  action: {

                    type:
                      "uri",

                    label:
                      "❌ RJ",

                    uri:
                      buildActionUrl(
                        "RJ",
                        registrationId
                      )
                  }
                }
              ]
            }
          ]
        }
      }
    };
  }


  // =======================================================
  // POST /review
  //
  // รับ Request จาก Repo ใหม่
  //
  // POST:
  // /api/seminar/public/review
  //
  // Headers:
  // X-Admin-API-Secret: ...
  //
  // Body:
  // {
  //   registration_id,
  //   seminar_code,
  //   full_name,
  //   phone,
  //   amount,
  //   slip_bucket,
  //   slip_path
  // }
  // =======================================================

  router.post(
    "/review",
    express.json({
      limit:
        "100kb"
    }),
    async (
      req,
      res
    ) => {

      try {

        if (
          !checkIncomingSecret(
            req,
            res
          )
        ) {
          return;
        }


        const registrationId =
          String(
            req.body?.registration_id ||
            ""
          ).trim();

        const seminarCode =
          String(
            req.body?.seminar_code ||
            ""
          ).trim();

        const fullName =
          String(
            req.body?.full_name ||
            ""
          ).trim();

        const phone =
          String(
            req.body?.phone ||
            ""
          ).trim();

        const amount =
          Number(
            req.body?.amount ||
            399
          );


        if (!registrationId) {

          return res
            .status(400)
            .json({
              success:
                false,

              message:
                "MISSING_REGISTRATION_ID"
            });
        }


        if (
          seminarCode &&
          seminarCode !==
            SEMINAR_CODE
        ) {

          return res
            .status(400)
            .json({
              success:
                false,

              message:
                "INVALID_SEMINAR_CODE"
            });
        }


        /*
          ไม่เชื่อ slip_path จาก Request อย่างเดียว
          Lookup จาก Database อีกรอบ
        */
        const {
          data:
            registration,

          error:
            findError
        } =
          await seminarSupabase
            .from(
              TABLE_NAME
            )
            .select(`
              id,
              seminar_code,
              first_name,
              last_name,
              phone,
              payment_amount,
              payment_status,
              slip_path,
              registration_status
            `)
            .eq(
              "id",
              registrationId
            )
            .eq(
              "seminar_code",
              SEMINAR_CODE
            )
            .maybeSingle();


        if (findError) {

          console.error(
            "[SEMINAR ADMIN] Lookup error:",
            findError
          );

          return res
            .status(500)
            .json({
              success:
                false,

              message:
                "DATABASE_LOOKUP_FAILED"
            });
        }


        if (!registration) {

          return res
            .status(404)
            .json({
              success:
                false,

              message:
                "REGISTRATION_NOT_FOUND"
            });
        }


        if (
          !registration.slip_path
        ) {

          return res
            .status(400)
            .json({
              success:
                false,

              message:
                "SLIP_NOT_FOUND"
            });
        }


        /*
          ข้อมูลหลักใช้จาก DB
          Request ใช้เป็น fallback เท่านั้น
        */
        const displayFullName =
          (
            `${registration.first_name || ""} ` +
            `${registration.last_name || ""}`
          )
            .trim() ||
          fullName ||
          "-";


        const displayPhone =
          registration.phone ||
          phone ||
          "-";


        const displayAmount =
          Number(
            registration.payment_amount ||
            amount ||
            399
          );


        const flex =
          buildAdminFlex({

            registrationId:
              registration.id,

            fullName:
              displayFullName,

            phone:
              displayPhone,

            amount:
              displayAmount
          });


        const adminGroupId =
          String(
            process.env.LINE_ADMIN_GROUP_ID ||
            ""
          ).trim();


        if (!adminGroupId) {

          console.error(
            "[SEMINAR ADMIN] LINE_ADMIN_GROUP_ID missing"
          );

          return res
            .status(500)
            .json({
              success:
                false,

              message:
                "LINE_ADMIN_GROUP_ID_MISSING"
            });
        }


        await adminLineClient
          .pushMessage(
            adminGroupId,
            flex
          );


        return res
          .status(200)
          .json({
            success:
              true,

            message:
              "ADMIN_FLEX_SENT",

            registration_id:
              registration.id
          });

      }
      catch (error) {

        console.error(
          "[SEMINAR ADMIN] Review error:",
          error?.originalError
            ?.response
            ?.data ||
          error
        );


        return res
          .status(500)
          .json({
            success:
              false,

            message:
              "SERVER_ERROR"
          });
      }
    }
  );


  // =======================================================
  // GET /view-slip
  //
  // Admin กดปุ่มดูสลิป
  // -> Lookup slip_path
  // -> Signed URL 5 นาที
  // -> Redirect
  // =======================================================

  router.get(
    "/view-slip",
    async (
      req,
      res
    ) => {

      try {

        if (
          !checkQueryKey(
            req,
            res
          )
        ) {
          return;
        }


        const registrationId =
          String(
            req.query?.registration_id ||
            ""
          ).trim();


        if (!registrationId) {

          return res
            .status(400)
            .send(
              "MISSING_REGISTRATION_ID"
            );
        }


        const {
          data:
            registration,

          error:
            findError
        } =
          await seminarSupabase
            .from(
              TABLE_NAME
            )
            .select(`
              id,
              slip_path
            `)
            .eq(
              "id",
              registrationId
            )
            .eq(
              "seminar_code",
              SEMINAR_CODE
            )
            .maybeSingle();


        if (
          findError ||
          !registration
        ) {

          console.error(
            "[SEMINAR ADMIN] View slip lookup error:",
            findError
          );

          return res
            .status(404)
            .send(
              "ไม่พบรายการ"
            );
        }


        if (
          !registration.slip_path
        ) {

          return res
            .status(404)
            .send(
              "ไม่พบสลิป"
            );
        }


        const {
          data:
            signed,

          error:
            signedError
        } =
          await seminarSupabase
            .storage
            .from(
              SLIP_BUCKET
            )
            .createSignedUrl(
              registration.slip_path,
              60 * 5
            );


        if (
          signedError ||
          !signed?.signedUrl
        ) {

          console.error(
            "[SEMINAR ADMIN] Signed URL error:",
            signedError
          );

          return res
            .status(500)
            .send(
              "สร้างลิงก์ดูสลิปไม่สำเร็จ"
            );
        }


        return res.redirect(
          302,
          signed.signedUrl
        );

      }
      catch (error) {

        console.error(
          "[SEMINAR ADMIN] View slip error:",
          error
        );


        return res
          .status(500)
          .send(
            "SERVER ERROR"
          );
      }
    }
  );


  // =======================================================
  // HEALTH
  // =======================================================

  router.get(
    "/health",
    async (
      req,
      res
    ) => {

      try {

        const {
          error
        } =
          await seminarSupabase
            .from(
              TABLE_NAME
            )
            .select(
              "id"
            )
            .limit(1);


        if (error) {
          throw error;
        }


        return res
          .status(200)
          .json({
            success:
              true,

            service:
              "ADT Seminar Public Admin Review",

            status:
              "RUNNING"
          });

      }
      catch (error) {

        console.error(
          "[SEMINAR ADMIN] Health error:",
          error
        );


        return res
          .status(500)
          .json({
            success:
              false,

            status:
              "ERROR"
          });
      }
    }
  );


  return router;
};
