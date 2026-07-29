"use strict";

const express = require("express");
const router = express.Router();

const {
  getProfessionalNews,
  saveProfessionalNews
} = require("../services/professionalNewsService");

// ============================================================
// GET : ADMIN
// โหลดข้อมูลกลับมาใส่ TextArea ทั้ง 7 ช่อง
// ============================================================

router.get("/news", async (req, res) => {
  try {

    const result = await getProfessionalNews();

    return res.status(200).json({
      success: true,
      message: "Professional news loaded successfully.",
      ...result
    });

  } catch (err) {

    console.error("[GET Admin Professional News]", err);

    return res.status(500).json({
      success: false,
      message: err.message
    });

  }
});

// ============================================================
// POST : ADMIN
// บันทึกข่าวจากหน้า Admin
// ============================================================

router.post("/news", async (req, res) => {

  try {

    const result = await saveProfessionalNews(req.body);

    return res.status(200).json({
      success: true,
      message: "Professional news saved successfully.",
      ...result
    });

  } catch (err) {

    console.error("[POST Admin Professional News]", err);

    return res.status(500).json({
      success: false,
      message: err.message
    });

  }

});

// ============================================================
// GET : EXCEL
// Excel Professional Login ใช้อ่าน display_text เท่านั้น
// ============================================================

router.get("/display", async (req, res) => {

  try {

    const result = await getProfessionalNews();

    return res.status(200).json({

      success: true,

      display_text: result.display_text,

      updated_at: result.updated_at

    });

  } catch (err) {

    console.error("[GET Professional Display]", err);

    return res.status(500).json({

      success: false,

      message: err.message

    });

  }

});

module.exports = router;
