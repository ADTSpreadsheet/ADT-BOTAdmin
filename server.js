<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>ADT PileFix | Payment Message Control</title>

<style>
body{margin:0;background:#eef3fa;font-family:Tahoma,sans-serif;color:#222}
.container{max-width:1200px;margin:30px auto;padding:20px}
.card{background:#fff;border-radius:14px;padding:24px;margin-bottom:20px;box-shadow:0 8px 25px rgba(0,0,0,.08)}
h1,h2{color:#0b3b86}
.btn{border:none;border-radius:8px;padding:12px 20px;font-weight:bold;cursor:pointer;background:#0b4ea2;color:#fff}
.btn:hover{background:#083d80}
.btn-green{background:#16a34a}
.status-box{padding:12px 16px;border-radius:8px;margin-top:15px;display:none}
.status-success{display:block;background:#dcfce7;color:#166534;border:1px solid #86efac}
.status-error{display:block;background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}
.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:15px}
.summary-item{background:#f2f7ff;border:1px solid #c8dfff;border-radius:10px;padding:18px;text-align:center}
.summary-number{font-size:30px;font-weight:bold;color:#d32f2f}
select,textarea{width:100%;padding:12px;border-radius:8px;border:1px solid #ccc;font-family:Tahoma,sans-serif;box-sizing:border-box}
textarea{min-height:160px;resize:vertical;line-height:1.7}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{padding:10px;border-bottom:1px solid #e5e7eb;text-align:left}
th{background:#f8fafc;color:#0b3b86}
.badge{display:inline-block;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:bold}
.badge-not-sent{background:#e0f2fe;color:#075985}
.badge-wait{background:#fef3c7;color:#92400e}
.badge-expired{background:#fee2e2;color:#991b1b}
.action-row{display:flex;justify-content:space-between;align-items:center;gap:15px;flex-wrap:wrap}
.small{color:#666;font-size:13px}
@media(max-width:768px){.summary{grid-template-columns:1fr}table{font-size:12px}}
</style>
</head>

<body>

<div class="container">

<div class="card">
<h1>ADT PileFix | Payment Message Control</h1>
<div class="small">หน้าเว็บสำหรับยิงข้อความชำระเงินให้ผู้จองสิทธิ์</div>
<br>
<button class="btn" onclick="loadReservations()">🔄 ดึงข้อมูลอัปเดต</button>
<p class="small">อัปเดตล่าสุด: <span id="lastUpdate">ยังไม่เคยกดอัปเดต</span></p>
<div id="loadStatus" class="status-box"></div>
</div>

<div class="card">
<h2>สรุปสถานะ</h2>
<div class="summary">
<div class="summary-item">
<div>ยังไม่ส่งข้อความ</div>
<div class="summary-number" id="countNotSent">0</div>
</div>
<div class="summary-item">
<div>ส่งแล้ว / ยังไม่สำเร็จ</div>
<div class="summary-number" id="countWait">0</div>
</div>
<div class="summary-item">
<div>ส่งแล้ว / เกิน 7 วัน</div>
<div class="summary-number" id="countExpired">0</div>
</div>
</div>
</div>

<div class="card">
<h2>รายชื่อผู้จอง</h2>

<label>แสดงกลุ่มรายการ</label>
<select id="filterStatus" onchange="renderTable()">
<option value="ALL">ทั้งหมด</option>
<option value="NOT_SENT">ยังไม่ส่งข้อความ</option>
<option value="WAIT_PAYMENT">ส่งแล้ว / ยังไม่สำเร็จ</option>
<option value="EXPIRED">ส่งแล้ว / เกิน 7 วัน</option>
</select>

<br><br>
<button class="btn" onclick="selectAllVisible()">เลือกทั้งหมดที่แสดง</button>
<button class="btn" onclick="clearSelection()">ล้างการเลือก</button>

<br><br>

<table>
<thead>
<tr>
<th>เลือก</th>
<th>PF No.</th>
<th>ชื่อ</th>
<th>โทร</th>
<th>ราคา</th>
<th>สถานะส่ง</th>
<th>เวลาคงเหลือ</th>
</tr>
</thead>
<tbody id="reservationTable">
<tr><td colspan="7">กด “ดึงข้อมูลอัปเดต” ก่อนครับ</td></tr>
</tbody>
</table>
</div>

<div class="card">
<h2>ข้อความที่จะส่งให้ลูกค้า</h2>
<textarea id="messageText">🎉 สิทธิ์ ADT PileFix ของคุณพร้อมใช้งานแล้ว

กรุณากดลิงก์ด้านล่างเพื่อดูรายละเอียดการชำระเงิน และแนบสลิปการโอน

สิทธิ์ราคา Early Bird จะมีอายุ 7 วัน นับจากวันที่ได้รับข้อความนี้

ขอบคุณครับ
ทีมงาน ADT</textarea>
</div>

<div class="card">
<div class="action-row">
<div><b>เลือกแล้ว:</b> <span id="selectedCount">0</span> รายการ</div>
<button class="btn btn-green" onclick="sendMessage()">🚀 ยิงข้อความผ่าน LINE BOT</button>
</div>
<div id="sendStatus" class="status-box"></div>
</div>

</div>

<script>
const API_BASE = "https://adt-botadmin.onrender.com";
const ADMIN_KEY = new URLSearchParams(window.location.search).get("key") || "";

let reservations = [];
let summary = {};
let selectedBookingNos = new Set();

function showStatus(id, message, type){
    const box = document.getElementById(id);
    box.className = "status-box " + (type === "success" ? "status-success" : "status-error");
    box.innerText = message;
}

function updateSelectedCount(){
    document.getElementById("selectedCount").innerText = selectedBookingNos.size;
}

function getGroupStatus(item){
    if (!item.payment_invite_sent) return "NOT_SENT";

    if (item.payment_invite_sent && item.days_left !== null && item.days_left < 0) {
        return "EXPIRED";
    }

    return "WAIT_PAYMENT";
}

function getBadge(status){
    if (status === "NOT_SENT") {
        return `<span class="badge badge-not-sent">ยังไม่ส่ง</span>`;
    }

    if (status === "WAIT_PAYMENT") {
        return `<span class="badge badge-wait">ส่งแล้ว / รอทำรายการ</span>`;
    }

    if (status === "EXPIRED") {
        return `<span class="badge badge-expired">เกิน 7 วัน</span>`;
    }

    return "-";
}

function getDaysLeftText(item){
    if (!item.payment_invite_sent) return "-";
    if (item.days_left === null || item.days_left === undefined) return "-";
    if (item.days_left < 0) return "หมดสิทธิ์แล้ว";
    return `เหลือ ${item.days_left} วัน`;
}

async function loadReservations(){
    try{
        if (!ADMIN_KEY) {
            showStatus("loadStatus", "ไม่พบ key ใน URL เช่น admin-sendpay.html?key=xxxx", "error");
            return;
        }

        showStatus("loadStatus", "กำลังดึงข้อมูล...", "success");

        const res = await fetch(`${API_BASE}/api/payment-invite/list?key=${encodeURIComponent(ADMIN_KEY)}`);
        const data = await res.json();

        if (!data.success) {
            throw new Error(data.message || "โหลดข้อมูลไม่สำเร็จ");
        }

        summary = data.summary || {};
        reservations = data.items || [];
        selectedBookingNos.clear();

        document.getElementById("lastUpdate").innerText = new Date().toLocaleString("th-TH");

        renderSummary();
        renderTable();
        updateSelectedCount();

        showStatus("loadStatus", "ดึงข้อมูลสำเร็จ", "success");
    }catch(err){
        showStatus("loadStatus", err.message, "error");
    }
}

function renderSummary(){
    document.getElementById("countNotSent").innerText = summary.not_sent || 0;
    document.getElementById("countWait").innerText = summary.sent_waiting || 0;
    document.getElementById("countExpired").innerText = summary.expired_7_days || 0;
}

function renderTable(){
    const tbody = document.getElementById("reservationTable");
    const filter = document.getElementById("filterStatus").value;

    const filtered = reservations.filter(item => {
        const status = getGroupStatus(item);
        return filter === "ALL" || status === filter;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7">ไม่มีข้อมูลในกลุ่มนี้</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(item => {
        const status = getGroupStatus(item);
        const checked = selectedBookingNos.has(item.booking_no) ? "checked" : "";

        return `
            <tr>
                <td>
                    <input type="checkbox" ${checked}
                        onchange="toggleSelect('${item.booking_no}', this.checked)">
                </td>
                <td>${item.booking_no || "-"}</td>
                <td>${item.full_name || "-"}</td>
                <td>${item.phone || "-"}</td>
                <td>${Number(item.payment_price || item.price || 0).toLocaleString()} บาท</td>
                <td>${getBadge(status)}</td>
                <td>${getDaysLeftText(item)}</td>
            </tr>
        `;
    }).join("");
}

function toggleSelect(bookingNo, checked){
    if (checked) {
        selectedBookingNos.add(bookingNo);
    } else {
        selectedBookingNos.delete(bookingNo);
    }

    updateSelectedCount();
}

function selectAllVisible(){
    const filter = document.getElementById("filterStatus").value;

    reservations.forEach(item => {
        const status = getGroupStatus(item);

        if (filter === "ALL" || status === filter) {
            selectedBookingNos.add(item.booking_no);
        }
    });

    renderTable();
    updateSelectedCount();
}

function clearSelection(){
    selectedBookingNos.clear();
    renderTable();
    updateSelectedCount();
}

async function sendMessage(){
    try{
        if (!ADMIN_KEY) {
            showStatus("sendStatus", "ไม่พบ key ใน URL", "error");
            return;
        }

        const bookingNos = Array.from(selectedBookingNos);
        const message = document.getElementById("messageText").value.trim();

        if (bookingNos.length === 0) {
            showStatus("sendStatus", "กรุณาเลือกรายชื่อก่อนส่งข้อความ", "error");
            return;
        }

        if (!message) {
            showStatus("sendStatus", "กรุณาพิมพ์ข้อความก่อนส่ง", "error");
            return;
        }

        if (!confirm(`ยืนยันส่งข้อความให้ ${bookingNos.length} รายการ?`)) {
            return;
        }

        showStatus("sendStatus", "กำลังส่งข้อความ...", "success");

        const res = await fetch(`${API_BASE}/api/payment-invite/send`, {
            method:"POST",
            headers:{
                "Content-Type":"application/json"
            },
            body:JSON.stringify({
                key: ADMIN_KEY,
                booking_nos: bookingNos,
                message
            })
        });

        const data = await res.json();

        if (!data.success) {
            throw new Error(data.message || "ส่งข้อความไม่สำเร็จ");
        }

        showStatus(
            "sendStatus",
            `ส่งข้อความสำเร็จ ${data.sent_count || bookingNos.length} รายการ`,
            "success"
        );

        await loadReservations();

    }catch(err){
        showStatus("sendStatus", err.message, "error");
    }
}
</script>

</body>
</html>
