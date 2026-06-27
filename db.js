const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const https = require('https');

const localDbPath = path.join(__dirname, 'db.json');
const EXTENDSCLASS_BIN = 'https://extendsclass.com/api/json-storage/bin/cadceef';

let cachedData = null;
let dirty = false;

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

// Async Cloud Sync Functions
function pullLatest() {
  return new Promise((resolve, reject) => {
    https.get(EXTENDSCLASS_BIN, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed && parsed.users) {
            const targetPath = getDbPath();
            fs.writeFileSync(targetPath, body, 'utf8');
            cachedData = parsed;
            dirty = false;
            resolve(parsed);
          } else {
            reject(new Error('Invalid database format from cloud'));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', err => {
      reject(err);
    });
  });
}

function pushLatest() {
  return new Promise((resolve, reject) => {
    const targetPath = getDbPath();
    let payload;
    try {
      payload = fs.readFileSync(targetPath, 'utf8');
    } catch (e) {
      return reject(e);
    }

    const req = https.request(EXTENDSCLASS_BIN, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      }
    }, res => {
      res.on('data', () => {});
      res.on('end', () => {
        if (res.statusCode === 200) {
          dirty = false;
          resolve();
        } else {
          reject(new Error(`Failed to upload: status ${res.statusCode}`));
        }
      });
    });
    req.on('error', err => {
      reject(err);
    });
    req.write(payload);
    req.end();
  });
}

function getData() {
  if (cachedData) {
    return cachedData;
  }
  initDb();
  const targetPath = getDbPath();
  try {
    const raw = fs.readFileSync(targetPath, 'utf-8');
    const data = JSON.parse(raw);
    
    // Self-healing database structure
    if (!data.updates) data.updates = [];
    if (!data.requests) data.requests = [];
    if (!data.invoices) data.invoices = [];
    if (!data.estimates) data.estimates = [];

    cachedData = data;
    return data;
  } catch (err) {
    return { emailConfig: {}, users: [], requests: [], invoices: [], estimates: [], updates: [] };
  }
}

function saveData(data) {
  cachedData = data;
  dirty = true;
  const targetPath = getDbPath();
  try {
    fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('DB write warning (local write):', e.message);
  }
}

function isDirty() {
  return dirty;
}

module.exports = {
  getData,
  saveData,
  initDb,
  pullLatest,
  pushLatest,
  isDirty,
  getDbPath
};
