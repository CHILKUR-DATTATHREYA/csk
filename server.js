const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const mailService = require('./mailService');

// Firebase Admin SDK Configuration (Auto-detects credentials file)
const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
const clientConfigPath = path.join(__dirname, 'public', 'firebase-config.json');
let firebaseAdmin = null;
let firebaseAuth = null;
let useFirebase = false;

if (fs.existsSync(serviceAccountPath) && fs.existsSync(clientConfigPath)) {
  try {
    firebaseAdmin = require('firebase-admin');
    const { getAuth } = require('firebase-admin/auth');
    const serviceAccount = require('./firebase-service-account.json');
    const appInstance = firebaseAdmin.initializeApp({
      credential: firebaseAdmin.cert(serviceAccount)
    });
    firebaseAuth = getAuth(appInstance);
    useFirebase = true;
    console.log('🔥 [FIREBASE] Successfully initialized and activated Firebase Auth verification mode.');
  } catch (err) {
    console.error('❌ [FIREBASE] Error initializing firebase-admin SDK:', err.message);
  }
} else {
  console.log('🔐 [AUTH] Running in local JWT Auth mode. (Add firebase-service-account.json to root directory to enable Firebase)');
}

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'csk_super_secret_key_2026';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Server-Sent Events clients
let sseClients = [];

// SSE Registration Endpoint
app.get('/api/notifications/sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write('\n');
  sseClients.push(res);
  
  req.on('close', () => {
    sseClients = sseClients.filter(client => client !== res);
  });
});

// Helper to broadcast notification to all clients
function broadcast(type, message, details = {}) {
  const payload = JSON.stringify({ type, message, details, timestamp: new Date().toISOString() });
  sseClients.forEach(client => {
    client.write(`data: ${payload}\n\n`);
  });
}

// Authentication Middleware
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access token missing' });
  
  if (useFirebase && firebaseAuth) {
    try {
      const decodedToken = await firebaseAuth.verifyIdToken(token);
      const data = db.getData();
      const user = data.users.find(u => u.email.toLowerCase() === decodedToken.email.toLowerCase());
      
      if (!user) {
        return res.status(403).json({ error: 'Firebase credentials valid, but user is not registered in CSK local database.' });
      }
      
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        address: user.address,
        specialization: user.specialization
      };
      next();
    } catch (err) {
      return res.status(403).json({ error: 'Invalid or expired Firebase ID Token: ' + err.message });
    }
  } else {
    // Fallback to local JWT verification
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) return res.status(403).json({ error: 'Invalid or expired token' });
      req.user = user;
      next();
    });
  }
}

// Authorization Middleware
function requireRole(roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied: Insufficient privileges' });
    }
    next();
  };
}

// Helper to log requests updates
function addRequestUpdate(data, requestId, status, note, updatedBy) {
  const newUpdate = {
    requestId,
    status,
    note,
    updatedBy,
    createdAt: new Date().toISOString()
  };
  data.updates.push(newUpdate);
}

// AUTHENTICATION ENDPOINTS
app.post('/api/auth/register', (req, res) => {
  const { email, password, name, phone, address } = req.body;
  if (!email || (!password && !useFirebase) || !name) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }
  
  const data = db.getData();
  const existingUser = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existingUser) {
    if (useFirebase) {
      existingUser.name = name;
      if (phone) existingUser.phone = phone;
      if (address) existingUser.address = address;
      db.saveData(data);
      return res.status(200).json({ message: 'Registration updated successfully' });
    } else {
      return res.status(400).json({ error: 'Email already registered' });
    }
  }
  
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = password ? bcrypt.hashSync(password, salt) : '';
  
  const newUser = {
    id: 'u-' + crypto.randomUUID().substring(0, 8),
    email,
    passwordHash,
    name,
    role: 'customer',
    phone: phone || '',
    address: address || ''
  };
  
  data.users.push(newUser);
  db.saveData(data);

  // Send Welcome Email (Clean, high-end business format, includes website dashboard button)
  const welcomeEmailHtml = mailService.buildEmailTemplate({
    title: 'Welcome to CSK Electronics!',
    bodyHtml: `
      <p>Dear ${name},</p>
      <p>Thank you for registering your account with <strong>CSK Electronics</strong>. Your customer profile has been created successfully.</p>
      
      <div style="background-color: #fff1f2; border: 1.5px solid #f43f5e; padding: 20px; border-radius: 10px; margin-bottom: 25px;">
        <h4 style="margin: 0 0 8px 0; font-size: 15px; color: #e11d48; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
          ⚠️ Important Notice: Independent Multi-Brand Service
        </h4>
        <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #9f1239; font-weight: 500;">
          Please note: <strong>This is not an Authorized TV Service Center</strong>. CSK Electronics is an independent service center specializing in repairs of <strong>all types and brands of TVs</strong> (Samsung, Sony, LG, Panasonic, TCL, etc.). This independent status allows us to offer more flexible repair timelines, customized micro-soldering solutions, and highly competitive pricing compared to official brand service centers.
        </p>
      </div>

      <p>Here are your registered account details:</p>
      <table class="details-table">
        <tr>
          <td class="label">Full Name</td>
          <td class="value">${name}</td>
        </tr>
        <tr>
          <td class="label">Email Address</td>
          <td class="value">${email}</td>
        </tr>
        <tr>
          <td class="label">Phone Number</td>
          <td class="value">${phone || 'N/A'}</td>
        </tr>
        <tr>
          <td class="label">Address</td>
          <td class="value">${address || 'N/A'}</td>
        </tr>
      </table>

      <h3 style="font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 25px; margin-bottom: 10px;">We Repair and Service All Major Brands</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
        <tr>
          <td style="width: 33%; text-align: center; padding: 8px; font-weight: bold; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 12px; color: #475569;">Samsung</td>
          <td style="width: 33%; text-align: center; padding: 8px; font-weight: bold; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 12px; color: #475569;">Sony</td>
          <td style="width: 33%; text-align: center; padding: 8px; font-weight: bold; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 12px; color: #475569;">LG</td>
        </tr>
        <tr>
          <td style="width: 33%; text-align: center; padding: 8px; font-weight: bold; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 12px; color: #475569;">Panasonic</td>
          <td style="width: 33%; text-align: center; padding: 8px; font-weight: bold; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 12px; color: #475569;">TCL</td>
          <td style="width: 33%; text-align: center; padding: 8px; font-weight: bold; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 12px; color: #475569;">OnePlus</td>
        </tr>
        <tr>
          <td style="width: 33%; text-align: center; padding: 8px; font-weight: bold; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 12px; color: #475569;">Mi / Xiaomi</td>
          <td style="width: 33%; text-align: center; padding: 8px; font-weight: bold; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 12px; color: #475569;">Hisense</td>
          <td style="width: 33%; text-align: center; padding: 8px; font-weight: bold; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 12px; color: #475569;">Philips</td>
        </tr>
      </table>

      <p>Through your customer dashboard, you can track active TV repair jobs, review and approve inspection estimates, and sign final invoices online.</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="http://localhost:3000" style="display: inline-block; padding: 12px 28px; background-color: #1e3a8a; color: #ffffff; text-decoration: none; font-weight: bold; border-radius: 8px; font-size: 15px; box-shadow: 0 4px 12px rgba(30, 58, 138, 0.25);">Go to Website Dashboard</a>
      </div>
    `
  });

  mailService.sendMail({
    to: email,
    subject: 'CSK Electronics - Welcome & Registration Successful',
    html: welcomeEmailHtml
  }).catch(err => console.error("Error sending welcome email:", err.message));

  // Send Welcome SMS
  const welcomeSmsMessage = `Welcome to CSK Electronics, ${name}!\nYour account has been registered successfully.\nYou can now login using your email: ${email}\nLogin: http://localhost:3000`;
  mailService.sendSimulatedSMS(phone || 'N/A', welcomeSmsMessage);
  
  res.status(201).json({ message: 'Registration successful' });
});

app.post('/api/auth/login', async (req, res) => {
  // If authorization header is present and Firebase mode is active, handle token login
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (useFirebase && firebaseAuth && token) {
    try {
      const decodedToken = await firebaseAuth.verifyIdToken(token);
      const data = db.getData();
      const user = data.users.find(u => u.email.toLowerCase() === decodedToken.email.toLowerCase());
      
      if (!user) {
        return res.status(404).json({ error: 'Email not registered' });
      }
      
      return res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          phone: user.phone,
          address: user.address,
          specialization: user.specialization
        }
      });
    } catch (err) {
      return res.status(403).json({ error: 'Invalid Firebase ID token: ' + err.message });
    }
  }

  // Fallback to standard email/password credentials login
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  const data = db.getData();
  const loginEmail = email.toLowerCase();
  
  // Allow login using registered email OR admin fallback if u-admin
  let user = data.users.find(u => u.email.toLowerCase() === loginEmail);
  if (!user && loginEmail === 'admin@csk.com') {
    user = data.users.find(u => u.role === 'admin');
  }
  
  if (!user) {
    return res.status(404).json({ error: 'Email not registered' });
  }
  
  if (!bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(400).json({ error: 'Invalid email or password' });
  }
  
  const localToken = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  
  res.json({
    token: localToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      address: user.address,
      specialization: user.specialization
    }
  });
});

app.post('/api/auth/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  
  const data = db.getData();
  const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  
  if (!user) {
    return res.status(404).json({ error: 'No account registered with this email address' });
  }
  
  // Generate a random temporary password (8 characters)
  const tempPassword = 'CSK-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  
  // Hash the temporary password
  const salt = bcrypt.genSaltSync(10);
  user.passwordHash = bcrypt.hashSync(tempPassword, salt);
  db.saveData(data);
  
  // Send Password Reset Email (Clean, high-end business format, no local links to avoid spam filter)
  const emailHtml = mailService.buildEmailTemplate({
    title: 'Password Reset Request',
    bodyHtml: `
      <p>Dear ${user.name || 'Valued Customer'},</p>
      <p>We received a request to reset the password for your CSK Electronics account.</p>
      <p>Your temporary password is:</p>
      <div style="background-color: #f8fafc; border: 1.5px dashed #cbd5e1; padding: 16px; text-align: center; font-size: 1.5rem; font-weight: bold; letter-spacing: 2px; color: #1e3a8a; border-radius: 8px; margin: 15px 0;">
        ${tempPassword}
      </div>
      <p>Please use this temporary password to log in. Once logged in, you can update your password in your profile settings if needed.</p>
      <p style="color: #ef4444; font-size: 0.85em; margin-top: 15px;"><strong>Note:</strong> If you did not request this reset, please ignore this email or contact support.</p>
    `
  });
  
  mailService.sendMail({
    to: user.email,
    subject: 'CSK Electronics - Password Reset Request',
    html: emailHtml
  }).catch(err => console.error("Error sending forgot password email:", err.message));
  
  // Send Password Reset SMS
  const smsMessage = `CSK Electronics Alert:\nYour password has been reset. Temporary password: ${tempPassword}\nPlease login and change it: http://localhost:3000`;
  mailService.sendSimulatedSMS(user.phone || 'N/A', smsMessage);
  
  res.json({ message: 'Temporary password sent to your registered email and mobile number!' });
});

app.post('/api/auth/change-password', authenticateToken, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new passwords are required' });
  }
  
  const data = db.getData();
  const user = data.users.find(u => u.id === req.user.id);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  if (!bcrypt.compareSync(oldPassword, user.passwordHash)) {
    return res.status(400).json({ error: 'Incorrect current password' });
  }
  
  const salt = bcrypt.genSaltSync(10);
  user.passwordHash = bcrypt.hashSync(newPassword, salt);
  db.saveData(data);
  
  res.json({ message: 'Password updated successfully!' });
});

// ADMIN DASHBOARD STATS
app.get('/api/admin/stats', authenticateToken, requireRole(['admin']), (req, res) => {
  const data = db.getData();
  const customers = data.users.filter(u => u.role === 'customer');
  const technicians = data.users.filter(u => u.role === 'technician');
  
  const totalCustomers = customers.length;
  const totalTechnicians = technicians.length;
  
  const activeRepairs = data.requests.filter(r => ['Assigned', 'Inspection Completed', 'Waiting Customer Approval', 'Approved', 'Repair In Progress'].includes(r.status)).length;
  const completedRepairs = data.requests.filter(r => r.status === 'Repair Completed' || r.status === 'Invoice Generated').length;
  const pendingRepairs = data.requests.filter(r => r.status === 'New').length;
  
  // Calculate revenue from invoices
  const totalRevenue = data.invoices.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0);
  
  res.json({
    totalCustomers,
    totalTechnicians,
    activeRepairs,
    completedRepairs,
    pendingRepairs,
    totalRevenue
  });
});

// ADMIN MANAGE USERS
app.get('/api/admin/users', authenticateToken, requireRole(['admin']), (req, res) => {
  const data = db.getData();
  const users = data.users.map(u => {
    const { passwordHash, ...safeUser } = u;
    return safeUser;
  });
  res.json(users);
});

app.post('/api/admin/users', authenticateToken, requireRole(['admin']), (req, res) => {
  const { email, password, name, role, phone, address, specialization } = req.body;
  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: 'Email, password, name, and role are required' });
  }
  
  const data = db.getData();
  if (data.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: 'Email already registered' });
  }
  
  const salt = bcrypt.genSaltSync(10);
  const newUser = {
    id: 'u-' + crypto.randomUUID().substring(0, 8),
    email,
    passwordHash: bcrypt.hashSync(password, salt),
    name,
    role,
    phone: phone || '',
    address: address || '',
    specialization: role === 'technician' ? (specialization || 'General TV Repair') : undefined
  };
  
  data.users.push(newUser);
  db.saveData(data);
  
  res.status(201).json({ message: `${role.charAt(0).toUpperCase() + role.slice(1)} created successfully` });
});

// ADMIN SERVICE REQUESTS
app.get('/api/admin/requests', authenticateToken, requireRole(['admin']), (req, res) => {
  const data = db.getData();
  
  const enrichedRequests = data.requests.map(reqItem => {
    const customer = data.users.find(u => u.id === reqItem.customerId) || {};
    const technician = data.users.find(u => u.id === reqItem.assignedTechId) || null;
    const estimate = data.estimates.find(e => e.requestId === reqItem.id) || null;
    const invoice = data.invoices.find(i => i.requestId === reqItem.id) || null;
    
    return {
      ...reqItem,
      customerName: customer.name || 'Unknown',
      customerPhone: customer.phone || '',
      customerAddress: customer.address || '',
      technicianName: technician ? technician.name : 'Unassigned',
      estimate,
      invoice
    };
  });
  
  res.json(enrichedRequests);
});

// ADMIN EMAIL CONFIGURATION ENDPOINTS
app.get('/api/admin/email-config', authenticateToken, requireRole(['admin']), (req, res) => {
  const data = db.getData();
  const config = { ...data.emailConfig };
  if (config.smtpPass) {
    config.smtpPass = '••••••••';
  }
  res.json(config);
});

app.post('/api/admin/email-config', authenticateToken, requireRole(['admin']), (req, res) => {
  const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, defaultFrom, defaultAdminEmail } = req.body;
  const data = db.getData();
  const prevConfig = data.emailConfig || {};

  const port = parseInt(smtpPort) || 587;
  // Auto-correct secure flag: port 465 = SSL, everything else = STARTTLS
  const secure = port === 465 ? true : false;

  // Keep the previously stored password if:
  // 1. The incoming value is the masked placeholder '••••••••', OR
  // 2. The incoming value is empty/undefined (user didn't change it)
  const MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'; // ••••••••
  const passwordChanged = smtpPass && smtpPass !== MASK && smtpPass.trim() !== '';
  const finalPass = passwordChanged ? smtpPass : (prevConfig.smtpPass || '');

  data.emailConfig = {
    smtpHost: smtpHost || 'smtp.gmail.com',
    smtpPort: port,
    smtpSecure: secure,
    smtpUser,
    smtpPass: finalPass,
    defaultFrom,
    defaultAdminEmail
  };

  db.saveData(data);
  console.log(`📧 [EMAIL CONFIG] Updated: host=${data.emailConfig.smtpHost}, port=${port}, secure=${secure}, user=${smtpUser}, hasPass=${!!finalPass}`);
  res.json({ message: 'Email configuration updated successfully' });
});


app.post('/api/admin/email-config/test', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const data = db.getData();
    const config = data.emailConfig || {};
    // Send test mail to the configured real admin email (or fallback to login email)
    const testTarget = config.defaultAdminEmail || req.user.email;
    const testHtml = mailService.buildEmailTemplate({
      title: 'SMTP Connection Working Successfully',
      bodyHtml: `
        <p>This email confirms that your SMTP settings in the CSK Electronics Repair System are configured correctly and working perfectly.</p>
        <table class="details-table">
          <tr><td class="label">SMTP Host</td><td class="value">${config.smtpHost}</td></tr>
          <tr><td class="label">SMTP Port</td><td class="value">${config.smtpPort}</td></tr>
          <tr><td class="label">SMTP User</td><td class="value">${config.smtpUser}</td></tr>
          <tr><td class="label">Sent At</td><td class="value">${new Date().toLocaleString('en-IN')}</td></tr>
        </table>
      `
    });
    await mailService.sendMail({
      to: testTarget,
      subject: 'CSK Electronics - SMTP Test Connection ✅',
      html: testHtml
    });
    res.json({ message: `Test email sent to ${testTarget}! Check your inbox.` });
  } catch (err) {
    console.error('[TEST EMAIL ERROR]', err.message);
    res.status(500).json({ error: `Connection failed: ${err.message}` });
  }
});


// ADMIN ASSIGN TECHNICIAN
app.post('/api/admin/assign', authenticateToken, requireRole(['admin']), (req, res) => {
  const { requestId, technicianId } = req.body;
  if (!requestId || !technicianId) {
    return res.status(400).json({ error: 'Request ID and Technician ID are required' });
  }
  
  const data = db.getData();
  const request = data.requests.find(r => r.id === requestId);
  const technician = data.users.find(u => u.id === technicianId && (u.role === 'technician' || u.role === 'admin'));
  
  if (!request) return res.status(404).json({ error: 'Service request not found' });
  if (!technician) return res.status(404).json({ error: 'Technician/Admin not found' });
  
  request.assignedTechId = technicianId;
  request.status = 'Assigned';
  request.updatedAt = new Date().toISOString();
  
  addRequestUpdate(data, requestId, 'Assigned', `Technician ${technician.name} manually assigned by Admin.`, 'Admin');
  db.saveData(data);
  
  // Send notifications to Customer
  const customer = data.users.find(u => u.id === request.customerId) || {};
  const customerPhone = customer.phone || 'N/A';
  const customerEmail = customer.email || 'N/A';

  // Send Customer SMS
  const customerSmsMessage = `CSK Electronics Alert:\nTechnician ${technician.name} (Ph: ${technician.phone || 'N/A'}) has been assigned to your request ${requestId}.\nThey will contact you shortly.\nDetails: http://localhost:3000`;
  mailService.sendSimulatedSMS(customerPhone, customerSmsMessage);

  // Send Customer Email
  const customerMailHtml = mailService.buildEmailTemplate({
    title: 'Technician Assigned to Your Repair Request',
    bodyHtml: `
      <p>Dear ${customer.name || 'Valued Customer'},</p>
      <p>An engineer has been assigned to diagnose and repair your TV. Details are below:</p>
      <table class="details-table">
        <tr>
          <td class="label">Request ID</td>
          <td class="value">${requestId}</td>
        </tr>
        <tr>
          <td class="label">TV Details</td>
          <td class="value">${request.tvBrand} - ${request.tvModel}</td>
        </tr>
        <tr>
          <td class="label">Technician Name</td>
          <td class="value" style="font-weight: bold;">${technician.name}</td>
        </tr>
        <tr>
          <td class="label">Technician Phone</td>
          <td class="value">${technician.phone || '1800-456-7890'}</td>
        </tr>
        <tr>
          <td class="label">Status</td>
          <td class="value"><span class="badge badge-primary">Assigned</span></td>
        </tr>
      </table>
      <p>The technician will reach out to you shortly at your registered phone number (<strong>${customerPhone}</strong>) to schedule an inspection visit.</p>
    `
  });
  
  mailService.sendMail({
    to: customerEmail,
    subject: `CSK Electronics - Technician Assigned to Request: ${requestId}`,
    html: customerMailHtml
  }).catch(err => console.error("Error sending assignment email to customer:", err.message));

  // Send Technician Email
  const technicianMailHtml = mailService.buildEmailTemplate({
    title: 'New Service Job Assigned',
    bodyHtml: `
      <p>Hello ${technician.name},</p>
      <p>A TV repair request has been assigned to you. Details are below:</p>
      <table class="details-table">
        <tr>
          <td class="label">Request ID</td>
          <td class="value">${requestId}</td>
        </tr>
        <tr>
          <td class="label">Customer Name</td>
          <td class="value">${customer.name || 'N/A'}</td>
        </tr>
        <tr>
          <td class="label">Customer Phone</td>
          <td class="value">${customerPhone}</td>
        </tr>
        <tr>
          <td class="label">Customer Address</td>
          <td class="value">${customer.address || 'N/A'}</td>
        </tr>
        <tr>
          <td class="label">TV Details</td>
          <td class="value">${request.tvBrand} - ${request.tvModel}</td>
        </tr>
        <tr>
          <td class="label">Reported Defect</td>
          <td class="value">${request.problemDesc}</td>
        </tr>
      </table>
      <p>Please contact the customer as soon as possible to schedule the inspection visit.</p>
    `
  });

  mailService.sendMail({
    to: technician.email || 'tech@csk.com',
    subject: `CSK Electronics - New Repair Job Assigned: ${requestId}`,
    html: technicianMailHtml
  }).catch(err => console.error("Error sending job assignment email to technician:", err.message));

  // Send Technician SMS
  const techSmsMessage = `CSK Electronics Job Alert:\nYou have been assigned to repair request ${requestId}.\nCustomer: ${customer.name || 'N/A'} (${customerPhone})\nTV: ${request.tvBrand} - ${request.tvModel}\nView: http://localhost:3000`;
  mailService.sendSimulatedSMS(technician.phone || 'N/A', techSmsMessage);

  broadcast('TECHNICIAN_ASSIGNED', `Technician ${technician.name} assigned to Request ${requestId}`, {
    requestId,
    customerId: request.customerId,
    technicianId
  });
  
  res.json({ message: 'Technician assigned successfully', request });
});

// CUSTOMER COMPLAINTS / REQUESTS
app.post('/api/customer/request', authenticateToken, requireRole(['customer']), (req, res) => {
  const { tvBrand, tvModel, problemDesc } = req.body;
  if (!tvBrand || !tvModel || !problemDesc) {
    return res.status(400).json({ error: 'TV Brand, Model, and Problem Description are required' });
  }
  
  const data = db.getData();
  const requestId = 'REQ-' + (1000 + data.requests.length + 1);
  
  // No automatic assignment: complaints are registered as 'New' and assignedTechId = null. Only Admin manually assigns.
  let assignedTechId = null;
  let status = 'New';
  let logNote = 'Service complaint registered successfully. Awaiting Admin to assign technician.';
  
  const newRequest = {
    id: requestId,
    customerId: req.user.id,
    tvBrand,
    tvModel,
    problemDesc,
    status,
    assignedTechId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  data.requests.push(newRequest);
  addRequestUpdate(data, requestId, status, logNote, 'System');
  
  db.saveData(data);
  
  // Trigger real email notifications immediately
  const customer = data.users.find(u => u.id === req.user.id) || {};
  const customerPhone = customer.phone || 'N/A';
  const customerEmail = customer.email || req.user.email;
  const adminEmail = (data.emailConfig && data.emailConfig.defaultAdminEmail) || 'admin@csk.com';

  // Send Simulated SMS
  const smsMessage = `CSK Electronics Alert:\nYour complaint ${requestId} has been registered.\nTV: ${tvBrand} - ${tvModel}\nProblem: ${problemDesc}\nStatus: ${status}\nTrack: http://localhost:3000`;
  mailService.sendSimulatedSMS(customerPhone, smsMessage);

  // Send Customer Email
  const customerMailHtml = mailService.buildEmailTemplate({
    title: 'Repair Request Registered Successfully',
    bodyHtml: `
      <p>Dear ${customer.name || 'Valued Customer'},</p>
      <p>Your TV repair service request has been successfully registered. Here are the details:</p>
      <table class="details-table">
        <tr>
          <td class="label">Request ID</td>
          <td class="value">${requestId}</td>
        </tr>
        <tr>
          <td class="label">TV Details</td>
          <td class="value">${tvBrand} - ${tvModel}</td>
        </tr>
        <tr>
          <td class="label">Reported Problem</td>
          <td class="value">${problemDesc}</td>
        </tr>
        <tr>
          <td class="label">Status</td>
          <td class="value"><span class="badge badge-success">${status}</span></td>
        </tr>
      </table>
      <p>We will contact you shortly to coordinate the repair process.</p>
    `
  });
  
  mailService.sendMail({
    to: customerEmail,
    subject: `CSK Electronics - Repair Request Registered: ${requestId}`,
    html: customerMailHtml
  }).catch(err => console.error("Error sending customer registration email:", err.message));

  // Send Admin Email (no local links to avoid spam filters)
  const adminMailHtml = mailService.buildEmailTemplate({
    title: `New Service Request: ${requestId}`,
    bodyHtml: `
      <p>A new TV repair request has been submitted by a customer:</p>
      <table class="details-table">
        <tr>
          <td class="label">Customer Name</td>
          <td class="value">${customer.name || 'N/A'}</td>
        </tr>
        <tr>
          <td class="label">Phone Number</td>
          <td class="value">${customerPhone}</td>
        </tr>
        <tr>
          <td class="label">TV Details</td>
          <td class="value">${tvBrand} - ${tvModel}</td>
        </tr>
        <tr>
          <td class="label">Problem</td>
          <td class="value">${problemDesc}</td>
        </tr>
        <tr>
          <td class="label">Status</td>
          <td class="value"><span class="badge badge-danger">${status}</span></td>
        </tr>
      </table>
      <p>Please log in to the admin panel to assign a technician to this request.</p>
    `
  });
  
  mailService.sendMail({
    to: adminEmail,
    subject: `CSK Electronics - New Service Request: ${requestId} - ${tvBrand}`,
    html: adminMailHtml
  }).catch(err => console.error("Error sending admin alert email:", err.message));

  // Broadcast
  broadcast('NEW_COMPLAINT', `New complaint ${requestId} registered by ${req.user.name}.`, {
    requestId,
    customerId: req.user.id,
    assignedTechId,
    status
  });
  
  res.status(201).json({ message: 'Complaint registered successfully', request: newRequest });
});

app.get('/api/customer/requests', authenticateToken, requireRole(['customer']), (req, res) => {
  const data = db.getData();
  const customerRequests = data.requests.filter(r => r.customerId === req.user.id);
  
  const enriched = customerRequests.map(reqItem => {
    const technician = data.users.find(u => u.id === reqItem.assignedTechId) || null;
    const estimate = data.estimates.find(e => e.requestId === reqItem.id) || null;
    const invoice = data.invoices.find(i => i.requestId === reqItem.id) || null;
    const history = data.updates.filter(u => u.requestId === reqItem.id).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    return {
      ...reqItem,
      technicianName: technician ? technician.name : 'Unassigned',
      technicianPhone: technician ? technician.phone : '',
      estimate,
      invoice,
      history
    };
  });
  
  res.json(enriched);
});

// CUSTOMER ESTIMATE RESPONSE
app.post('/api/customer/estimate/respond', authenticateToken, requireRole(['customer']), (req, res) => {
  const { requestId, approve } = req.body;
  if (!requestId || approve === undefined) {
    return res.status(400).json({ error: 'Request ID and approval response are required' });
  }
  
  const data = db.getData();
  const request = data.requests.find(r => r.id === requestId && r.customerId === req.user.id);
  const estimate = data.estimates.find(e => e.requestId === requestId);
  
  if (!request) return res.status(404).json({ error: 'Service request not found' });
  if (!estimate) return res.status(404).json({ error: 'Estimate not found' });
  
  if (approve) {
    estimate.status = 'Approved';
    request.status = 'Approved';
    request.updatedAt = new Date().toISOString();
    
    addRequestUpdate(data, requestId, 'Approved', 'Estimate approved by customer.', 'Customer');
    
    // Automatically transition to Repair In Progress
    request.status = 'Repair In Progress';
    addRequestUpdate(data, requestId, 'Repair In Progress', 'Repair process started automatically after customer approval.', 'System');
  } else {
    estimate.status = 'Rejected';
    request.status = 'Closed';
    request.updatedAt = new Date().toISOString();
    
    addRequestUpdate(data, requestId, 'Closed', 'Estimate rejected by customer. Repair request cancelled.', 'Customer');
  }
  
  db.saveData(data);
  
  broadcast('ESTIMATE_RESPONSE', `Customer ${req.user.name} has ${approve ? 'APPROVED' : 'REJECTED'} the estimate for ${requestId}`, {
    requestId,
    approved: approve,
    status: request.status
  });
  
  res.json({ message: `Estimate response saved successfully. Status is now ${request.status}`, request });
});

// TECHNICIAN ENDPOINTS
app.get('/api/technician/requests', authenticateToken, requireRole(['technician', 'admin']), (req, res) => {
  const data = db.getData();
  const techRequests = data.requests.filter(r => r.assignedTechId === req.user.id);
  
  const enriched = techRequests.map(reqItem => {
    const customer = data.users.find(u => u.id === reqItem.customerId) || {};
    const estimate = data.estimates.find(e => e.requestId === reqItem.id) || null;
    const invoice = data.invoices.find(i => i.requestId === reqItem.id) || null;
    const history = data.updates.filter(u => u.requestId === reqItem.id).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    return {
      ...reqItem,
      customerName: customer.name || 'Unknown',
      customerPhone: customer.phone || '',
      customerAddress: customer.address || '',
      estimate,
      invoice,
      history
    };
  });
  
  res.json(enriched);
});

// TECHNICIAN SUBMIT ESTIMATE
app.post('/api/technician/estimate', authenticateToken, requireRole(['technician', 'admin']), (req, res) => {
  const { requestId, inspectionCharge, sparePartsCost, labourCharges, additionalCharges, notes } = req.body;
  
  if (!requestId) return res.status(400).json({ error: 'Request ID is required' });
  
  const data = db.getData();
  const request = data.requests.find(r => r.id === requestId && r.assignedTechId === req.user.id);
  if (!request) return res.status(404).json({ error: 'Service request not found or not assigned to you' });
  
  const inspect = parseFloat(inspectionCharge) || 0;
  const spares = parseFloat(sparePartsCost) || 0;
  const labour = parseFloat(labourCharges) || 0;
  const additional = parseFloat(additionalCharges) || 0;
  const total = inspect + spares + labour + additional;
  
  // Find or create estimate
  let estimate = data.estimates.find(e => e.requestId === requestId);
  if (estimate) {
    estimate.inspectionCharge = inspect;
    estimate.sparePartsCost = spares;
    estimate.labourCharges = labour;
    estimate.additionalCharges = additional;
    estimate.totalEstimate = total;
    estimate.notes = notes || '';
    estimate.status = 'Pending';
    estimate.updatedAt = new Date().toISOString();
  } else {
    estimate = {
      requestId,
      inspectionCharge: inspect,
      sparePartsCost: spares,
      labourCharges: labour,
      additionalCharges: additional,
      totalEstimate: total,
      notes: notes || '',
      status: 'Pending',
      updatedAt: new Date().toISOString()
    };
    data.estimates.push(estimate);
  }
  
  request.status = 'Waiting Customer Approval';
  request.updatedAt = new Date().toISOString();
  
  addRequestUpdate(data, requestId, 'Waiting Customer Approval', 'Technician completed inspection and uploaded service estimate.', 'Technician');
  
  db.saveData(data);

  // Send notifications to Customer
  const customer = data.users.find(u => u.id === request.customerId) || {};
  const customerPhone = customer.phone || 'N/A';
  const customerEmail = customer.email || 'N/A';

  // Send Customer Email
  const estimateMailHtml = mailService.buildEmailTemplate({
    title: 'Repair Service Estimate Uploaded',
    bodyHtml: `
      <p>Dear ${customer.name || 'Valued Customer'},</p>
      <p>The technician has completed the inspection of your TV and uploaded the service estimate for your approval:</p>
      <table class="details-table">
        <tr>
          <td class="label">Request ID</td>
          <td class="value">${requestId}</td>
        </tr>
        <tr>
          <td class="label">TV Details</td>
          <td class="value">${request.tvBrand} - ${request.tvModel}</td>
        </tr>
        <tr>
          <td class="label">Inspection Charge</td>
          <td class="value">₹${inspect.toFixed(2)}</td>
        </tr>
        <tr>
          <td class="label">Spare Parts Cost</td>
          <td class="value">₹${spares.toFixed(2)}</td>
        </tr>
        <tr>
          <td class="label">Labour Charges</td>
          <td class="value">₹${labour.toFixed(2)}</td>
        </tr>
        <tr>
          <td class="label">Additional Charges</td>
          <td class="value">₹${additional.toFixed(2)}</td>
        </tr>
        <tr>
          <td class="label">Total Estimate</td>
          <td class="value" style="font-weight: bold; color: #1e3a8a;">₹${total.toFixed(2)}</td>
        </tr>
        <tr>
          <td class="label">Technician Notes</td>
          <td class="value">${notes || 'N/A'}</td>
        </tr>
      </table>
      <p>Please log in to your customer dashboard to review and approve or reject this estimate so that the repair process can proceed.</p>
    `
  });

  mailService.sendMail({
    to: customerEmail,
    subject: `CSK Electronics - Service Estimate Uploaded for Request: ${requestId}`,
    html: estimateMailHtml
  }).catch(err => console.error("Error sending estimate email to customer:", err.message));

  // Send Customer SMS
  const estimateSmsMessage = `CSK Electronics Alert:\nAn estimate has been uploaded for request ${requestId}.\nTotal: Rs. ${total.toFixed(2)}.\nApprove: http://localhost:3000`;
  mailService.sendSimulatedSMS(customerPhone, estimateSmsMessage);
  
  broadcast('ESTIMATE_UPLOADED', `Estimate uploaded for Request ${requestId} by Technician ${req.user.name}. Total: Rs. ${total}`, {
    requestId,
    customerId: request.customerId,
    totalEstimate: total
  });
  
  res.json({ message: 'Estimate submitted successfully', estimate });
});

// TECHNICIAN MARK REPAIR COMPLETED & GENERATE BILL
app.post('/api/technician/complete', authenticateToken, requireRole(['technician', 'admin']), (req, res) => {
  const { requestId, finalInspectionCharge, finalSparePartsCost, finalLabourCharges, finalAdditionalCharges, technicianNotes } = req.body;
  if (!requestId) return res.status(400).json({ error: 'Request ID is required' });
  
  const data = db.getData();
  const request = data.requests.find(r => r.id === requestId && r.assignedTechId === req.user.id);
  if (!request) return res.status(404).json({ error: 'Service request not found or not assigned to you' });
  
  const inspect = parseFloat(finalInspectionCharge) || 0;
  const spares = parseFloat(finalSparePartsCost) || 0;
  const labour = parseFloat(finalLabourCharges) || 0;
  const additional = parseFloat(finalAdditionalCharges) || 0;
  const total = inspect + spares + labour + additional;
  
  // Set statuses
  request.status = 'Invoice Generated';
  request.updatedAt = new Date().toISOString();
  
  // Generate invoice number
  const invoiceNum = 'INV-' + (10000 + data.invoices.length + 1);
  
  const newInvoice = {
    id: invoiceNum,
    requestId,
    customerId: request.customerId,
    technicianId: req.user.id,
    inspectionCharge: inspect,
    sparePartsCost: spares,
    labourCharges: labour,
    additionalCharges: additional,
    totalAmount: total,
    notes: technicianNotes || 'TV repaired successfully.',
    customerSignature: null,   // filled when customer signs digitally
    signedAt: null,
    createdAt: new Date().toISOString()
  };
  
  data.invoices.push(newInvoice);
  
  addRequestUpdate(data, requestId, 'Repair Completed', 'Repair completed successfully.', req.user.name);
  addRequestUpdate(data, requestId, 'Invoice Generated', `Invoice ${invoiceNum} generated with total bill of Rs. ${total}.`, 'System');
  
  db.saveData(data);
  
  // Trigger invoice PDF generation and send email
  const customer = data.users.find(u => u.id === request.customerId) || {};
  const technician = data.users.find(u => u.id === request.assignedTechId) || null;
  const customerEmail = customer.email || 'cust1@csk.com';

  // Send Simulated SMS
  const smsMessage = `CSK Electronics Update:\nRepair for request ${requestId} has been completed.\nInvoice ${invoiceNum} generated (Total: Rs. ${total.toFixed(2)}).\nPlease sign digitally: http://localhost:3000`;
  mailService.sendSimulatedSMS(customer.phone || 'N/A', smsMessage);

  mailService.generateInvoicePDF(request, newInvoice, customer, technician).then(pdfBuffer => {
    const invoiceMailHtml = mailService.buildEmailTemplate({
      title: 'TV Repair Completed & Invoice Generated',
      bodyHtml: `
        <p>Dear ${customer.name || 'Valued Customer'},</p>
        <p>Great news! The service repair for your TV has been completed. A tax invoice has been generated for your reference.</p>
        <table class="details-table">
          <tr>
            <td class="label">Invoice Number</td>
            <td class="value" style="font-weight: bold;">${invoiceNum}</td>
          </tr>
          <tr>
            <td class="label">Request ID</td>
            <td class="value">${requestId}</td>
          </tr>
          <tr>
            <td class="label">TV Details</td>
            <td class="value">${request.tvBrand} - ${request.tvModel}</td>
          </tr>
          <tr>
            <td class="label">Total Billed</td>
            <td class="value" style="font-weight: bold; color: #10b981;">₹${total.toFixed(2)}</td>
          </tr>
        </table>
        <p>We have attached the official Tax Invoice PDF to this email. Please review it at your convenience.</p>
        <p>To finalize the invoice and download it from our website, you can also sign it digitally from your customer dashboard.</p>
      `
    });
    
    return mailService.sendMail({
      to: customerEmail,
      subject: `CSK Electronics - Repair Invoice ${invoiceNum} Generated`,
      html: invoiceMailHtml,
      attachments: [
        {
          filename: `${invoiceNum}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    });
  }).catch(err => {
    console.error("Error generating or sending completion invoice mail:", err.message);
  });
  
  broadcast('REPAIR_COMPLETED', `Repair completed and Invoice ${invoiceNum} generated for Request ${requestId}.`, {
    requestId,
    customerId: request.customerId,
    invoiceId: invoiceNum,
    totalAmount: total
  });
  
  res.json({ message: 'Repair marked completed and invoice generated successfully', invoice: newInvoice });
});

// GET SINGLE REQUEST FULL DETAIL (FOR INVOICES / REPORTS)
app.get('/api/requests/:id', authenticateToken, (req, res) => {
  const data = db.getData();
  const request = data.requests.find(r => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  
  // Check authorization (Admin can see all, Customer only their own, Tech only their assigned)
  if (req.user.role === 'customer' && request.customerId !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized access to this request' });
  }
  if (req.user.role === 'technician' && request.assignedTechId !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized access to this request' });
  }
  
  const customer = data.users.find(u => u.id === request.customerId) || {};
  const technician = data.users.find(u => u.id === request.assignedTechId) || null;
  const estimate = data.estimates.find(e => e.requestId === request.id) || null;
  const invoice = data.invoices.find(i => i.requestId === request.id) || null;
  const history = data.updates.filter(u => u.requestId === request.id).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  
  res.json({
    ...request,
    customerName: customer.name || 'Unknown',
    customerPhone: customer.phone || '',
    customerAddress: customer.address || '',
    technicianName: technician ? technician.name : 'Unassigned',
    technicianPhone: technician ? technician.phone : '',
    estimate,
    invoice,
    history
  });
});

// CLOSE SERVICE REQUEST
app.post('/api/requests/:id/close', authenticateToken, (req, res) => {
  const data = db.getData();
  const request = data.requests.find(r => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  
  // Check authorization (Admin can close all, Customer only their own request)
  if (req.user.role === 'customer' && request.customerId !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized access to this request' });
  }
  
  request.status = 'Closed';
  request.updatedAt = new Date().toISOString();
  
  addRequestUpdate(data, request.id, 'Closed', 'TV Service Job marked completed and closed by Customer.', req.user.name);
  db.saveData(data);
  
  broadcast('REQUEST_CLOSED', `Request ${request.id} has been closed by customer.`, {
    requestId: request.id,
    customerId: request.customerId,
    assignedTechId: request.assignedTechId,
    status: 'Closed'
  });
  
  res.json({ message: 'Request closed successfully', request });
});

// CUSTOMER DIGITAL SIGNATURE ON INVOICE
app.post('/api/invoice/:id/sign', authenticateToken, requireRole(['customer']), (req, res) => {
  const { signature } = req.body;
  if (!signature) return res.status(400).json({ error: 'Signature data is required' });
  
  const data = db.getData();
  const invoice = data.invoices.find(i => i.id === req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.customerId !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });
  
  invoice.customerSignature = signature;  // base64 PNG data URL
  invoice.signedAt = new Date().toISOString();
  db.saveData(data);
  
  // Send the signed invoice PDF to the customer
  const request = data.requests.find(r => r.id === invoice.requestId) || {};
  const technician = data.users.find(u => u.id === request.assignedTechId) || null;
  const customer = data.users.find(u => u.id === invoice.customerId) || req.user;

  mailService.generateInvoicePDF(request, invoice, customer, technician).then(pdfBuffer => {
    const signedInvoiceMailHtml = mailService.buildEmailTemplate({
      title: 'Digitally Signed Invoice Received',
      bodyHtml: `
        <p>Dear ${customer.name || 'Valued Customer'},</p>
        <p>Thank you for digitally signing the TV service invoice. We have attached the signed copy of your Tax Invoice PDF for your records.</p>
        <table class="details-table">
          <tr>
            <td class="label">Invoice Number</td>
            <td class="value" style="font-weight: bold;">${invoice.id}</td>
          </tr>
          <tr>
            <td class="label">Request ID</td>
            <td class="value">${invoice.requestId}</td>
          </tr>
          <tr>
            <td class="label">TV Details</td>
            <td class="value">${request.tvBrand || 'N/A'} - ${request.tvModel || 'N/A'}</td>
          </tr>
          <tr>
            <td class="label">Total Billed</td>
            <td class="value" style="font-weight: bold; color: #10b981;">₹${invoice.totalAmount.toFixed(2)}</td>
          </tr>
          <tr>
            <td class="label">Signed At</td>
            <td class="value">${new Date(invoice.signedAt).toLocaleString('en-IN')}</td>
          </tr>
        </table>
        <p>If you have any further questions or require additional support, feel free to contact us.</p>
      `
    });

    return mailService.sendMail({
      to: customer.email || 'cust@csk.com',
      subject: `CSK Electronics - Digitally Signed Invoice ${invoice.id}`,
      html: signedInvoiceMailHtml,
      attachments: [
        {
          filename: `${invoice.id}_Signed.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    });
  }).catch(err => {
    console.error("Error generating or sending signed invoice email:", err.message);
  });

  broadcast('INVOICE_SIGNED', `Customer ${req.user.name} has digitally signed Invoice ${invoice.id}.`, {
    invoiceId: invoice.id,
    requestId: invoice.requestId,
    customerId: invoice.customerId,
    technicianId: invoice.technicianId
  });
  
  res.json({ message: 'Signature saved successfully', invoice });
});

// START SERVER
app.listen(PORT, () => {
  console.log(`🚀 CSK Electronics backend running on http://localhost:${PORT}`);
  db.initDb();
});
