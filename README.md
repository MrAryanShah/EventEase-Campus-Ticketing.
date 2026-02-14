🎫 EventEase: Campus Ticketing System

A real-time campus event ticketing and verification system built to replace manual entry logs with high-speed digital scanning.

🚀 Key Features
Live QR Verification: Uses HTML5-QRCode to scan and verify tickets in milliseconds.

Real-time Backend: Integrated with Firebase for instant database updates and attendee tracking.

Multi-Role Access: Dedicated interfaces for Admins, Organizers, and Attendees.

Responsive UI: Fully functional on both mobile (for scanning) and desktop (for management).

🛠️ Tech Stack
Frontend: JavaScript (ES6+), HTML5, CSS3.

Backend/Database: Firebase Firestore & Authentication.

Dependencies: Managed via NPM (package.json).

📂 Project Structure
index.html: The main entry point for users.

scanner.html: The core logic for the QR code scanning interface.

backend.js: Handles all Firebase communications and logic.

admin.html / organizer.html: Management dashboards for event staff.

## 🚀 Getting Started

### Prerequisites
* Node.js installed on your machine.
* A Firebase account for database hosting.

### Step-by-Step Setup

1. **Clone & Enter:**

   ```bash
   git clone [https://github.com/MrAryanShah/EventEase-Campus-Ticketing.git](https://github.com/MrAryanShah/EventEase-Campus-Ticketing.git)
   cd EventEase-Campus-Ticketing

2.**Install Packages:**
```bash
npm install

3.**Environment Setup:**
```bash
Create a .env file (refer to the .gitignore for what to exclude).
Add your Firebase config keys.

4.**Launch:**
```bash
Use VS Code Live Server to open index.html.
