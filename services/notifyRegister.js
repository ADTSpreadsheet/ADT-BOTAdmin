function buildRegisterReport(user) {
  const queueNo = Number(user.queue_no || user.queueNo || 0)
  const name = user.full_name || user.name || "-"
  const phone = user.phone || "-"
  const province = user.province || "-"
  const price = queueNo <= 150 ? 3500 : 4999

  if (queueNo <= 150) {
    return {
      type: "text",
      text:
`📥 ADT PileFix | มีผู้จองสิทธิ์ใหม่

✅ ลำดับจอง: #${queueNo}
👤 ชื่อ: ${name}
📞 โทร: ${phone}
📍 จังหวัด: ${province}

🎉 สถานะสิทธิ์:
EARLY BIRD 150 ท่านแรก

💰 ราคาเสนอพิเศษ: ${price.toLocaleString()} บาท
จากราคาเต็ม 4,999 บาท

📌 สถานะระบบ: REGISTERED
⏳ รอทีม Admin ตรวจสอบ/อนุมัติ`
    }
  }

  return {
    type: "text",
    text:
`📥 ADT PileFix | มีผู้จองสิทธิ์ใหม่

⚠️ ลำดับจอง: #${queueNo}
👤 ชื่อ: ${name}
📞 โทร: ${phone}
📍 จังหวัด: ${province}

🚫 สิทธิ์ Early Bird ครบ 150 ท่านแล้ว

💰 ราคาปกติ: ${price.toLocaleString()} บาท

📌 สถานะระบบ: REGISTERED
⏳ รอทีม Admin ตรวจสอบ/อนุมัติ

หมายเหตุ:
ผู้สมัครรายนี้อยู่ลำดับที่ ${queueNo}
จึงไม่เข้าเงื่อนไขราคา Early Bird`
  }
}

module.exports = {
  buildRegisterReport
}
