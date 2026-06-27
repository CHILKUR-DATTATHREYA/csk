/**
 * db.js — Cloud-backed in-memory database
 *
 * Single source of truth: ExtendsClass JSON bin (cadceef)
 * On every API request:  pull() → modify in memory → push() before responding
 * No disk reads/writes on Vercel (read-only filesystem).
 */

'use strict';

const https = require('https');

const BIN_URL = 'https://extendsclass.com/api/json-storage/bin/cadceef';
const TIMEOUT_MS = 9000;

// In-memory state (per serverless invocation)
let mem = null;   // current database object
let dirty = false; // true when mem has unsaved changes

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function httpsRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(TIMEOUT_MS, () => { req.destroy(); reject(new Error('HTTP timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

// ─── Self-heal: ensure all required keys exist ────────────────────────────────

function ensureStructure(data) {
  if (!data || typeof data !== 'object') return null;
  if (!Array.isArray(data.users)) return null;  // invalid
  if (!data.emailConfig) data.emailConfig = {};
  if (!Array.isArray(data.requests))  data.requests  = [];
  if (!Array.isArray(data.invoices))  data.invoices  = [];
  if (!Array.isArray(data.estimates)) data.estimates = [];
  if (!Array.isArray(data.updates))   data.updates   = [];
  if (!Array.isArray(data.auditLogs)) data.auditLogs = [];
  return data;
}

// ─── Cloud operations ─────────────────────────────────────────────────────────

/**
 * Pull latest data from cloud into memory.
 * Always fetches fresh — never uses local disk on Vercel.
 */
async function pullLatest() {
  const result = await httpsRequest(BIN_URL, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  let parsed;
  try {
    parsed = JSON.parse(result.body);
  } catch (e) {
    throw new Error(`Cloud returned invalid JSON (status ${result.status}): ${result.body.substring(0, 100)}`);
  }

  const valid = ensureStructure(parsed);
  if (!valid) throw new Error('Cloud data missing required "users" array');

  mem = valid;
  dirty = false;
  return mem;
}

/**
 * Push current in-memory state to cloud.
 * Awaited by res.json middleware BEFORE the HTTP response is sent.
 */
async function pushLatest() {
  if (!mem) throw new Error('Nothing to push — mem is null');

  const payload = JSON.stringify(mem);
  const result = await httpsRequest(BIN_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload);

  if (result.status !== 200) {
    throw new Error(`Cloud push failed: HTTP ${result.status} — ${result.body.substring(0, 200)}`);
  }

  dirty = false;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return the current in-memory database.
 * Middleware guarantees pullLatest() is called before every API route.
 */
function getData() {
  if (!mem) {
    // Fallback: load from local db.json (local dev only)
    try {
      const fs = require('fs');
      const path = require('path');
      const raw = fs.readFileSync(path.join(__dirname, 'db.json'), 'utf8');
      mem = ensureStructure(JSON.parse(raw)) || { emailConfig: {}, users: [], requests: [], invoices: [], estimates: [], updates: [], auditLogs: [] };
    } catch {
      mem = { emailConfig: {}, users: [], requests: [], invoices: [], estimates: [], updates: [], auditLogs: [] };
    }
  }
  return mem;
}

/**
 * Write data to in-memory state and mark as dirty (needs cloud push).
 * Also persists to local disk for local development.
 */
function saveData(data) {
  mem = ensureStructure(data) || data;
  dirty = true;

  // Local disk write (for dev convenience — NOT used for cloud sync)
  try {
    const fs = require('fs');
    const path = require('path');
    fs.writeFileSync(path.join(__dirname, 'db.json'), JSON.stringify(mem, null, 2), 'utf8');
  } catch { /* non-fatal */ }
}

function isDirty() { return dirty; }

module.exports = { getData, saveData, pullLatest, pushLatest, isDirty };
