const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const localDbPath = path.join(__dirname, 'db.json');

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
        smtpHost: "smtp.ethereal.email",
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: "",
        smtpPass: "",
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
      auditLogs: []
    };
    try {
      fs.writeFileSync(targetPath, JSON.stringify(initialData, null, 2), 'utf-8');
    } catch (e) {}
  }
}

function getData() {
  initDb();
  const targetPath = getDbPath();
  try {
    const raw = fs.readFileSync(targetPath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.emailConfig) {
      data.emailConfig = {
        smtpHost: "smtp.ethereal.email",
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: "",
        smtpPass: "",
        defaultFrom: "CSK Electronics <cskelectronicservices@gmail.com>",
        defaultAdminEmail: "cskelectronicservices@gmail.com"
      };
      saveData(data);
    }
    return data;
  } catch (err) {
    return { emailConfig: {}, users: [], requests: [], invoices: [], auditLogs: [] };
  }
}

function saveData(data) {
  const targetPath = getDbPath();
  try {
    fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('DB write warning (serverless environment):', e.message);
  }
}

module.exports = {
  getData,
  saveData,
  initDb
};
