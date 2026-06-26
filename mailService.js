const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const db = require('./db');

// Build a Nodemailer transporter from saved emailConfig
function getTransporter() {
  const data = db.getData();
  const config = data.emailConfig || {};

  const host = config.smtpHost || 'smtp.gmail.com';
  const port = parseInt(config.smtpPort) || 587;
  // Port 465 = SSL/TLS (secure:true) | Port 587 = STARTTLS (secure:false)
  const secure = port === 465 ? true : false;
  const user = config.smtpUser || '';
  const pass = config.smtpPass || '';

  console.log(`📧 [SMTP] host=${host} port=${port} secure=${secure} user=${user || 'MISSING'}`);

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    tls: { rejectUnauthorized: false }
  });
}

// Send email via Nodemailer
async function sendMail({ to, subject, html, attachments }) {
  try {
    const data = db.getData();
    const config = data.emailConfig || {};

    // No credentials → log mock only
    if (!config.smtpUser || !config.smtpPass) {
      console.log(`\n✉️  [MOCK] No SMTP credentials. Email NOT sent.`);
      console.log(`   To: ${to} | Subject: ${subject}`);
      console.log(`   → Save Gmail + App Password in Admin > Email Settings\n`);
      return { messageId: 'mock-' + Date.now() };
    }

    // GMAIL CRITICAL FIX:
    // Gmail SMTP rejects the "From" header if it doesn't match the authenticated account.
    // If host contains "gmail", always use smtpUser as the sender address.
    const isGmail = (config.smtpHost || '').toLowerCase().includes('gmail');
    const from = isGmail
      ? `CSK Electronics <${config.smtpUser}>`
      : (config.defaultFrom || `CSK Electronics <${config.smtpUser}>`);

    const transporter = getTransporter();

    // Verify connection before sending — gives clear error early
    await transporter.verify().catch(err => {
      let hint = '';
      const msg = err.message || '';
      if (msg.includes('535') || msg.includes('Username and Password not accepted')) {
        hint = '\n   HINT: Wrong App Password. Generate a new one at https://myaccount.google.com/apppasswords';
      } else if (msg.includes('534') || msg.includes('Application-specific password required')) {
        hint = '\n   HINT: Enable 2-Step Verification on your Google Account first, then generate an App Password.';
      } else if (msg.includes('ECONNREFUSED')) {
        hint = '\n   HINT: Connection refused. Confirm host=smtp.gmail.com and port=587.';
      } else if (msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET')) {
        hint = '\n   HINT: Connection timed out. Check firewall/antivirus blocking port 587.';
      }
      console.error(`❌ [SMTP VERIFY FAILED] ${msg}${hint}`);
      throw new Error(`Cannot connect to Gmail SMTP: ${msg}${hint}`);
    });

    const info = await transporter.sendMail({ from, to, subject, html, attachments });
    console.log(`✅ [EMAIL SENT] To: ${to} | Subject: ${subject} | MsgID: ${info.messageId}`);
    return info;

  } catch (error) {
    console.error(`❌ [EMAIL ERROR] To: ${to} | Error: ${error.message}`);
    throw error;
  }
}

// Generate PDF invoice using pdfkit
function generateInvoicePDF(request, invoice, customer, technician) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      let buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      // Header
      doc.fontSize(22).fillColor('#1e3a8a').text('CSK ELECTRONICS SERVICES', { align: 'center' });
      doc.fontSize(10).fillColor('#475569').text('Expert TV Repair, Spares & Board Services', { align: 'center' });
      doc.text('1800-456-7890 | support@cskelectronics.com', { align: 'center' });
      doc.moveDown(1.5);

      doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#cbd5e1').stroke();
      doc.moveDown(1.5);

      // Invoice meta
      doc.fontSize(14).fillColor('#0f172a').text(`TAX INVOICE: ${invoice.id}`, { underline: true });
      doc.fontSize(10).fillColor('#334155');
      doc.text(`Date: ${new Date(invoice.createdAt).toLocaleDateString('en-IN')}`);
      doc.text(`Request ID: ${request.id}`);
      doc.text(`Status: Repair Completed & Closed`);
      doc.moveDown(1);

      // Customer + Tech Info
      const yPos = doc.y;
      doc.fontSize(12).fillColor('#1e3a8a').text('Customer Information', 50, yPos);
      doc.fontSize(10).fillColor('#334155');
      doc.text(`Name: ${customer.name || 'Unknown'}`);
      doc.text(`Phone: ${customer.phone || 'N/A'}`);
      doc.text(`Address: ${customer.address || 'N/A'}`);

      doc.fontSize(12).fillColor('#1e3a8a').text('Technician Information', 320, yPos);
      doc.fontSize(10).fillColor('#334155');
      doc.text(`Name: ${technician ? technician.name : 'CSK Admin'}`);
      doc.text(`Phone: ${technician ? technician.phone : '1800-456-7890'}`);
      doc.text(`Email: ${technician ? technician.email : 'admin@csk.com'}`);
      doc.moveDown(2);

      // Repair Info
      doc.fontSize(12).fillColor('#1e3a8a').text('Hardware / Repair Information', 50);
      doc.fontSize(10).fillColor('#334155');
      doc.text(`TV Model/Brand: ${request.tvBrand} - ${request.tvModel}`);
      doc.text(`Reported Defect: ${request.problemDesc}`);
      doc.text(`Technical Notes: ${invoice.notes}`);
      doc.moveDown(1.5);

      // Billing
      doc.fontSize(12).fillColor('#1e3a8a').text('Billing Breakdown', 50);
      doc.moveDown(0.5);

      const tableTop = doc.y;
      doc.fontSize(10).fillColor('#0f172a');
      doc.text('Description', 50, tableTop);
      doc.text('Amount (INR)', 450, tableTop, { align: 'right' });

      doc.moveTo(50, doc.y + 2).lineTo(562, doc.y + 2).strokeColor('#cbd5e1').stroke();
      doc.moveDown(0.8);

      const items = [
        { desc: 'Panel / Board Inspection Fee', amt: invoice.inspectionCharge },
        { desc: 'Spare Parts / Semiconductors', amt: invoice.sparePartsCost },
        { desc: 'Labour (Soldering & Fitting)', amt: invoice.labourCharges },
        { desc: 'Additional / Transport Charges', amt: invoice.additionalCharges }
      ];

      items.forEach(item => {
        const itemY = doc.y;
        doc.fillColor('#475569').text(item.desc, 50, itemY);
        doc.fillColor('#0f172a').text(`₹${item.amt.toFixed(2)}`, 450, itemY, { align: 'right' });
        doc.moveDown(0.8);
      });

      doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#cbd5e1').stroke();
      doc.moveDown(0.8);

      const totalY = doc.y;
      doc.fontSize(12).fillColor('#0f172a').text('Grand Total Amount', 50, totalY, { bold: true });
      doc.fontSize(12).fillColor('#10b981').text(`₹${invoice.totalAmount.toFixed(2)}`, 450, totalY, { bold: true, align: 'right' });
      doc.moveDown(1.5);

      // Embed Digital Signature if present
      if (invoice.customerSignature && invoice.customerSignature.startsWith('data:image/png;base64,')) {
        try {
          const base64Data = invoice.customerSignature.replace(/^data:image\/png;base64,/, "");
          const signatureBuffer = Buffer.from(base64Data, 'base64');
          doc.fontSize(10).fillColor('#1e3a8a').text('Digitally Signed By Customer:', 50);
          if (invoice.signedAt) {
            doc.fontSize(8).fillColor('#64748b').text(`Signed at: ${new Date(invoice.signedAt).toLocaleString('en-IN')}`, 50);
          }
          doc.image(signatureBuffer, 50, doc.y + 5, { width: 120, height: 40 });
          doc.moveDown(3.5);
        } catch (sigErr) {
          console.error("Error embedding signature in PDF:", sigErr.message);
        }
      } else {
        doc.moveDown(1.5);
      }

      doc.fontSize(9).fillColor('#64748b')
        .text('Thank you for choosing CSK Electronics. Replaced components carry a 90-day warranty.', 50, doc.y)
        .text('This is an officially generated electronic invoice.', 50, doc.y + 12);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Simulated SMS (console log only — integrate Twilio/Fast2SMS here for real SMS)
function sendSimulatedSMS(phone, message) {
  console.log(`\n📱 ===== [SIMULATED SMS] =====`);
  console.log(`To: ${phone}`);
  console.log(message);
  console.log(`=============================\n`);
}

// Generate premium, business-grade HTML email template
function buildEmailTemplate({ title, preheader, bodyHtml }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: #f4f6f8;
      color: #333333;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #f4f6f8;
      padding: 30px 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
      overflow: hidden;
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);
      padding: 30px;
      text-align: center;
      color: #ffffff;
    }
    .header-logo {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin-bottom: 5px;
    }
    .header-tagline {
      font-size: 13px;
      color: #93c5fd;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .body {
      padding: 40px 30px;
      line-height: 1.6;
      color: #334155;
    }
    .body h2 {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 20px;
    }
    .body p {
      font-size: 15px;
      margin-bottom: 20px;
    }
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin: 25px 0;
      background-color: #f8fafc;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
    }
    .details-table tr:nth-child(even) {
      background-color: #f1f5f9;
    }
    .details-table td {
      padding: 12px 16px;
      font-size: 14px;
      border-bottom: 1px solid #e2e8f0;
    }
    .details-table td.label {
      font-weight: 600;
      color: #475569;
      width: 150px;
    }
    .details-table td.value {
      color: #0f172a;
    }
    .footer {
      background-color: #f8fafc;
      padding: 30px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
      border-top: 1px solid #cbd5e1;
    }
    .footer p {
      margin: 5px 0;
    }
    .badge {
      display: inline-block;
      padding: 4px 8px;
      font-size: 12px;
      font-weight: bold;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .badge-success {
      background-color: #d1fae5;
      color: #065f46;
    }
    .badge-primary {
      background-color: #dbeafe;
      color: #1e40af;
    }
    .badge-danger {
      background-color: #fee2e2;
      color: #991b1b;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="header-logo">CSK Electronics</div>
        <div class="header-tagline">Premium TV Service & Diagnostics</div>
      </div>
      <div class="body">
        <h2>${title}</h2>
        ${bodyHtml}
      </div>
      <div class="footer">
        <p><strong>CSK Electronics Services</strong></p>
        <p>1800-456-7890 | support@cskelectronics.com</p>
        <p>Service HQ, Chennai, Tamil Nadu</p>
        <p style="margin-top: 15px; font-size: 11px; color: #94a3b8;">This is an automated system notification from CSK Electronics. Please do not reply directly to this email.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { sendMail, generateInvoicePDF, sendSimulatedSMS, buildEmailTemplate };
