# 📺 CSK Electronics - TV Repair & Service System

A modern, full-stack Single Page Application (SPA) designed to streamline TV repair operations, technician scheduling, customer request tracking, and digital invoicing. Built using Node.js, Express, and vanilla HTML5/CSS3.

---

## 🚀 Key Features

*   **👥 Multi-Role Authentication**: Customized dashboards and permissions for **Administrators**, **Technicians**, and **Customers**.
*   **💻 Modern Responsive UI/UX**: Includes a dark/light mode toggle, premium glassmorphic elements, and polished typography.
*   **🎟️ Real-Time Repair Tracker**: Customer dashboard features an interactive step-by-step progress timeline.
*   **🧑‍💻 Auto & Manual Assignment**: System assigns jobs based on technician workload, with manual reassignment options for Admins.
*   **✍️ Digital Signature Pad**: Customers can sign their invoice using an interactive HTML5 drawing board on view/download.
*   **印 CSK Authorized Rubber Stamp**: Automatically stamps invoice outputs with an official-looking digital rubber seal.
*   **🔔 Real-Time Client SSE Sync**: Instant, live dashboard updates across roles when tickets are updated.
*   **🎬 Cinematic Logo Transition**: Smooth full-screen rotation, scale, and pulse animation displaying the custom logo on login.

---

## 📸 Screenshots

### 🔑 Login Page
Includes active brand advertisements and demo credentials box.
![Login Screen](screenshots/login_page.png)

### 🎬 Animated Login Transition
Cinematic zoom, rotate, and pulse transition showing the CSK logo.
![Transition Animation](screenshots/transition.png)

### 📊 Admin Dashboard
Track total revenue, customer count, technician availability, and request status overview.
![Admin Dashboard](screenshots/admin_dashboard.png)

### 🗺️ Customer Repair Tracker
Real-time step-by-step repair tracker.
![Customer Dashboard](screenshots/customer_dashboard.png)

### ✍️ Digital Signature Pad
Interactive mouse & touch canvas for customers to sign off on repairs.
![Signature Canvas](screenshots/signature.png)

---

## 🛠️ Technology Stack

*   **Front-End**: HTML5 (Semantic Structure), CSS3 (Variables, Gradients, Transitions), Vanilla JS (State Management, DOM Manipulation, Drawing Canvas)
*   **Back-End**: Node.js, Express.js
*   **Database**: JSON File-Based Database (`db.json` with auto-incremental IDs)
*   **Real-time**: Server-Sent Events (SSE) for server-to-client notifications

---

## 🏃 Run the Project Locally

### 1. Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed.

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/CHILKUR-DATTATHREYA/csk.git
cd csk
npm install
```

### 3. Start the Server
Run the local Express development server:
```bash
npm start
```
The application will launch on: **[http://localhost:3000](http://localhost:3000)**

---

## 👤 Demo Accounts (Default Credentials)

| Role | Email | Password |
| :--- | :--- | :--- |
| **Administrator** | `admin@csk.com` | `admin123` |
| **Technician** | `tech1@csk.com` | `tech123` |
| **Customer** | `cust1@csk.com` | `cust123` |

---

*Developed with ❤️ by [CHILKUR-DATTATHREYA](https://github.com/CHILKUR-DATTATHREYA)*
