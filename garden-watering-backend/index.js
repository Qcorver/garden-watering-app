import http from "http";
import dns from "dns";
import pg from "pg";

// Force Node.js to prefer IPv4 over IPv6 (fixes Render ↔ Supabase ENETUNREACH)
dns.setDefaultResultOrder("ipv4first");

const { Pool } = pg;

// Read the database URL from Render environment variables
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;

// Create a DB connection pool (only if we have the URL)
const pool = SUPABASE_DB_URL ? new Pool({ connectionString: SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } }) : null;

const server = http.createServer(async (req, res) => {
  // Health check (unchanged)
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // NEW: test Supabase connection by counting users
  if (req.url === "/db-test") {
    try {
      if (!pool) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "SUPABASE_DB_URL is missing on the server" }));
        return;
      }

      const result = await pool.query("select count(*)::int as count from app_users");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, app_users: result.rows[0].count }));
      return;
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message }));
      return;
    }
  }

  res.writeHead(404);
  res.end("Not found");
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});