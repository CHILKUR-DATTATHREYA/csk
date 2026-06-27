const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const localDbPath = path.join(__dirname, 'db.json');

// ExtendsClass Shared Bin URL
const EXTENDSCLASS_BIN = 'https://extendsclass.com/api/json-storage/bin/cadceef';

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

  // Try to pull latest from ExtendsClass synchronously via child process
  try {
    const downloadPath = path.join(path.dirname(targetPath), 'downloaded_db.json');
    const cmd = `node -e "const https = require('https'); const fs = require('fs'); https.get('${EXTENDSCLASS_BIN}', res => { let body = ''; res.on('data', chunk => body += chunk); res.on('end', () => { fs.writeFileSync('${downloadPath.replace(/\\/g, '\\\\')}', body, 'utf8'); process.exit(0); }); }).on('error', () => { process.exit(1); });"`;

    const { execSync } = require('child_process');
    execSync(cmd, { stdio: 'ignore', timeout: 5000 });

    if (fs.existsSync(downloadPath)) {
      const raw = fs.readFileSync(downloadPath, 'utf-8');
      const parsed = JSON.parse(raw);
      // Verify data integrity before updating local file cache
      if (parsed && parsed.users) {
        fs.writeFileSync(targetPath, raw, 'utf-8');
      }
      try { fs.unlinkSync(downloadPath); } catch (e) {}
    }
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

    // 2. Upload to ExtendsClass synchronously via child process
    const payloadPath = path.join(path.dirname(targetPath), 'upload_payload.json');
    fs.writeFileSync(payloadPath, JSON.stringify(data), 'utf-8');

    const cmd = `node -e "const https = require('https'); const fs = require('fs'); const data = fs.readFileSync('${payloadPath.replace(/\\/g, '\\\\')}', 'utf8'); const req = https.request('${EXTENDSCLASS_BIN}', { method: 'PUT', headers: { 'Content-Type': 'application/json' } }, res => { res.on('data', () => {}); res.on('end', () => { process.exit(0); }); }); req.on('error', () => { process.exit(1); }); req.write(data); req.end();"`;

    const { execSync } = require('child_process');
    execSync(cmd, { stdio: 'ignore', timeout: 6000 });

    try { fs.unlinkSync(payloadPath); } catch (e) {}
  } catch (e) {
    console.error('DB write warning (serverless environment):', e.message);
  }
}

module.exports = {
  getData,
  saveData,
  initDb
};
