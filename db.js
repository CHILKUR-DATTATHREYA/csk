/**
 * db.js — Database storage module
 * 
 * Supports local development and persistent deployment environments (e.g. Railway).
 * If the environment variable PERSISTENT_DIR is set, the database file
 * will be stored and persisted in that directory (e.g. /data).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// In-memory cache
let mem = null;
let dirty = false;

/**
 * Resolves the absolute path to the database file.
 */
function getDbPath() {
  const dir = process.env.PERSISTENT_DIR || __dirname;
  // If a custom directory is specified, ensure it exists
  if (dir !== __dirname && !fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      console.error('Error creating directory for persistent database:', e.message);
    }
  }
  return path.join(dir, 'db.json');
}

/**
 * Self-heal: ensure all required keys exist in the database structure.
 */
function ensureStructure(data) {
  if (!data || typeof data !== 'object') return null;
  if (!Array.isArray(data.users)) return null;
  if (!data.emailConfig) data.emailConfig = {};
  if (!Array.isArray(data.requests))  data.requests  = [];
  if (!Array.isArray(data.invoices))  data.invoices  = [];
  if (!Array.isArray(data.estimates)) data.estimates = [];
  if (!Array.isArray(data.updates))   data.updates   = [];
  if (!Array.isArray(data.auditLogs)) data.auditLogs = [];
  return data;
}

/**
 * Initializes the database on persistent disk if not present,
 * seeding it from the template db.json file in the application bundle.
 */
function initDb() {
  const targetPath = getDbPath();
  if (!fs.existsSync(targetPath)) {
    const srcPath = path.join(__dirname, 'db.json');
    if (fs.existsSync(srcPath)) {
      try {
        fs.copyFileSync(srcPath, targetPath);
        console.log('✅ Initialized persistent db.json from bundle template at:', targetPath);
      } catch (e) {
        console.error('Error seeding persistent db.json:', e.message);
      }
    } else {
      // Create empty DB template if source doesn't exist
      const bcrypt = require('bcryptjs');
      const salt = bcrypt.genSaltSync(10);
      const initialData = {
        emailConfig: {
          smtpHost: "smtp.gmail.com",
          smtpPort: 465,
          smtpSecure: true,
          smtpUser: "cskelectronicservices@gmail.com",
          smtpPass: "nlgunutixumkpejc",
          defaultFrom: "CSK Electronics <cskelectronicservices@gmail.com>",
          defaultAdminEmail: "cskelectronicservices@gmail.com"
        },
        users: [
          {
            id: "u-admin",
            email: "cskelectronicservices@gmail.com",
            passwordHash: bcrypt.hashSync("admin123", salt),
            name: "TINKU",
            role: "admin",
            phone: "7075750640",
            address: "Service Center, Kothapet, Nagole, Hyderabad"
          }
        ],
        requests: [],
        invoices: [],
        estimates: [],
        updates: [],
        auditLogs: []
      };
      try {
        fs.writeFileSync(targetPath, JSON.stringify(initialData, null, 2), 'utf-8');
        console.log('✅ Created fresh fallback db.json at:', targetPath);
      } catch (e) {
        console.error('Error writing fallback db.json:', e.message);
      }
    }
  }
}

/**
 * Pulls the latest database from disk.
 * Fast, file-based operation replacing slow serverless cloud synchronization.
 */
async function pullLatest() {
  initDb();
  const targetPath = getDbPath();
  try {
    const raw = fs.readFileSync(targetPath, 'utf8');
    const parsed = JSON.parse(raw);
    const valid = ensureStructure(parsed);
    if (valid) {
      mem = valid;
      dirty = false;
    }
  } catch (err) {
    console.error('Error loading database file:', err.message);
  }
  return mem;
}

/**
 * Pushes in-memory cache changes to disk.
 * Fast, file-based operation.
 */
async function pushLatest() {
  if (mem && dirty) {
    const targetPath = getDbPath();
    try {
      fs.writeFileSync(targetPath, JSON.stringify(mem, null, 2), 'utf8');
      dirty = false;
    } catch (err) {
      console.error('Error writing database to disk:', err.message);
    }
  }
  return mem;
}

/**
 * Gets the current in-memory database.
 */
function getData() {
  if (!mem) {
    initDb();
    const targetPath = getDbPath();
    try {
      const raw = fs.readFileSync(targetPath, 'utf8');
      mem = ensureStructure(JSON.parse(raw));
    } catch (err) {
      mem = { emailConfig: {}, users: [], requests: [], invoices: [], estimates: [], updates: [], auditLogs: [] };
    }
  }
  return mem;
}

/**
 * Updates the database cache and immediately writes to disk.
 */
function saveData(data) {
  mem = ensureStructure(data) || data;
  dirty = true;
  const targetPath = getDbPath();
  try {
    fs.writeFileSync(targetPath, JSON.stringify(mem, null, 2), 'utf8');
    dirty = false;
  } catch (err) {
    console.error('Error writing database to disk:', err.message);
  }
}

function isDirty() {
  return dirty;
}

module.exports = {
  getData,
  saveData,
  pullLatest,
  pushLatest,
  isDirty,
  getDbPath
};
