-- ====================================================================
-- SUPABASE MIGRATION: 20261014000001_create_chatbot_tables.sql
-- Creates all tables, indexes, triggers, and RLS policies for Gemini Chatbot
-- Idempotent: Safe to execute multiple times without errors
-- ====================================================================

-- 1. Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create chat_sessions table
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Create chat_messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'model', 'system')),
  content TEXT NOT NULL,
  model TEXT DEFAULT 'gemini-2.5-flash',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. High-performance Query Indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON public.chat_sessions(updated_at DESC);

-- 5. Auto-update timestamp function & trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_chat_sessions_timestamp ON public.chat_sessions;
CREATE TRIGGER trigger_update_chat_sessions_timestamp
  BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- 7. Configure Access Policies (Drop old if exists, then re-create)
DROP POLICY IF EXISTS "Public select sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Public insert sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Public update sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Public delete sessions" ON public.chat_sessions;

DROP POLICY IF EXISTS "Public select messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Public insert messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Public update messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Public delete messages" ON public.chat_messages;

-- Sessions Table Policies
CREATE POLICY "Public select sessions" ON public.chat_sessions FOR SELECT USING (true);
CREATE POLICY "Public insert sessions" ON public.chat_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update sessions" ON public.chat_sessions FOR UPDATE USING (true);
CREATE POLICY "Public delete sessions" ON public.chat_sessions FOR DELETE USING (true);

-- Messages Table Policies
CREATE POLICY "Public select messages" ON public.chat_messages FOR SELECT USING (true);
CREATE POLICY "Public insert messages" ON public.chat_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update messages" ON public.chat_messages FOR UPDATE USING (true);
CREATE POLICY "Public delete messages" ON public.chat_messages FOR DELETE USING (true);

-- 8. Documentation Metadata
COMMENT ON TABLE public.chat_sessions IS 'Stores AI conversation threads and metadata';
COMMENT ON TABLE public.chat_messages IS 'Stores individual dialogue messages for each conversation';
COMMENT ON COLUMN public.chat_messages.role IS 'user, model, or system';
