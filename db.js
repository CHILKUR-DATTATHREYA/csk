const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const https = require('https');

const localDbPath = path.join(__dirname, 'db.json');
const EXTENDSCLASS_BIN = 'https://extendsclass.com/api/json-storage/bin/cadceef';

// In-memory state
let cachedData = null;
let dirty = false;

// ─── Cloud Sync ──────────────────────────────────────────────────────────────

/**
 * Pull the latest database from cloud into memory.
 * Always overwrites the in-memory cache.
 */
function pullLatest() {
  return new Promise((resolve, reject) => {
    const req = https.request(EXTENDSCLASS_BIN, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed && parsed.users && Array.isArray(parsed.users)) {
            // Self-heal structure
            if (!parsed.updates) parsed.updates = [];
            if (!parsed.requests) parsed.requests = [];
            if (!parsed.invoices) parsed.invoices = [];
            if (!parsed.estimates) parsed.estimates = [];
            if (!parsed.auditLogs) parsed.auditLogs = [];

            cachedData = parsed;
            dirty = false;
            resolve(parsed);
          } else {
            // Cloud returned unexpected data — fall back to local file
            console.warn('[DB] Cloud data invalid, falling back to local file');
            resolve(_loadLocal());
          }
        } catch (e) {
          console.warn('[DB] Failed to parse cloud data:', e.message, '— using local file');
          resolve(_loadLocal());
        }
      });
    });
    req.on('error', err => {
      console.warn('[DB] Cloud pull error:', err.message, '— using local file');
      resolve(_loadLocal());
    });
    req.setTimeout(8000, () => {
      req.destroy();
      console.warn('[DB] Cloud pull timeout — using local file');
      resolve(_loadLocal());
    });
    req.end();
  });
}

/**
 * Push in-memory cache to cloud.
 * IMPORTANT: always pushes cachedData (memory), never reads from disk.
 */
function pushLatest() {
  return new Promise((resolve, reject) => {
    if (!cachedData) {
      return resolve(); // Nothing to push
    }

    const payload = JSON.stringify(cachedData, null, 2);

    const req = https.request(EXTENDSCLASS_BIN, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          dirty = false;
          resolve();
        } else {
          reject(new Error(`Cloud push failed: HTTP ${res.statusCode} — ${body}`));
        }
      });
    });

    req.on('error', err => reject(err));
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('Cloud push timeout'));
    });

    req.write(payload);
    req.end();
  });
}

// ─── Local Fallback ──────────────────────────────────────────────────────────

function _loadLocal() {
  try {
    const raw = fs.readFileSync(localDbPath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.updates) data.updates = [];
    if (!data.requests) data.requests = [];
    if (!data.invoices) data.invoices = [];
    if (!data.estimates) data.estimates = [];
    if (!data.auditLogs) data.auditLogs = [];
    cachedData = data;
    return data;
  } catch (err) {
    const empty = { emailConfig: {}, users: [], requests: [], invoices: [], estimates: [], updates: [], auditLogs: [] };
    cachedData = empty;
    return empty;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get the in-memory database. Always returns the current cache.
 * The middleware ensures pullLatest() is called before every API request.
 */
function getData() {
  if (cachedData) return cachedData;
  return _loadLocal();
}

/**
 * Write data to in-memory cache and mark dirty for cloud push.
 * Also writes to local disk for local dev persistence.
 */
function saveData(data) {
  // Self-heal
  if (!data.updates) data.updates = [];
  if (!data.requests) data.requests = [];
  if (!data.invoices) data.invoices = [];
  if (!data.estimates) data.estimates = [];
  if (!data.auditLogs) data.auditLogs = [];

  cachedData = data;
  dirty = true;

  // Write to local disk (for local dev — not used on Vercel for cloud sync)
  try {
    fs.writeFileSync(localDbPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    // Non-fatal on Vercel (read-only filesystem except /tmp)
  }
}

function isDirty() {
  return dirty;
}

function getDbPath() {
  return localDbPath;
}

module.exports = {
  getData,
  saveData,
  pullLatest,
  pushLatest,
  isDirty,
  getDbPath
};
