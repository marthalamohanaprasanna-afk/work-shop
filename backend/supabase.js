require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
// Prefer service_role key for backend operations, fallback to anon key
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;

function isConfigured() {
  return Boolean(
    supabaseUrl &&
    supabaseKey &&
    supabaseUrl.trim() &&
    supabaseKey.trim() &&
    !supabaseUrl.includes('your-project-id') &&
    !supabaseKey.includes('your_supabase_')
  );
}

if (isConfigured()) {
  try {
    supabase = createClient(supabaseUrl.trim(), supabaseKey.trim(), {
      auth: { persistSession: false }
    });
    console.log('⚡ Supabase Client initialized successfully.');
  } catch (err) {
    console.warn('⚠️ Failed to initialize Supabase client:', err.message);
  }
} else {
  console.log('ℹ️ Supabase credentials not fully configured in backend/.env. Using local memory/storage fallback.');
}

/**
 * Test connectivity to Supabase
 */
async function testConnection() {
  if (!isConfigured() || !supabase) {
    return { ok: false, error: 'Supabase credentials not configured in backend/.env' };
  }
  try {
    const { data, error } = await supabase.from('chat_sessions').select('id').limit(1);
    if (error) throw error;
    return { ok: true, message: 'Connected to Supabase database successfully!' };
  } catch (err) {
    return { ok: false, error: err.message || 'Failed to query Supabase' };
  }
}

/**
 * Fetch all sessions
 */
async function getSessions() {
  if (!isConfigured() || !supabase) return null;
  try {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('id, title, created_at, updated_at')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Supabase getSessions error:', err.message);
    return null;
  }
}

/**
 * Create or upsert a session
 */
async function upsertSession(id, title = 'New Conversation') {
  if (!isConfigured() || !supabase) return null;
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('chat_sessions')
      .upsert({ id, title, updated_at: now }, { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Supabase upsertSession error:', err.message);
    return null;
  }
}

/**
 * Delete a session and its cascading messages
 */
async function deleteSession(id) {
  if (!isConfigured() || !supabase) return false;
  try {
    const { error } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Supabase deleteSession error:', err.message);
    return false;
  }
}

/**
 * Get all messages for a session
 */
async function getMessages(sessionId) {
  if (!isConfigured() || !supabase) return null;
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, session_id, role, content, model, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Supabase getMessages error:', err.message);
    return null;
  }
}

/**
 * Save an individual message to Supabase
 */
async function saveMessage({ id, sessionId, role, content, model }) {
  if (!isConfigured() || !supabase) return null;
  try {
    const messageId = id || ('msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));

    // Ensure session exists
    await upsertSession(sessionId);

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        id: messageId,
        session_id: sessionId,
        role,
        content,
        model: model || 'gemini-2.5-flash',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Update session timestamp
    await supabase
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    return data;
  } catch (err) {
    console.error('Supabase saveMessage error:', err.message);
    return null;
  }
}

module.exports = {
  isConfigured,
  testConnection,
  getSessions,
  upsertSession,
  deleteSession,
  getMessages,
  saveMessage,
  getClient: () => supabase
};
