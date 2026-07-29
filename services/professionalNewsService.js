"use strict";

const { createClient } = require("@supabase/supabase-js");

// ============================================================
// SUPABASE CONFIG
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

// ชื่อตารางที่จะสร้างใน Supabase ภายหลัง
const TABLE_NAME = "professional_news_board";

// ระบบนี้มีกระดานข่าวหลักเพียงชุดเดียว
const BOARD_KEY = "professional_main";

if (!SUPABASE_URL) {
  throw new Error(
    "Missing environment variable: SUPABASE_URL"
  );
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing environment variable: SUPABASE_SERVICE_ROLE_KEY"
  );
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

// ============================================================
// NEWS CATEGORY CONFIG
// ลำดับตรงนี้คือลำดับที่จะแสดงใน TextBox3
// ============================================================

const NEWS_CATEGORIES = [
  {
    field: "announcement",
    title: "ประกาศสำคัญ"
  },
  {
    field: "program_update",
    title: "อัปเดตโปรแกรม"
  },
  {
    field: "usage_guide",
    title: "คำแนะนำการใช้งาน"
  },
  {
    field: "known_issue",
    title: "ปัญหาที่กำลังตรวจสอบ"
  },
  {
    field: "article",
    title: "บทความใหม่"
  },
  {
    field: "event",
    title: "กิจกรรมและอบรม"
  },
  {
    field: "support",
    title: "บริการและการสนับสนุน"
  }
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function sanitizeNewsData(input = {}) {
  return {
    announcement: normalizeText(input.announcement),

    // รองรับทั้งชื่อใหม่และชื่อเดิมจาก HTML
    program_update: normalizeText(
      input.program_update ?? input.update
    ),

    usage_guide: normalizeText(
      input.usage_guide ?? input.guide
    ),

    known_issue: normalizeText(
      input.known_issue ?? input.issue
    ),

    article: normalizeText(input.article),
    event: normalizeText(input.event),
    support: normalizeText(input.support)
  };
}

/**
 * Pack ข่าวทั้ง 7 หัวข้อให้เป็นข้อความก้อนเดียว
 * ช่องใดไม่มีข้อความจะไม่ถูกนำไปแสดง
 */
function buildDisplayText(input = {}) {
  const newsData = sanitizeNewsData(input);
  const sections = [];

  for (const category of NEWS_CATEGORIES) {
    const content = newsData[category.field];

    if (!content) {
      continue;
    }

    sections.push(
      [
        category.title,
        "------------------------------",
        content
      ].join("\n")
    );
  }

  if (sections.length === 0) {
    return "ขณะนี้ยังไม่มีประกาศใหม่";
  }

  return sections.join("\n\n");
}

function createEmptyNewsData() {
  return {
    announcement: "",
    program_update: "",
    usage_guide: "",
    known_issue: "",
    article: "",
    event: "",
    support: ""
  };
}

// ============================================================
// GET PROFESSIONAL NEWS
// ใช้ได้ทั้งหน้า Admin และ Route ที่ Excel เรียก
// ============================================================

async function getProfessionalNews() {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select(
      `
        board_key,
        announcement,
        program_update,
        usage_guide,
        known_issue,
        article,
        event,
        support,
        display_text,
        created_at,
        updated_at
      `
    )
    .eq("board_key", BOARD_KEY)
    .maybeSingle();

  if (error) {
    console.error(
      "[ProfessionalNewsService] getProfessionalNews error:",
      error
    );

    throw new Error(
      "Unable to load Professional news."
    );
  }

  // กรณียังไม่เคยมีข้อมูลในฐานข้อมูล
  if (!data) {
    const emptyData = createEmptyNewsData();

    return {
      board_key: BOARD_KEY,
      data: emptyData,
      display_text: buildDisplayText(emptyData),
      created_at: null,
      updated_at: null
    };
  }

  const newsData = sanitizeNewsData(data);

  return {
    board_key: data.board_key,
    data: newsData,

    // ถ้าใน DB ไม่มี display_text ให้ประกอบใหม่สำรอง
    display_text:
      normalizeText(data.display_text) ||
      buildDisplayText(newsData),

    created_at: data.created_at || null,
    updated_at: data.updated_at || null
  };
}

// ============================================================
// SAVE / UPDATE PROFESSIONAL NEWS
// บันทึกทับกระดานข่าวหลักชุดเดิม
// ============================================================

async function saveProfessionalNews(input = {}) {
  const newsData = sanitizeNewsData(input);
  const displayText = buildDisplayText(newsData);
  const now = new Date().toISOString();

  const payload = {
    board_key: BOARD_KEY,

    announcement: newsData.announcement,
    program_update: newsData.program_update,
    usage_guide: newsData.usage_guide,
    known_issue: newsData.known_issue,
    article: newsData.article,
    event: newsData.event,
    support: newsData.support,

    display_text: displayText,
    updated_at: now
  };

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .upsert(payload, {
      onConflict: "board_key"
    })
    .select(
      `
        board_key,
        announcement,
        program_update,
        usage_guide,
        known_issue,
        article,
        event,
        support,
        display_text,
        created_at,
        updated_at
      `
    )
    .single();

  if (error) {
    console.error(
      "[ProfessionalNewsService] saveProfessionalNews error:",
      error
    );

    throw new Error(
      "Unable to save Professional news."
    );
  }

  return {
    board_key: data.board_key,

    data: sanitizeNewsData(data),

    display_text:
      normalizeText(data.display_text) ||
      displayText,

    created_at: data.created_at || null,
    updated_at: data.updated_at || now
  };
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  NEWS_CATEGORIES,
  buildDisplayText,
  getProfessionalNews,
  saveProfessionalNews
};
