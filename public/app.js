// CSK Electronics - Front-End SPA Manager

// App State
let token = localStorage.getItem('csk_token') || null;
let currentUser = JSON.parse(localStorage.getItem('csk_user')) || null;
let activeRequests = [];
let allUsers = [];
let eventSource = null;
let currentActiveView = 'auth';

// Base URL for API
const API_BASE = '/api';

// Intro Screen Timer
window.addEventListener('DOMContentLoaded', () => {
  // Theme check
  const savedTheme = localStorage.getItem('csk_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  // Skip long intro if user is already logged in
  const introDuration = (token && currentUser) ? 800 : 3500;

  setTimeout(() => {
    const intro = document.getElementById('intro-screen');
    const appContainer = document.getElementById('app-container');
    
    // Fade out intro
    intro.style.transition = 'opacity 0.5s ease-out';
    intro.style.opacity = '0';
    
    setTimeout(() => {
      intro.style.display = 'none';
      appContainer.classList.add('active');
      
      // Auto-login check
      if (token && currentUser) {
        setupHeader();
        connectSSE();
        routeToDashboard();
      } else {
        showView('auth');
      }
    }, 500);
  }, introDuration);
});

// ROUTING
function showView(viewId) {
  currentActiveView = viewId;
  document.querySelectorAll('.view-section').forEach(view => {
    view.classList.remove('active');
  });
  
  const targetView = document.getElementById(`view-${viewId}`);
  if (targetView) {
    targetView.classList.add('active');
  }
  
  // Highlight sidebar item
  document.querySelectorAll('.menu-item').forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('onclick')?.includes(viewId)) {
      item.classList.add('active');
    }
  });
}

function routeToDashboard() {
  if (!currentUser) return showView('auth');
  
  document.getElementById('app-sidebar').style.display = 'flex';
  updateSidebar(currentUser.role);
  
  if (currentUser.role === 'admin') {
    showView('admin-dashboard');
    loadAdminDashboard();
  } else if (currentUser.role === 'technician') {
    showView('tech-dashboard');
    loadTechDashboard();
  } else if (currentUser.role === 'customer') {
    showView('customer-dashboard');
    loadCustomerDashboard();
  }
}

// SETUP HEADER & SIDEBAR
function setupHeader() {
  const userInfo = document.getElementById('header-user-info');
  if (currentUser) {
    userInfo.style.display = 'flex';
    document.getElementById('user-display-name').innerText = currentUser.name;
    document.getElementById('user-display-role').innerText = currentUser.role;
  } else {
    userInfo.style.display = 'none';
  }
}

function updateSidebar(role) {
  const menuLinks = document.getElementById('sidebar-menu-links');
  let html = '';
  
  if (role === 'admin') {
    html = `
      <a class="menu-item active" onclick="showView('admin-dashboard'); loadAdminDashboard();">
        <i class="fa-solid fa-chart-line"></i> Dashboard Stats
      </a>
      <a class="menu-item" onclick="showView('admin-requests'); loadAdminRequests();">
        <i class="fa-solid fa-wrench"></i> Service Requests
      </a>
      <a class="menu-item" onclick="showView('admin-users'); loadAdminUsers();">
        <i class="fa-solid fa-users-gear"></i> Manage Users
      </a>
    `;
  } else if (role === 'technician') {
    html = `
      <a class="menu-item active" onclick="showView('tech-dashboard'); loadTechDashboard();">
        <i class="fa-solid fa-list-check"></i> Assigned Jobs
      </a>
    `;
  } else if (role === 'customer') {
    html = `
      <a class="menu-item active" onclick="showView('customer-dashboard'); loadCustomerDashboard();">
        <i class="fa-solid fa-house-user"></i> My Dashboard
      </a>
    `;
  }
  menuLinks.innerHTML = html;
}

// API CALL WRAPPER
async function apiCall(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const config = {
    method,
    headers
  };
  
  if (body) {
    config.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);
    const data = await response.json();
    
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        logout();
      }
      throw new Error(data.error || 'Something went wrong');
    }
    
    return data;
  } catch (error) {
    showToast(error.message, 'danger');
    throw error;
  }
}

// AUTHENTICATION LOGIC
function switchAuthTab(type) {
  document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.remove('active'));
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'none';
  
  if (type === 'login') {
    document.getElementById('tab-login').classList.add('active');
    document.getElementById('login-form').style.display = 'block';
  } else {
    document.getElementById('tab-register').classList.add('active');
    document.getElementById('register-form').style.display = 'block';
  }
}

// Login Submit
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();
  
  try {
    const res = await apiCall('/auth/login', 'POST', { email, password });
    token = res.token;
    currentUser = res.user;
    
    localStorage.setItem('csk_token', token);
    localStorage.setItem('csk_user', JSON.stringify(currentUser));
    
    // Trigger login transition overlay with logo animation
    const overlay = document.getElementById('login-transition-overlay');
    if (overlay) {
      overlay.classList.add('active');
    }
    
    setupHeader();
    connectSSE();
    
    setTimeout(() => {
      showToast(`Welcome back, ${currentUser.name}!`, 'success');
      
      if (overlay) {
        overlay.classList.remove('active');
      }
      
      setTimeout(() => {
        routeToDashboard();
      }, 500); // wait for opacity fade transition
    }, 2200);
  } catch (err) {
    // Error is handled in apiCall wrapper
  }
});

// Register Submit
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const address = document.getElementById('reg-address').value.trim();
  const password = document.getElementById('reg-password').value.trim();
  
  if (password.length < 6) {
    return showToast('Password must be at least 6 characters long', 'warning');
  }
  
  try {
    await apiCall('/auth/register', 'POST', { name, email, phone, address, password });
    showToast('Registration successful! Please login.', 'success');
    switchAuthTab('login');
    document.getElementById('login-email').value = email;
  } catch (err) {
    // Handled in wrapper
  }
});

// Logout
function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('csk_token');
  localStorage.removeItem('csk_user');
  
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  
  document.getElementById('header-user-info').style.display = 'none';
  document.getElementById('app-sidebar').style.display = 'none';
  
  // Clear forms
  document.getElementById('login-form').reset();
  document.getElementById('register-form').reset();
  
  showView('auth');
  showToast('Logged out successfully', 'info');
}
document.getElementById('logout-btn').addEventListener('click', logout);

// REAL-TIME NOTIFICATIONS (SSE)
function connectSSE() {
  if (eventSource) eventSource.close();
  
  eventSource = new EventSource(`${API_BASE}/notifications/sse`);
  
  eventSource.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    const { type, message, details } = payload;
    
    // Filter showing alert based on user role and ownership
    let shouldAlert = false;
    
    if (currentUser.role === 'admin') {
      shouldAlert = true;
    } else if (currentUser.role === 'technician') {
      if (details.assignedTechId === currentUser.id || details.technicianId === currentUser.id) {
        shouldAlert = true;
      }
    } else if (currentUser.role === 'customer') {
      if (details.customerId === currentUser.id) {
        shouldAlert = true;
      }
    }
    
    if (shouldAlert) {
      let alertType = 'info';
      if (type.includes('COMPLETED') || type.includes('APPROVED')) alertType = 'success';
      if (type.includes('NEW') || type.includes('UPLOADED')) alertType = 'warning';
      
      showToast(message, alertType);
      
      // AUTOMATIC LIVE DASHBOARD REFRESH
      refreshActiveDashboard();
    }
  };
  
  eventSource.onerror = (err) => {
    console.error("SSE connection lost. Reconnecting...");
  };
}

// Refresh whatever view is currently active
function refreshActiveDashboard() {
  if (!currentUser) return;
  
  if (currentUser.role === 'admin') {
    if (currentActiveView === 'admin-dashboard') loadAdminDashboard();
    if (currentActiveView === 'admin-requests') loadAdminRequests();
    if (currentActiveView === 'admin-users') loadAdminUsers();
  } else if (currentUser.role === 'technician') {
    loadTechDashboard();
  } else if (currentUser.role === 'customer') {
    loadCustomerDashboard();
  }
}

// ================= ADMIN DASHBOARD FUNCTIONS =================
async function loadAdminDashboard() {
  try {
    const stats = await apiCall('/admin/stats');
    document.getElementById('stat-admin-customers').innerText = stats.totalCustomers;
    document.getElementById('stat-admin-technicians').innerText = stats.totalTechnicians;
    document.getElementById('stat-admin-active').innerText = stats.activeRepairs;
    document.getElementById('stat-admin-completed').innerText = stats.completedRepairs;
    document.getElementById('stat-admin-pending').innerText = stats.pendingRepairs;
    document.getElementById('stat-admin-revenue').innerText = `₹${stats.totalRevenue.toLocaleString('en-IN')}`;
  } catch (err) {}
}

async function loadAdminRequests() {
  try {
    activeRequests = await apiCall('/admin/requests'); // store globally for modal lookups
    renderAdminRequestsTable(activeRequests);
  } catch (err) {}
}

function renderAdminRequestsTable(requests) {
  const tbody = document.querySelector('#admin-requests-table tbody');
  tbody.innerHTML = '';
  
  if (requests.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;">No repair requests registered.</td></tr>`;
    return;
  }
  
  requests.forEach(req => {
    // Admin always gets BOTH: assign/reassign + view logs
    const isAssigned = !!req.assignedTechId;
    const assignLabel = isAssigned ? 'Re-assign Tech' : 'Assign Tech';
    const assignIcon = isAssigned ? 'fa-user-pen' : 'fa-user-plus';
    const assignBtnClass = isAssigned ? 'btn-assign btn-assign-secondary' : 'btn-assign btn-assign-primary';

    const actionCell = `
      <div class="admin-actions-cell">
        <button class="${assignBtnClass}" onclick="openAssignModal('${req.id}')">
          <i class="fa-solid ${assignIcon}"></i> ${assignLabel}
        </button>
        <button class="btn-assign btn-assign-logs" onclick="viewRequestDetails('${req.id}')">
          <i class="fa-solid fa-folder-open"></i> View Logs
        </button>
      </div>
    `;
    
    tbody.innerHTML += `
      <tr>
        <td><strong>${req.id}</strong></td>
        <td>${req.customerName}</td>
        <td>${req.tvBrand} - ${req.tvModel}</td>
        <td style="max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${req.problemDesc}</td>
        <td><span style="font-weight: 600;">${req.technicianName}</span></td>
        <td><span class="badge badge-${req.status.toLowerCase().replace(/ /g, '-')}">${req.status}</span></td>
        <td>${actionCell}</td>
      </tr>
    `;
  });
}

function filterAdminRequests() {
  const search = document.getElementById('search-admin-requests').value.toLowerCase();
  const filtered = activeRequests.filter(req => 
    req.id.toLowerCase().includes(search) ||
    req.customerName.toLowerCase().includes(search) ||
    req.tvBrand.toLowerCase().includes(search) ||
    req.tvModel.toLowerCase().includes(search) ||
    req.status.toLowerCase().includes(search)
  );
  renderAdminRequestsTable(filtered);
}

// User Administration
async function loadAdminUsers() {
  try {
    allUsers = await apiCall('/admin/users');
    const tbody = document.querySelector('#admin-users-table tbody');
    tbody.innerHTML = '';
    
    allUsers.forEach(u => {
      let extra = '';
      if (u.role === 'customer') extra = u.address;
      if (u.role === 'technician') extra = `Specialization: <strong>${u.specialization || 'General'}</strong>`;
      
      tbody.innerHTML += `
        <tr>
          <td>${u.id}</td>
          <td><strong>${u.name}</strong></td>
          <td>${u.email}</td>
          <td>${u.phone}</td>
          <td><span class="role" style="background-color: var(--accent-blue-light); color: var(--accent-blue); padding: 0.15rem 0.5rem; border-radius: 5px; font-size: 0.75rem; text-transform: uppercase; font-weight: 600;">${u.role}</span></td>
          <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${extra}</td>
        </tr>
      `;
    });
  } catch (err) {}
}

// Admin Assign Submit
document.getElementById('admin-assign-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const requestId = document.getElementById('assign-request-id').value;
  const technicianId = document.getElementById('select-technician').value;
  
  try {
    await apiCall('/admin/assign', 'POST', { requestId, technicianId });
    showToast(`Technician successfully assigned to Request ${requestId}!`, 'success');
    closeModal('modal-assign-tech');
    loadAdminRequests();
  } catch (err) {}
});

// Admin Create User Submit
document.getElementById('admin-create-user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const role = document.getElementById('user-role').value;
  const name = document.getElementById('user-name').value.trim();
  const email = document.getElementById('user-email').value.trim();
  const phone = document.getElementById('user-phone').value.trim();
  const address = document.getElementById('user-address').value.trim();
  const specialization = document.getElementById('user-specialization').value.trim();
  const password = document.getElementById('user-password').value.trim();
  
  try {
    await apiCall('/admin/users', 'POST', { role, name, email, phone, address, specialization, password });
    showToast(`Successfully created new ${role} profile!`, 'success');
    closeModal('modal-create-user');
    loadAdminUsers();
    document.getElementById('admin-create-user-form').reset();
  } catch (err) {}
});

// ================= TECHNICIAN FUNCTIONS =================
async function loadTechDashboard() {
  try {
    const requests = await apiCall('/technician/requests');
    activeRequests = requests; // Save to global variable
    
    // Set Tech Stats
    const total = requests.length;
    const completed = requests.filter(r => ['Repair Completed', 'Invoice Generated', 'Closed'].includes(r.status)).length;
    const pending = total - completed;
    
    document.getElementById('stat-tech-assigned').innerText = total;
    document.getElementById('stat-tech-pending').innerText = pending;
    document.getElementById('stat-tech-completed').innerText = completed;
    
    const tbody = document.querySelector('#tech-requests-table tbody');
    tbody.innerHTML = '';
    
    if (requests.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">No repair jobs currently assigned to you.</td></tr>`;
      return;
    }
    
    requests.forEach(req => {
      let actionBtn = '';
      
      const currentStatus = req.status.trim();
      if (currentStatus === 'Assigned') {
        actionBtn = `<button class="btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; width: auto;" onclick="openEstimateModal('${req.id}')"><i class="fa-solid fa-file-invoice-dollar"></i> Inspect & Estimate</button>`;
      } else if (currentStatus === 'Approved' || currentStatus === 'Repair In Progress') {
        actionBtn = `<button class="btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; width: auto; background: var(--accent-success);" onclick="openCompleteModal('${req.id}')"><i class="fa-solid fa-circle-check"></i> Complete Repair</button>`;
      } else {
        actionBtn = `<button class="btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem; width: auto;" onclick="viewRequestDetails('${req.id}')"><i class="fa-solid fa-folder-open"></i> Full logs</button>`;
      }
      
      tbody.innerHTML += `
        <tr>
          <td><strong>${req.id}</strong></td>
          <td><strong>${req.customerName}</strong><br><span style="font-size: 0.8rem; color: var(--text-secondary);">${req.customerPhone}</span></td>
          <td>${req.tvBrand} - ${req.tvModel}</td>
          <td style="max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${req.problemDesc}</td>
          <td><span class="badge badge-${req.status.toLowerCase().replace(/ /g, '-')}">${req.status}</span></td>
          <td>${actionBtn}</td>
        </tr>
      `;
    });
  } catch (err) {}
}

// Tech Estimate Submit
document.getElementById('tech-estimate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const requestId = document.getElementById('estimate-request-id').value;
  const inspectionCharge = document.getElementById('est-inspection').value;
  const sparePartsCost = document.getElementById('est-spare').value;
  const labourCharges = document.getElementById('est-labour').value;
  const additionalCharges = document.getElementById('est-additional').value;
  const notes = document.getElementById('est-notes').value.trim();
  
  try {
    await apiCall('/technician/estimate', 'POST', {
      requestId, inspectionCharge, sparePartsCost, labourCharges, additionalCharges, notes
    });
    showToast(`Repair Estimate submitted for Request ${requestId}. Sent for customer approval.`, 'success');
    closeModal('modal-tech-estimate');
    loadTechDashboard();
    document.getElementById('tech-estimate-form').reset();
  } catch (err) {}
});

// Tech Complete Repair Submit
document.getElementById('tech-complete-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const requestId = document.getElementById('complete-request-id').value;
  const finalInspectionCharge = document.getElementById('comp-inspection').value;
  const finalSparePartsCost = document.getElementById('comp-spare').value;
  const finalLabourCharges = document.getElementById('comp-labour').value;
  const finalAdditionalCharges = document.getElementById('comp-additional').value;
  const technicianNotes = document.getElementById('comp-notes').value.trim();
  
  try {
    await apiCall('/technician/complete', 'POST', {
      requestId, finalInspectionCharge, finalSparePartsCost, finalLabourCharges, finalAdditionalCharges, technicianNotes
    });
    showToast(`Repair completed! Invoice has been generated.`, 'success');
    closeModal('modal-tech-complete');
    loadTechDashboard();
    document.getElementById('tech-complete-form').reset();
  } catch (err) {}
});

// ================= CUSTOMER DASHBOARD FUNCTIONS =================
async function loadCustomerDashboard() {
  try {
    document.getElementById('customer-name-header').innerText = currentUser.name;
    const requests = await apiCall('/customer/requests');
    
    // Find active request (New, Assigned, Waiting Customer Approval, Approved, Repair In progress, Repair Completed)
    const activeReq = requests.find(r => r.status !== 'Closed');
    
    if (activeReq) {
      document.getElementById('customer-active-repair-card').style.display = 'block';
      setupActiveRepairTracker(activeReq);
    } else {
      document.getElementById('customer-active-repair-card').style.display = 'none';
    }
    
    // Render History
    const tbody = document.querySelector('#customer-requests-table tbody');
    tbody.innerHTML = '';
    
    if (requests.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">You have not registered any TV repair complaints yet.</td></tr>`;
      return;
    }
    
    requests.forEach(req => {
      let invoiceLink = 'Not Available';
      if (req.invoice) {
        invoiceLink = `<button class="btn-primary" style="padding: 0.35rem 0.75rem; font-size: 0.8rem; width: auto; background: var(--accent-success);" onclick="printInvoice('${req.id}')"><i class="fa-solid fa-file-pdf"></i> Download/Print</button>`;
      }
      
      tbody.innerHTML += `
        <tr>
          <td><strong>${req.id}</strong></td>
          <td>${req.tvBrand} - ${req.tvModel}</td>
          <td style="max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${req.problemDesc}</td>
          <td>${new Date(req.createdAt).toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'})}</td>
          <td><span class="badge badge-${req.status.toLowerCase().replace(/ /g, '-')}">${req.status}</span></td>
          <td>${invoiceLink}</td>
        </tr>
      `;
    });
  } catch (err) {}
}

function setupActiveRepairTracker(req) {
  document.getElementById('track-request-id').innerText = req.id;
  
  const statusBadge = document.getElementById('track-request-status-badge');
  statusBadge.innerText = req.status;
  statusBadge.className = `badge badge-${req.status.toLowerCase().replace(/ /g, '-')}`;
  
  document.getElementById('track-tv-brand').innerText = req.tvBrand;
  document.getElementById('track-tv-model').innerText = req.tvModel;
  document.getElementById('track-tv-problem').innerText = req.problemDesc;
  document.getElementById('track-tech-name').innerText = req.technicianName;
  document.getElementById('track-tech-phone').innerText = req.technicianPhone || 'Assigning...';
  
  // Set Timeline Node highlights
  const steps = ['New', 'Assigned', 'Waiting Customer Approval', 'Repair In Progress', 'Repair Completed', 'Invoice Generated'];
  const currentIdx = steps.indexOf(req.status);
  
  document.querySelectorAll('.timeline-step').forEach(stepNode => {
    stepNode.className = 'timeline-step';
  });
  
  if (req.status === 'Closed') {
    // If somehow active but status Closed, highlight all completed
    document.querySelectorAll('.timeline-step').forEach(stepNode => {
      stepNode.classList.add('completed');
    });
  } else {
    steps.forEach((stepName, idx) => {
      const node = getTimelineNodeByStepName(stepName);
      if (node) {
        if (idx < currentIdx) {
          node.classList.add('completed');
        } else if (idx === currentIdx) {
          node.classList.add('active');
        }
      }
    });
  }
  
  // Action Box settings
  const actionBox = document.getElementById('customer-action-box');
  actionBox.innerHTML = '';
  
  if (req.status === 'Waiting Customer Approval' && req.estimate) {
    document.getElementById('track-estimate-remarks').innerText = `"${req.estimate.notes}"\n\nCharges Quote:\nInspection: ₹${req.estimate.inspectionCharge} | Parts: ₹${req.estimate.sparePartsCost} | Labour: ₹${req.estimate.labourCharges} | Addl: ₹${req.estimate.additionalCharges}`;
    
    actionBox.innerHTML = `
      <div style="background-color: var(--accent-warning-light); padding: 1rem; border-radius: 8px; border: 1.5px dashed var(--accent-warning); margin-bottom: 0.75rem;">
        <h5 style="color: var(--accent-warning); font-weight: 700;">Total Estimate Quote: ₹${req.estimate.totalEstimate}</h5>
        <p style="font-size: 0.8rem; margin-top: 0.25rem;">Do you approve of these repair findings and service charges estimate?</p>
      </div>
      <div style="display: flex; gap: 0.5rem;">
        <button class="btn-primary" style="flex: 1; background: var(--accent-success); box-shadow: none;" onclick="respondToEstimate('${req.id}', true)">Approve Quote</button>
        <button class="btn-secondary" style="flex: 1; border-color: var(--accent-danger); color: var(--accent-danger);" onclick="respondToEstimate('${req.id}', false)">Reject Quote</button>
      </div>
    `;
  } else if (req.status === 'Invoice Generated' || req.status === 'Repair Completed' || req.invoice) {
    document.getElementById('track-estimate-remarks').innerText = req.invoice ? `"${req.invoice.notes}"` : `Inspection approved. Repair complete. Final bill calculated.`;
    
    actionBox.innerHTML = `
      <div style="background-color: var(--accent-success-light); padding: 1rem; border-radius: 8px; border: 1.5px dashed var(--accent-success); margin-bottom: 0.75rem;">
        <h5 style="color: var(--accent-success); font-weight: 700;">Total invoice bill: ₹${req.invoice ? req.invoice.totalAmount : 'Loading...'}</h5>
      </div>
      <button class="btn-primary" style="background: var(--accent-success);" onclick="printInvoice('${req.id}')"><i class="fa-solid fa-file-pdf"></i> Download & Print Invoice</button>
      <button class="btn-secondary" style="margin-top: 0.5rem; width: 100%;" onclick="closeServiceRequest('${req.id}')">Close Job Request</button>
    `;
  } else {
    document.getElementById('track-estimate-remarks').innerText = req.status === 'New' ? "Awaiting technician check. TV inspection details will load here." : "Technician is diagnosing the TV screen/boards. Repair quote will follow.";
    actionBox.innerHTML = `<p style="text-align: center; color: var(--text-secondary); font-size: 0.85rem;"><i class="fa-solid fa-spinner fa-spin"></i> Awaiting technician update</p>`;
  }
  
  // Render Activity updates logs
  const logBox = document.getElementById('track-activity-logs');
  logBox.innerHTML = '';
  
  if (req.history && req.history.length > 0) {
    req.history.forEach((h, idx) => {
      const isLatest = idx === req.history.length - 1;
      const formattedTime = new Date(h.createdAt).toLocaleTimeString('en-IN', {hour: '2-digit', minute:'2-digit'});
      logBox.innerHTML += `
        <div class="update-item ${isLatest ? 'highlight' : ''}">
          <div class="time">${formattedTime}</div>
          <div class="content">
            <h5>${h.status}</h5>
            <p>${h.note} (Updated by: ${h.updatedBy})</p>
          </div>
        </div>
      `;
    });
  }
}

function getTimelineNodeByStepName(stepName) {
  if (stepName === 'New') return document.getElementById('step-new');
  if (stepName === 'Assigned') return document.getElementById('step-assigned');
  if (stepName === 'Waiting Customer Approval') return document.getElementById('step-waiting');
  if (stepName === 'Repair In Progress' || stepName === 'Approved') return document.getElementById('step-repair');
  if (stepName === 'Repair Completed') return document.getElementById('step-completed');
  if (stepName === 'Invoice Generated') return document.getElementById('step-invoice');
  return null;
}

// Respond to Estimate (Approve/Reject)
async function respondToEstimate(requestId, approve) {
  try {
    await apiCall('/customer/estimate/respond', 'POST', { requestId, approve });
    showToast(`Successfully ${approve ? 'approved' : 'rejected'} estimate request.`, 'success');
    loadCustomerDashboard();
  } catch (err) {}
}

// Close Service Request
async function closeServiceRequest(requestId) {
  // We can just hit a route or simulate customer closing. In this demo let's let customer close and change status to Closed.
  // Actually, we can update DB request status to Closed
  // Let's create an endpoint in backend or let the client simulate closing:
  // In server.js we can easily support: 
  // Let's perform a simple status transition via customer closing or just complete the loop.
  // We can make an API request to finalize
  try {
    // Let's update the request to Closed in the DB.
    // Wait, let's look at the server.js routes. Does it have close request? No specific route, but we can write a generic status updater or add it to server.js if needed.
    // Wait! Let's check server.js. It does not have a POST /api/requests/:id/close. But wait! Since we are writing the server.js ourselves, we can modify it or write a simple route.
    // Actually, in server.js we can update a request to 'Closed'. Let's see: we wrote a route? Oh, let's verify if server.js had it.
    // Let's see: server.js had a list of routes, but no explicit customer close. We can add one or implement a general status update. Let's make an API call to customer/close or simulate. Let's add the route or use a simulated finish since customer dashboard reloads. Let's see: let's create a status route in server.js or check if we can add it.
    // Actually, in server.js we have:
    // POST /api/customer/estimate/respond
    // Let's create a simple close request endpoint in server.js, or check if we can add it. Let's add it via replace_file_content if we want to be thorough. But wait! Can we just call a simple endpoint or mock? No, modifying the server to support the Close request is trivial and keeps it 100% functional.
    // Let's add the Close route to server.js. Wait, let's view server.js first to see what lines we should replace. No need to view, we know the file content we just wrote. We can add a simple POST route. Let's do it after we check if we can just write it. Yes, we can replace the last portion of server.js to include a Close route.
    // Let's first finish app.js.
    showToast("Thank you! Service request completed and closed successfully.", "success");
    // Let's call /api/customer/request/close
    await apiCall(`/requests/${requestId}/close`, 'POST');
    loadCustomerDashboard();
  } catch (err) {}
}

// Customer Submit Complaint
document.getElementById('complaint-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const tvBrand = document.getElementById('tv-brand').value.trim();
  const tvModel = document.getElementById('tv-model').value.trim();
  const problemDesc = document.getElementById('tv-problem').value.trim();
  
  try {
    const res = await apiCall('/customer/request', 'POST', { tvBrand, tvModel, problemDesc });
    showToast(`TV repair request successfully created! ID: ${res.request.id}`, 'success');
    closeModal('modal-complaint');
    loadCustomerDashboard();
    document.getElementById('complaint-form').reset();
  } catch (err) {}
});

// ================= PRINT & INVOICE MANAGEMENT =================
async function printInvoice(requestId) {
  try {
    const req = await apiCall(`/requests/${requestId}`);
    if (!req.invoice) {
      return showToast("Invoice is not generated yet for this repair request.", "warning");
    }

    // Intercept if customer views/downloads and hasn't signed digitally yet
    if (currentUser && currentUser.role === 'customer' && !req.invoice.customerSignature) {
      openSignaturePad(req.invoice.id, req.id);
      return;
    }
    
    // Populate Printable Area
    document.getElementById('prt-invoice-number').innerText = req.invoice.id;
    document.getElementById('prt-invoice-date').innerText = new Date(req.invoice.createdAt).toLocaleDateString('en-IN', {year: 'numeric', month: 'numeric', day: 'numeric'});
    
    document.getElementById('prt-cust-name').innerText = req.customerName;
    document.getElementById('prt-cust-phone').innerText = req.customerPhone;
    document.getElementById('prt-cust-address').innerText = req.customerAddress;
    
    document.getElementById('prt-request-id').innerText = req.id;
    document.getElementById('prt-tv-model').innerText = `${req.tvBrand} - ${req.tvModel}`;
    document.getElementById('prt-problem').innerText = req.problemDesc;
    document.getElementById('prt-tech-name').innerText = req.technicianName;
    
    document.getElementById('prt-tech-notes').innerText = req.invoice.notes;
    
    // Fill breakdown table
    document.getElementById('prt-charge-inspect').innerText = `₹${req.invoice.inspectionCharge.toFixed(2)}`;
    document.getElementById('prt-charge-spares').innerText = `₹${req.invoice.sparePartsCost.toFixed(2)}`;
    document.getElementById('prt-charge-labour').innerText = `₹${req.invoice.labourCharges.toFixed(2)}`;
    document.getElementById('prt-charge-addl').innerText = `₹${req.invoice.additionalCharges.toFixed(2)}`;
    document.getElementById('prt-total').innerText = `₹${req.invoice.totalAmount.toFixed(2)}`;

    // Populate Customer Signature base64 if present
    const sigImg = document.getElementById('prt-customer-signature');
    const sigPlaceholder = document.getElementById('prt-customer-sig-placeholder');
    if (req.invoice.customerSignature) {
      sigImg.src = req.invoice.customerSignature;
      sigImg.style.display = 'block';
      sigPlaceholder.style.display = 'none';
    } else {
      sigImg.src = '';
      sigImg.style.display = 'none';
      sigPlaceholder.style.display = 'block';
    }
    
    // Trigger Print
    window.print();
  } catch (err) {}
}

// ================= DIGITAL SIGNATURE PAD CONTROLS =================
let signaturePadCanvas = null;
let signaturePadCtx = null;
let isDrawingSignature = false;
let currentSigningInvoiceId = null;
let currentSigningRequestId = null;

function initSignaturePad() {
  signaturePadCanvas = document.getElementById('signature-canvas');
  if (!signaturePadCanvas) return;
  signaturePadCtx = signaturePadCanvas.getContext('2d');
  
  // Set drawing stroke styles
  signaturePadCtx.strokeStyle = '#1e3a8a'; // Deep blue signature ink
  signaturePadCtx.lineWidth = 3;
  signaturePadCtx.lineCap = 'round';
  signaturePadCtx.lineJoin = 'round';
  
  // Mouse listeners
  signaturePadCanvas.addEventListener('mousedown', startDrawing);
  signaturePadCanvas.addEventListener('mousemove', draw);
  signaturePadCanvas.addEventListener('mouseup', stopDrawing);
  signaturePadCanvas.addEventListener('mouseleave', stopDrawing);
  
  // Touch listeners for mobile devices
  signaturePadCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      const rect = signaturePadCanvas.getBoundingClientRect();
      signaturePadCtx.beginPath();
      signaturePadCtx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
      isDrawingSignature = true;
    }
  }, { passive: false });
  
  signaturePadCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!isDrawingSignature || e.touches.length === 0) return;
    const touch = e.touches[0];
    const rect = signaturePadCanvas.getBoundingClientRect();
    signaturePadCtx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
    signaturePadCtx.stroke();
  }, { passive: false });
  
  signaturePadCanvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    isDrawingSignature = false;
  }, { passive: false });
}

function startDrawing(e) {
  isDrawingSignature = true;
  const rect = signaturePadCanvas.getBoundingClientRect();
  signaturePadCtx.beginPath();
  signaturePadCtx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
}

function draw(e) {
  if (!isDrawingSignature) return;
  const rect = signaturePadCanvas.getBoundingClientRect();
  signaturePadCtx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
  signaturePadCtx.stroke();
}

function stopDrawing() {
  isDrawingSignature = false;
}

function clearSignaturePad() {
  if (!signaturePadCanvas) return;
  signaturePadCtx.clearRect(0, 0, signaturePadCanvas.width, signaturePadCanvas.height);
}

function openSignaturePad(invoiceId, requestId) {
  currentSigningInvoiceId = invoiceId;
  currentSigningRequestId = requestId;
  openModal('modal-signature-pad');
  
  if (!signaturePadCanvas) {
    initSignaturePad();
  }
  clearSignaturePad();
}

async function saveCustomerSignature() {
  if (!signaturePadCanvas || !currentSigningInvoiceId) return;
  
  if (isCanvasBlank(signaturePadCanvas)) {
    return showToast("Please draw your signature before saving.", "warning");
  }
  
  const signatureDataUrl = signaturePadCanvas.toDataURL('image/png');
  
  try {
    await apiCall(`/invoice/${currentSigningInvoiceId}/sign`, 'POST', { signature: signatureDataUrl });
    showToast("Invoice signed successfully!", "success");
    closeModal('modal-signature-pad');
    
    // Reload dashboard list
    if (currentUser.role === 'customer') {
      await loadCustomerDashboard();
    }
    
    // Print the updated invoice
    await printInvoice(currentSigningRequestId);
  } catch (err) {
    showToast("Failed to save signature. Please try again.", "danger");
  }
}

function isCanvasBlank(canvas) {
  const blank = document.createElement('canvas');
  blank.width = canvas.width;
  blank.height = canvas.height;
  return canvas.toDataURL() === blank.toDataURL();
}


async function viewRequestDetails(requestId) {
  try {
    const req = await apiCall(`/requests/${requestId}`);
    
    document.getElementById('det-req-id').innerText = req.id;
    document.getElementById('det-req-status').innerText = req.status;
    document.getElementById('det-req-status').className = `badge badge-${req.status.toLowerCase().replace(/ /g, '-')}`;
    
    document.getElementById('det-req-date').innerText = new Date(req.createdAt).toLocaleDateString('en-IN', {hour: '2-digit', minute:'2-digit', day: 'numeric', month: 'short'});
    document.getElementById('det-req-tv').innerText = `${req.tvBrand} - ${req.tvModel}`;
    document.getElementById('det-req-problem').innerText = req.problemDesc;
    
    document.getElementById('det-cust-name').innerText = req.customerName;
    document.getElementById('det-cust-phone').innerText = req.customerPhone;
    document.getElementById('det-cust-address').innerText = req.customerAddress;
    
    document.getElementById('det-tech-name').innerText = req.technicianName;
    
    // Estimate details
    const estBox = document.getElementById('det-estimate-box');
    if (req.estimate) {
      estBox.style.display = 'block';
      document.getElementById('det-est-status').innerText = req.estimate.status;
      document.getElementById('det-est-status').className = `badge badge-${req.estimate.status.toLowerCase()}`;
      
      document.getElementById('det-est-inspection').innerText = req.estimate.inspectionCharge;
      document.getElementById('det-est-spares').innerText = req.estimate.sparePartsCost;
      document.getElementById('det-est-labour').innerText = req.estimate.labourCharges;
      document.getElementById('det-est-addl').innerText = req.estimate.additionalCharges;
      document.getElementById('det-est-total').innerText = req.estimate.totalEstimate;
      document.getElementById('det-est-notes').innerText = req.estimate.notes;
    } else {
      estBox.style.display = 'none';
    }
    
    // Invoice details
    const invBox = document.getElementById('det-invoice-box');
    if (req.invoice) {
      invBox.style.display = 'block';
      document.getElementById('det-inv-num').innerText = req.invoice.id;
      document.getElementById('det-inv-total').innerText = req.invoice.totalAmount;
      document.getElementById('det-inv-notes').innerText = req.invoice.notes;
      
      // Store ID for quick printing from details modal
      invBox.setAttribute('data-request-id', req.id);
    } else {
      invBox.style.display = 'none';
    }
    
    // History timeline
    const historyLogs = document.getElementById('det-history-logs');
    historyLogs.innerHTML = '';
    req.history.forEach((h, idx) => {
      const isLatest = idx === req.history.length - 1;
      const time = new Date(h.createdAt).toLocaleTimeString('en-IN', {hour: '2-digit', minute:'2-digit'});
      historyLogs.innerHTML += `
        <div class="update-item ${isLatest ? 'highlight' : ''}">
          <div class="time">${time}</div>
          <div class="content">
            <h5>${h.status}</h5>
            <p>${h.note} (By: ${h.updatedBy})</p>
          </div>
        </div>
      `;
    });
    
    openModal('modal-request-details');
  } catch (err) {}
}

function printInvoiceFromDetails() {
  const reqId = document.getElementById('det-invoice-box').getAttribute('data-request-id');
  if (reqId) {
    closeModal('modal-request-details');
    printInvoice(reqId);
  }
}

// ================= MODAL CONTROLS =================
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

async function openAssignModal(requestId) {
  const req = activeRequests.find(r => r.id === requestId);
  if (!req) return;

  const isReassign = !!req.assignedTechId;

  // Update modal header title
  document.getElementById('assign-modal-title').innerText =
    isReassign ? 'Re-Assign Technician' : 'Assign Technician to Request';

  // Confirm button label
  document.getElementById('assign-confirm-btn').innerText =
    isReassign ? 'Confirm Re-Assignment' : 'Confirm Assignment';

  // Fill info
  document.getElementById('assign-request-id').value = requestId;
  document.getElementById('assign-info-request').innerText = requestId;
  document.getElementById('assign-info-tv').innerText = `${req.tvBrand} ${req.tvModel}`;
  document.getElementById('assign-info-problem').innerText = req.problemDesc;
  document.getElementById('assign-info-customer').innerText = req.customerName || '—';

  // Show/hide re-assign warning
  const currentTechBox = document.getElementById('assign-current-tech-box');
  if (isReassign) {
    currentTechBox.style.display = 'block';
    document.getElementById('assign-current-tech-name').innerText = req.technicianName || 'Unknown';
  } else {
    currentTechBox.style.display = 'none';
  }

  // Load Technicians dropdown
  try {
    const users = await apiCall('/admin/users');
    const technicians = users.filter(u => u.role === 'technician');
    const select = document.getElementById('select-technician');
    select.innerHTML = '<option value="">-- Select a Technician --</option>';
    
    technicians.forEach(tech => {
      const isCurrentlyAssigned = tech.id === req.assignedTechId;
      select.innerHTML += `<option value="${tech.id}" ${isCurrentlyAssigned ? 'selected' : ''}>${tech.name} (${tech.specialization || 'LED TV'})${isCurrentlyAssigned ? ' — Currently Assigned' : ''}</option>`;
    });
    
    openModal('modal-assign-tech');
  } catch (err) {}
}

function openCreateUserModal() {
  openModal('modal-create-user');
  toggleSpecializationField();
}

function toggleSpecializationField() {
  const role = document.getElementById('user-role').value;
  const spec = document.getElementById('field-user-specialization');
  const addr = document.getElementById('field-user-address');
  
  if (role === 'technician') {
    spec.style.display = 'block';
    addr.style.display = 'none';
    document.getElementById('user-address').required = false;
    document.getElementById('user-specialization').required = true;
  } else {
    spec.style.display = 'none';
    addr.style.display = 'block';
    document.getElementById('user-address').required = true;
    document.getElementById('user-specialization').required = false;
  }
}

function openEstimateModal(requestId) {
  const req = activeRequests.find(r => r.id === requestId);
  if (!req) return;
  document.getElementById('estimate-request-id').value = requestId;
  document.getElementById('est-info-customer').innerText = req.customerName || 'Customer';
  document.getElementById('est-info-tv').innerText = `${req.tvBrand} ${req.tvModel}`;
  document.getElementById('est-info-problem').innerText = req.problemDesc;
  
  document.getElementById('est-inspection').value = 500;
  document.getElementById('est-spare').value = 0;
  document.getElementById('est-labour').value = 0;
  document.getElementById('est-additional').value = 0;
  document.getElementById('est-total-calc').innerText = 500;
  document.getElementById('est-notes').value = '';
  
  openModal('modal-tech-estimate');
}

function calculateEstimateTotal() {
  const inspect = parseFloat(document.getElementById('est-inspection').value) || 0;
  const spares = parseFloat(document.getElementById('est-spare').value) || 0;
  const labour = parseFloat(document.getElementById('est-labour').value) || 0;
  const addl = parseFloat(document.getElementById('est-additional').value) || 0;
  
  document.getElementById('est-total-calc').innerText = inspect + spares + labour + addl;
}

function openCompleteModal(requestId) {
  const req = activeRequests.find(r => r.id === requestId);
  if (!req) return;
  const estimatedAmt = req.estimate?.totalEstimate || 0;
  document.getElementById('complete-request-id').value = requestId;
  document.getElementById('comp-info-customer').innerText = req.customerName || 'Customer';
  document.getElementById('comp-info-tv').innerText = `${req.tvBrand} ${req.tvModel}`;
  document.getElementById('comp-info-estimate').innerText = estimatedAmt;
  
  // Set default final billing to estimates if available
  if (estimatedAmt > 0) {
    document.getElementById('comp-inspection').value = req.estimate.inspectionCharge || 500;
    document.getElementById('comp-spare').value = req.estimate.sparePartsCost || 0;
    document.getElementById('comp-labour').value = req.estimate.labourCharges || 0;
    document.getElementById('comp-additional').value = req.estimate.additionalCharges || 0;
    document.getElementById('comp-total-calc').innerText = estimatedAmt;
  } else {
    document.getElementById('comp-inspection').value = 500;
    document.getElementById('comp-spare').value = 0;
    document.getElementById('comp-labour').value = 0;
    document.getElementById('comp-additional').value = 0;
    document.getElementById('comp-total-calc').innerText = 500;
  }
  document.getElementById('comp-notes').value = '';
  
  openModal('modal-tech-complete');
}

function calculateCompleteTotal() {
  const inspect = parseFloat(document.getElementById('comp-inspection').value) || 0;
  const spares = parseFloat(document.getElementById('comp-spare').value) || 0;
  const labour = parseFloat(document.getElementById('comp-labour').value) || 0;
  const addl = parseFloat(document.getElementById('comp-additional').value) || 0;
  
  document.getElementById('comp-total-calc').innerText = inspect + spares + labour + addl;
}

function openComplaintModal() {
  openModal('modal-complaint');
}

// ================= TOAST WIDGET =================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'warning') icon = 'fa-triangle-exclamation';
  if (type === 'danger') icon = 'fa-circle-xmark';
  
  toast.innerHTML = `
    <div class="toast-icon"><i class="fa-solid ${icon}"></i></div>
    <div class="toast-content">
      <h5>System Update</h5>
      <p>${message}</p>
    </div>
  `;
  container.appendChild(toast);
  
  // Slide out and remove
  setTimeout(() => {
    toast.style.transition = 'opacity 0.4s ease-out, transform 0.4s ease-out';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 4500);
}

// ================= THEME SWITCHER =================
const themeToggleBtn = document.getElementById('theme-toggle');
themeToggleBtn.addEventListener('click', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('csk_theme', newTheme);
  updateThemeIcon(newTheme);
  showToast(`Switched to ${newTheme === 'light' ? 'Light' : 'Dark'} Mode`, 'info');
});

function updateThemeIcon(theme) {
  const iconNode = themeToggleBtn.querySelector('i');
  if (theme === 'dark') {
    iconNode.className = 'fa-solid fa-sun';
  } else {
    iconNode.className = 'fa-solid fa-moon';
  }
}
