require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const db = require('./supabase');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Supported Gemini Models
const SUPPORTED_MODELS = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Fastest, smartest default model for conversational chat',
    isDefault: true
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    description: 'Next-gen ultra-responsive multimodal model'
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    description: 'Fast and lightweight model with high throughput'
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    description: 'Best for complex reasoning, analysis, and extensive context'
  }
];

/**
 * Resolves the API key from:
 * 1. Request header 'x-api-key' (if provided by client)
 * 2. Request body 'apiKey' (optional dynamic key)
 * 3. Environment variable 'GEMINI_API_KEY' (.env)
 */
function resolveApiKey(req) {
  const headerKey = req.headers['x-api-key'];
  if (headerKey && typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }
  if (req.body && req.body.apiKey && typeof req.body.apiKey === 'string' && req.body.apiKey.trim()) {
    return req.body.apiKey.trim();
  }
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && envKey.trim() && envKey !== 'your_gemini_api_key_here') {
    return envKey.trim();
  }
  return null;
}

/**
 * Formats client history into the Gemini Content object format:
 * [ { role: 'user' | 'model', parts: [{ text: '...' }] } ]
 */
function formatHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];

  return rawHistory
    .filter(item => item && (item.role === 'user' || item.role === 'model') && (item.text || (item.parts && item.parts[0]?.text)))
    .map(item => {
      const text = item.text || item.parts?.[0]?.text || '';
      return {
        role: item.role === 'user' ? 'user' : 'model',
        parts: [{ text }]
      };
    });
}

/**
 * Parses error objects into clean user-friendly messages
 */
function parseGeminiError(error) {
  const msg = error.message || String(error);

  if (msg.includes('API key not valid') || msg.includes('API_KEY_INVALID')) {
    return {
      status: 401,
      error: 'Invalid Gemini API Key. Please verify your key at Google AI Studio (https://aistudio.google.com/app/apikey).'
    };
  }

  if (msg.includes('API key should be set') || msg.includes('API_KEY_MISSING')) {
    return {
      status: 401,
      error: 'Gemini API Key is missing. Please set GEMINI_API_KEY in backend/.env or configure it in the UI settings.'
    };
  }

  if (msg.includes('Quota exceeded') || msg.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      error: 'Gemini API rate limit or quota exceeded. Please wait a moment or try another model.'
    };
  }

  if (msg.includes('model') && msg.includes('not found')) {
    return {
      status: 404,
      error: 'The requested Gemini model is not accessible with your API key or is unavailable.'
    };
  }

  return {
    status: 500,
    error: error.message || 'An error occurred while communicating with Gemini.'
  };
}

// -------------------------------------------------------------
// ROUTES
// -------------------------------------------------------------

/**
 * GET /api/health
 * Checks backend status, Gemini key status, and Supabase database connection
 */
app.get('/api/health', async (req, res) => {
  const hasEnvKey = Boolean(
    process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY.trim() &&
    process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here'
  );

  let dbStatus = { configured: db.isConfigured() };
  if (db.isConfigured()) {
    const test = await db.testConnection();
    dbStatus.connected = test.ok;
    dbStatus.message = test.ok ? 'Connected' : test.error;
  }

  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    apiKeyConfiguredInEnv: hasEnvKey,
    defaultModel: process.env.DEFAULT_MODEL || 'gemini-2.5-flash',
    supabase: dbStatus,
    version: '1.1.0'
  });
});

/**
 * GET /api/config
 * Returns public configuration for client synchronization (including public Supabase config)
 */
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    supabaseConfigured: db.isConfigured(),
    defaultModel: process.env.DEFAULT_MODEL || 'gemini-2.5-flash'
  });
});

/**
 * GET /api/models
 * Returns the list of supported Gemini models
 */
app.get('/api/models', (req, res) => {
  res.json({
    models: SUPPORTED_MODELS,
    default: process.env.DEFAULT_MODEL || 'gemini-2.5-flash'
  });
});

/**
 * DATABASE: SESSIONS & MESSAGES (SUPABASE PERSISTENCE)
 */
app.get('/api/sessions', async (req, res) => {
  const sessions = await db.getSessions();
  if (sessions === null) {
    return res.json({ sessions: [], source: 'local_fallback', configured: false });
  }
  return res.json({ sessions, source: 'supabase', configured: true });
});

app.post('/api/sessions', async (req, res) => {
  const { id, title } = req.body;
  if (!id) return res.status(400).json({ error: 'Session ID is required' });
  const result = await db.upsertSession(id, title);
  return res.json({ session: result });
});

app.delete('/api/sessions/:id', async (req, res) => {
  const success = await db.deleteSession(req.params.id);
  return res.json({ success });
});

app.get('/api/sessions/:id/messages', async (req, res) => {
  const messages = await db.getMessages(req.params.id);
  if (messages === null) {
    return res.json({ messages: [], source: 'local_fallback' });
  }
  return res.json({ messages, source: 'supabase' });
});

/**
 * POST /api/chat
 * Standard non-streaming chat endpoint
 */
app.post('/api/chat', async (req, res) => {
  try {
    const apiKey = resolveApiKey(req);
    if (!apiKey) {
      return res.status(401).json({
        error: 'Gemini API key is required. Please set GEMINI_API_KEY in backend/.env or supply it in request headers.',
        code: 'MISSING_API_KEY'
      });
    }

    const { message, history = [], model, systemInstruction, sessionId, sessionTitle } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    const selectedModel = model || process.env.DEFAULT_MODEL || 'gemini-2.5-flash';
    const formattedHistory = formatHistory(history);

    // If Supabase is connected and sessionId is provided, persist user message
    if (sessionId && db.isConfigured()) {
      await db.upsertSession(sessionId, sessionTitle || message.slice(0, 32));
      await db.saveMessage({
        sessionId,
        role: 'user',
        content: message.trim(),
        model: selectedModel
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const chatConfig = {};
    if (systemInstruction && systemInstruction.trim()) {
      chatConfig.systemInstruction = systemInstruction.trim();
    }

    const chat = ai.chats.create({
      model: selectedModel,
      config: chatConfig,
      history: formattedHistory
    });

    const response = await chat.sendMessage({ message: message.trim() });
    const replyText = response.text || '';

    // If Supabase is connected, persist model response
    if (sessionId && db.isConfigured() && replyText) {
      await db.saveMessage({
        sessionId,
        role: 'model',
        content: replyText,
        model: selectedModel
      });
    }

    return res.json({
      reply: replyText,
      model: selectedModel,
      timestamp: new Date().toISOString(),
      savedToSupabase: Boolean(sessionId && db.isConfigured())
    });
  } catch (error) {
    console.error('Chat Error:', error);
    const parsed = parseGeminiError(error);
    return res.status(parsed.status).json({ error: parsed.error });
  }
});

/**
 * POST /api/chat/stream
 * Server-Sent Events (SSE) streaming chat endpoint
 */
app.post('/api/chat/stream', async (req, res) => {
  try {
    const apiKey = resolveApiKey(req);
    if (!apiKey) {
      return res.status(401).json({
        error: 'Gemini API key is required. Please set GEMINI_API_KEY in backend/.env or supply it in request headers.',
        code: 'MISSING_API_KEY'
      });
    }

    const { message, history = [], model, systemInstruction, sessionId, sessionTitle } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    const selectedModel = model || process.env.DEFAULT_MODEL || 'gemini-2.5-flash';
    const formattedHistory = formatHistory(history);

    // If Supabase is connected and sessionId is provided, persist user message
    if (sessionId && db.isConfigured()) {
      await db.upsertSession(sessionId, sessionTitle || message.slice(0, 32));
      await db.saveMessage({
        sessionId,
        role: 'user',
        content: message.trim(),
        model: selectedModel
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const chatConfig = {};
    if (systemInstruction && systemInstruction.trim()) {
      chatConfig.systemInstruction = systemInstruction.trim();
    }

    const chat = ai.chats.create({
      model: selectedModel,
      config: chatConfig,
      history: formattedHistory
    });

    const streamResult = await chat.sendMessageStream({ message: message.trim() });

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let fullAccumulatedText = '';

    for await (const chunk of streamResult) {
      const chunkText = chunk.text || '';
      if (chunkText) {
        fullAccumulatedText += chunkText;
        res.write(`data: ${JSON.stringify({ chunk: chunkText })}\n\n`);
      }
    }

    // Persist full bot response to Supabase when stream completes
    if (sessionId && db.isConfigured() && fullAccumulatedText) {
      await db.saveMessage({
        sessionId,
        role: 'model',
        content: fullAccumulatedText,
        model: selectedModel
      });
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Stream Chat Error:', error);
    const parsed = parseGeminiError(error);

    if (!res.headersSent) {
      return res.status(parsed.status).json({ error: parsed.error });
    } else {
      res.write(`data: ${JSON.stringify({ error: parsed.error })}\n\n`);
      res.end();
    }
  }
});

// Serve frontend static files from ../frontend folder
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// Serve frontend .env file explicitly
app.get('/.env', (req, res) => {
  res.sendFile(path.join(frontendPath, '.env'), { dotfiles: 'allow' });
});

// Fallback route: serve frontend index.html for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`🚀 Gemini Chatbot Backend Running!`);
  console.log(`📍 Local Server:      http://localhost:${PORT}`);
  console.log(`📍 API Health:        http://localhost:${PORT}/api/health`);
  console.log(`📍 API Config:        http://localhost:${PORT}/api/config`);
  console.log(`📍 Supabase DB:       ${db.isConfigured() ? 'Active ✅' : 'Not configured in .env (Local Fallback)'}`);
  console.log(`📍 Frontend UI:       http://localhost:${PORT}`);
  console.log(`=================================================\n`);
});
