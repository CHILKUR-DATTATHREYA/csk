const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./db');

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
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access token missing' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
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
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }
  
  const data = db.getData();
  if (data.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: 'Email already registered' });
  }
  
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  
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
  
  res.status(201).json({ message: 'Registration successful' });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  const data = db.getData();
  const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(400).json({ error: 'Invalid email or password' });
  }
  
  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  
  res.json({
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

// ADMIN ASSIGN TECHNICIAN
app.post('/api/admin/assign', authenticateToken, requireRole(['admin']), (req, res) => {
  const { requestId, technicianId } = req.body;
  if (!requestId || !technicianId) {
    return res.status(400).json({ error: 'Request ID and Technician ID are required' });
  }
  
  const data = db.getData();
  const request = data.requests.find(r => r.id === requestId);
  const technician = data.users.find(u => u.id === technicianId && u.role === 'technician');
  
  if (!request) return res.status(404).json({ error: 'Service request not found' });
  if (!technician) return res.status(404).json({ error: 'Technician not found' });
  
  request.assignedTechId = technicianId;
  request.status = 'Assigned';
  request.updatedAt = new Date().toISOString();
  
  addRequestUpdate(data, requestId, 'Assigned', `Technician ${technician.name} manually assigned by Admin.`, 'Admin');
  db.saveData(data);
  
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
  
  // AUTOMATION: Try to automatically assign this complaint to the technician with the least active requests
  const technicians = data.users.filter(u => u.role === 'technician');
  let assignedTechId = null;
  let status = 'New';
  let logNote = 'Service complaint registered automatically.';
  
  if (technicians.length > 0) {
    // Count active repairs for each technician
    const techCounts = technicians.map(tech => {
      const activeJobs = data.requests.filter(r => 
        r.assignedTechId === tech.id && 
        !['Repair Completed', 'Invoice Generated', 'Closed'].includes(r.status)
      ).length;
      return { techId: tech.id, name: tech.name, count: activeJobs };
    });
    
    // Sort technicians by count of active jobs ascending
    techCounts.sort((a, b) => a.count - b.count);
    const assignedTech = techCounts[0];
    
    assignedTechId = assignedTech.techId;
    status = 'Assigned';
    logNote = `Complaint registered and automatically assigned to Technician ${assignedTech.name} (Active Jobs: ${assignedTech.count}) based on availability.`;
  }
  
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
app.get('/api/technician/requests', authenticateToken, requireRole(['technician']), (req, res) => {
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
app.post('/api/technician/estimate', authenticateToken, requireRole(['technician']), (req, res) => {
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
  
  broadcast('ESTIMATE_UPLOADED', `Estimate uploaded for Request ${requestId} by Technician ${req.user.name}. Total: Rs. ${total}`, {
    requestId,
    customerId: request.customerId,
    totalEstimate: total
  });
  
  res.json({ message: 'Estimate submitted successfully', estimate });
});

// TECHNICIAN MARK REPAIR COMPLETED & GENERATE BILL
app.post('/api/technician/complete', authenticateToken, requireRole(['technician']), (req, res) => {
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
    createdAt: new Date().toISOString()
  };
  
  data.invoices.push(newInvoice);
  
  addRequestUpdate(data, requestId, 'Repair Completed', 'Repair completed successfully.', 'Technician');
  addRequestUpdate(data, requestId, 'Invoice Generated', `Invoice ${invoiceNum} generated with total bill of Rs. ${total}.`, 'System');
  
  db.saveData(data);
  
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

// START SERVER
app.listen(PORT, () => {
  console.log(`🚀 CSK Electronics backend running on http://localhost:${PORT}`);
  db.initDb();
});
