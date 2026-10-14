# ⚙️ Gemini Chatbot - Backend Service (with Supabase DB)

This backend service communicates with Google Gemini LLM via `@google/genai` and connects to **Supabase PostgreSQL** for persistent multi-turn chat history.

---

## 📁 Directory Structure
```
backend/
├── .env.example          # Template for required environment variables
├── .env                  # Your local secrets (Gemini & Supabase keys)
├── package.json          # Node dependencies (@google/genai, @supabase/supabase-js, etc.)
├── server.js             # Express API server with chat & session routes
├── supabase.js           # Supabase database client & queries
├── supabase_schema.sql   # SQL migration script for Supabase tables
└── README.md             # Backend documentation
```

---

## 🔑 Environment Variables (`backend/.env`)

Create or edit `backend/.env` with the following variables:

```env
# 1. Google Gemini LLM API Key (Required)
# Free key from Google AI Studio: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=AIzaSy...your_gemini_api_key...

# 2. Server Configuration
PORT=5000
DEFAULT_MODEL=gemini-2.5-flash

# 3. Supabase Database Configuration (Required for Cloud Persistence)
# Found in: Supabase Dashboard -> Project Settings -> API
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...your_anon_public_key...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...your_service_role_key...
```

> **Note on Local Fallback**: If `SUPABASE_URL` is omitted, the backend will still run and fall back to in-memory/browser local storage mode without crashing.

---

## 🗄️ Setting Up Supabase Database

1. Open your **[Supabase Dashboard](https://supabase.com/dashboard)**.
2. Select your project and navigate to the **SQL Editor** tab (left sidebar).
3. Open [`backend/supabase_schema.sql`](file:///c:/Users/marth/OneDrive/Desktop/WORK%20SHOP/backend/supabase_schema.sql), copy its contents, paste them into the SQL Editor, and click **Run**.
4. This creates:
   - `chat_sessions`: Stores conversation threads.
   - `chat_messages`: Stores individual dialogue turns.
   - Indexes for fast queries.
   - Row Level Security (RLS) policies.

---

## 🚀 Running the Backend

```bash
cd backend
npm install
npm start
```

Backend endpoints:
- **Local Server**: `http://localhost:5000`
- **Health Check**: `http://localhost:5000/api/health`
- **Public Config**: `http://localhost:5000/api/config`
- **Sessions API**: `http://localhost:5000/api/sessions`
