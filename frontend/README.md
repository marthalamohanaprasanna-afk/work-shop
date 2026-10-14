# 🎨 Gemini Chatbot - Frontend Interface (with Supabase Sync)

A modern, responsive, high-aesthetic web chat client built using Vanilla HTML5, CSS3, and modern JavaScript, with environment configuration and Supabase integration.

---

## 📁 Directory Structure
```
frontend/
├── .env.example          # Template for frontend environment variables
├── .env                  # Your local frontend environment variables
├── index.html            # Main semantic HTML structure & settings modal
├── css/
│   └── style.css         # Glassmorphism, dark cosmic palette & responsive design
├── js/
│   ├── env.js            # Environment loader (reads frontend/.env & /api/config)
│   ├── api.js            # Client for Gemini API and Supabase session endpoints
│   └── app.js            # Chat controller, markdown parsing, sounds, sessions
├── assets/
│   └── avatar.jpg        # AI Assistant glowing crystal avatar asset
└── README.md             # Frontend documentation
```

---

## 🔑 Environment Variables (`frontend/.env`)

The frontend `.env` file configures client-side connection endpoints. It is automatically parsed by `js/env.js`:

```env
# 1. Supabase Public Project Configuration
# Get from: Supabase Dashboard -> Project Settings -> API
# Use the "anon" public key (NEVER put your service_role secret here)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...your_anon_public_key...

# 2. Backend API Endpoint
BACKEND_URL=http://localhost:5000

# 3. Application Preferences
DEFAULT_MODEL=gemini-2.5-flash
APP_TITLE=Gemini AI Chatbot
```

---

## 🌐 How to Run the Frontend

### Option 1: Standalone Vite Dev Server (Recommended for Frontend Dev)
```bash
cd frontend
npm run dev
```
Starts the lightning-fast Vite dev server on **`http://localhost:3000`** with instant Hot Module Replacement (HMR) and automatic API proxy to `http://localhost:5000`.

### Option 2: Served by Backend
Start the backend server (`npm start` or `npm run dev` in `backend/`) and open:
👉 **`http://localhost:5000`**

### Option 3: Run with Live Server
Open [frontend/index.html](file:///c:/Users/marth/OneDrive/Desktop/WORK%20SHOP/frontend/index.html) with VS Code Live Server or run:
```bash
npx serve frontend
```
