const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'db.json');

function initDb() {
  if (!fs.existsSync(dbPath)) {
    const salt = bcrypt.genSaltSync(10);
    const initialData = {
      emailConfig: {
        smtpHost: "smtp.ethereal.email",
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: "",
        smtpPass: "",
        defaultFrom: "CSK Electronics <support@cskelectronics.com>",
        defaultAdminEmail: "admin@csk.com"
      },
      users: [
        {
          id: "u-admin",
          email: "admin@csk.com",
          passwordHash: bcrypt.hashSync("admin123", salt),
          name: "CSK Admin",
          role: "admin",
          phone: "1800-456-7890",
          address: "CSK Service HQ, Chennai"
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
      requests: [
        {
          id: "REQ-1001",
          customerId: "u-cust1",
          tvBrand: "Samsung",
          tvModel: "Neo QLED 55\"",
          problemDesc: "Display flickering and black bars on screen edges.",
          status: "New",
          assignedTechId: null,
          createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
          updatedAt: new Date(Date.now() - 3600000 * 2).toISOString()
        },
        {
          id: "REQ-1002",
          customerId: "u-cust2",
          tvBrand: "Sony",
          tvModel: "Bravia OLED 65\"",
          problemDesc: "No power, standby light is blinking red 6 times.",
          status: "Assigned",
          assignedTechId: "u-tech1",
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          updatedAt: new Date(Date.now() - 7200000).toISOString()
        }
      ],
      estimates: [
        {
          requestId: "REQ-1002",
          inspectionCharge: 500,
          sparePartsCost: 3500,
          labourCharges: 1500,
          additionalCharges: 200,
          totalEstimate: 5700,
          notes: "Power supply board replacement required.",
          status: "Pending", // Pending, Approved, Rejected
          updatedAt: new Date(Date.now() - 7200000).toISOString()
        }
      ],
      invoices: [],
      updates: [
        {
          requestId: "REQ-1001",
          status: "New",
          note: "Service complaint registered automatically.",
          updatedBy: "System",
          createdAt: new Date(Date.now() - 3600000 * 2).toISOString()
        },
        {
          requestId: "REQ-1002",
          status: "New",
          note: "Service complaint registered automatically.",
          updatedBy: "System",
          createdAt: new Date(Date.now() - 86400000).toISOString()
        },
        {
          requestId: "REQ-1002",
          status: "Assigned",
          note: "Technician Alex Mercer assigned to request by Admin.",
          updatedBy: "Admin",
          createdAt: new Date(Date.now() - 7200000).toISOString()
        }
      ]
    };
    fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

function getData() {
  initDb();
  const raw = fs.readFileSync(dbPath, 'utf-8');
  const data = JSON.parse(raw);
  if (!data.emailConfig) {
    data.emailConfig = {
      smtpHost: "smtp.ethereal.email",
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: "",
      smtpPass: "",
      defaultFrom: "CSK Electronics <support@cskelectronics.com>",
      defaultAdminEmail: "admin@csk.com"
    };
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
  } else if (data.emailConfig.defaultAdminEmail) {
    const adminUser = data.users.find(u => u.role === 'admin');
    if (adminUser && adminUser.email.toLowerCase() !== data.emailConfig.defaultAdminEmail.toLowerCase()) {
      adminUser.email = data.emailConfig.defaultAdminEmail;
      fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
    }
  }
  return data;
}

function saveData(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = {
  getData,
  saveData,
  initDb
};
