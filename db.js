const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const localDbPath = path.join(__dirname, 'db.json');
const syncScriptPath = path.join(__dirname, 'db_sync.js');

function getDbPath() {
  if (process.env.VERCEL) {
    const tmpPath = path.join('/tmp', 'db.json');
    if (!fs.existsSync(tmpPath) && fs.existsSync(localDbPath)) {
      try {
        fs.copyFileSync(localDbPath, tmpPath);
      } catch (e) {}
    }
    return tmpPath;
  }
  return localDbPath;
}

function initDb() {
  const targetPath = getDbPath();
  if (!fs.existsSync(targetPath)) {
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
          name: "CSK Admin",
          role: "admin",
          phone: "7075750640, 7981785948",
          address: "Service Center, Kothapet, Nagole, Hyderabad"
        },
        {
          id: "u-tech1",
          email: "tech1@csk.com",
          passwordHash: bcrypt.hashSync("tech123", salt),
          plainPassword: "tech123",
          name: "Alex Mercer",
          role: "technician",
          phone: "9876543212",
          specialization: "OLED & QLED Panels"
        },
        {
          id: "u-tech2",
          email: "tech2@csk.com",
          passwordHash: bcrypt.hashSync("tech123", salt),
          plainPassword: "tech123",
          name: "Sarah Connor",
          role: "technician",
          phone: "9876543213",
          specialization: "Motherboards & Power Boards"
        },
        {
          id: "u-cust1",
          email: "cust1@csk.com",
          passwordHash: bcrypt.hashSync("cust123", salt),
          name: "John Doe",
          role: "customer",
          phone: "9876543210",
          address: "123 Main Street, Bangalore, Karnataka"
        },
        {
          id: "u-cust2",
          email: "cust2@csk.com",
          passwordHash: bcrypt.hashSync("cust123", salt),
          name: "Jane Smith",
          role: "customer",
          phone: "9876543211",
          address: "456 Oak Avenue, Chennai, Tamil Nadu"
        }
      ],
      requests: [],
      invoices: [],
      estimates: [],
      updates: []
    };
    try {
      fs.writeFileSync(targetPath, JSON.stringify(initialData, null, 2), 'utf-8');
    } catch (e) {}
  }
}

// In-Memory Request Cache to limit API calls within the same HTTP request
let localCache = null;
let cacheTime = 0;
const CACHE_DURATION_MS = 2500; // 2.5 seconds cache TTL

function getData() {
  const now = Date.now();
  if (localCache && (now - cacheTime) < CACHE_DURATION_MS) {
    return localCache;
  }

  initDb();
  const targetPath = getDbPath();

  // Try to pull latest from ExtendsClass synchronously via db_sync.js
  try {
    const script = syncScriptPath.replace(/\\/g, '/');
    const dbPath = targetPath.replace(/\\/g, '/');
    const cmd = `node "${script}" pull "${dbPath}"`;

    const { execSync } = require('child_process');
    execSync(cmd, { stdio: 'ignore', timeout: 5000 });
  } catch (err) {
    console.error('Failed to pull from cloud database, using local cache:', err.message);
  }

  try {
    const raw = fs.readFileSync(targetPath, 'utf-8');
    const data = JSON.parse(raw);

    // Self-healing database structure
    if (!data.updates) data.updates = [];
    if (!data.requests) data.requests = [];
    if (!data.invoices) data.invoices = [];
    if (!data.estimates) data.estimates = [];

    // Standard Gmail Default Email Credentials Configuration
    if (!data.emailConfig || !data.emailConfig.smtpUser) {
      data.emailConfig = {
        smtpHost: "smtp.gmail.com",
        smtpPort: 465,
        smtpSecure: true,
        smtpUser: "cskelectronicservices@gmail.com",
        smtpPass: "nlgunutixumkpejc",
        defaultFrom: "CSK Electronics <cskelectronicservices@gmail.com>",
        defaultAdminEmail: "cskelectronicservices@gmail.com"
      };
      // Save synchronously
      fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), 'utf-8');
    }

    localCache = data;
    cacheTime = now;
    return data;
  } catch (err) {
    return { emailConfig: {}, users: [], requests: [], invoices: [], estimates: [], updates: [] };
  }
}

function saveData(data) {
  // Update in-memory cache instantly
  localCache = data;
  cacheTime = Date.now();

  const targetPath = getDbPath();
  try {
    // 1. Write to local file first
    fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), 'utf-8');

    // 2. Upload to ExtendsClass synchronously via db_sync.js
    const script = syncScriptPath.replace(/\\/g, '/');
    const dbPath = targetPath.replace(/\\/g, '/');
    const cmd = `node "${script}" push "${dbPath}"`;

    const { execSync } = require('child_process');
    execSync(cmd, { stdio: 'ignore', timeout: 6000 });
  } catch (e) {
    console.error('DB write warning (serverless environment):', e.message);
  }
}

module.exports = {
  getData,
  saveData,
  initDb
};
