from pathlib import Path

src = Path("/mnt/data/Pasted text(83).txt")
text = src.read_text(encoding="utf-8")

# Add Professional News route import after paymentSubmit import.
old_import = '''const paymentSubmitRoutes =
  require("./routes/paymentSubmit");

const app = express();
'''
new_import = '''const paymentSubmitRoutes =
  require("./routes/paymentSubmit");

const professionalNewsRoutes =
  require("./routes/professionalNews");

const app = express();
'''
if old_import not in text:
    raise RuntimeError("Import insertion point not found.")
text = text.replace(old_import, new_import, 1)

# Mount the Professional News API after express.json(), so req.body is available.
old_mount_point = '''app.use(express.json());

/* ===========================
   ANALYTICS DAILY REPORT API
=========================== */
'''
new_mount_point = '''app.use(express.json());

/* ===========================
   PROFESSIONAL NEWS API

   GET  /api/admin/professional/news
   POST /api/admin/professional/news
   GET  /api/admin/professional/display
=========================== */

app.use(
  "/api/admin/professional",
  professionalNewsRoutes
);

/* ===========================
   ANALYTICS DAILY REPORT API
=========================== */
'''
if old_mount_point not in text:
    raise RuntimeError("Route mount insertion point not found.")
text = text.replace(old_mount_point, new_mount_point, 1)

out = Path("/mnt/data/server.js")
out.write_text(text, encoding="utf-8")

print(f"Created: {out}")
print(f"Lines: {len(text.splitlines()):,}")
print(f"Size: {out.stat().st_size:,} bytes")
