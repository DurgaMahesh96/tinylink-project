import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { Pool } from "pg";
import validUrl from "valid-url";


dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
connectionString: process.env.DATABASE_URL,
ssl: process.env.DB_SSL === "true",
});

const CODE_REGEX = /^[A-Za-z0-9]{6,8}$/;

// Health check
app.get("/healthz", (req, res) => {
res.json({ ok: true, version: "1.0" });
});

// Create short link
app.post("/api/links", async (req, res) => {
const { target, code } = req.body;

if (!target || !validUrl.isWebUri(target)) {
return res.status(400).json({ error: "Invalid URL" });
}

let finalCode = code;

if (finalCode) {
if (!CODE_REGEX.test(finalCode)) {
return res.status(400).json({ error: "Invalid code format" });
}
} else {
const gen = () => Math.random().toString(36).substring(2, 8);
for (let i = 0; i < 5; i++) {
finalCode = gen();
const exists = await pool.query(
"SELECT 1 FROM links WHERE code=$1 AND deleted=false",
[finalCode]
);
if (exists.rowCount === 0) break;
finalCode = null;
}
}

try {
const r = await pool.query(
"INSERT INTO links(code, target) VALUES($1, $2) RETURNING *",
[finalCode, target]
);
return res.status(201).json(r.rows[0]);
} catch (err) {
if (err.code === "23505") return res.status(409).json({ error: "Code exists" });
console.log(err);
return res.status(500).json({ error: "Server error" });
}
});

// List all links
app.get("/api/links", async (req, res) => {
const r = await pool.query(
"SELECT code, target, clicks, last_clicked, created_at FROM links WHERE deleted=false"
);
res.json(r.rows);
});

// Single link stats
app.get("/api/links/:code", async (req, res) => {
const code = req.params.code;
const r = await pool.query(
"SELECT code, target, clicks, last_clicked, created_at FROM links WHERE code=$1 AND deleted=false",
[code]
);
if (r.rowCount === 0) return res.status(404).json({ error: "Not found" });
res.json(r.rows[0]);
});

// Delete link
app.delete("/api/links/:code", async (req, res) => {
const code = req.params.code;
const r = await pool.query(
"UPDATE links SET deleted=true WHERE code=$1 AND deleted=false RETURNING code",
[code]
);
if (r.rowCount === 0) return res.status(404).json({ error: "Not found" });
res.json({ ok: true });
});

// Redirect
app.get("/:code", async (req, res) => {
const code = req.params.code;

if (!CODE_REGEX.test(code)) return res.status(404).send("Not found");

const client = await pool.connect();
try {
await client.query("BEGIN");

```
const r = await client.query(
  "SELECT target FROM links WHERE code=$1 AND deleted=false FOR UPDATE",
  [code]
);

if (r.rowCount === 0) {
  await client.query("ROLLBACK");
  return res.status(404).send("Not found");
}

const target = r.rows[0].target;

await client.query(
  "UPDATE links SET clicks = clicks + 1, last_clicked = NOW() WHERE code=$1",
  [code]
);

await client.query("COMMIT");
res.redirect(302, target);
```

} catch (e) {
await client.query("ROLLBACK");
res.status(500).send("Server error");
} finally {
client.release();
}
});

app.listen(process.env.PORT, () =>
console.log("Server running on port", process.env.PORT)
);
