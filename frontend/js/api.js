/**
 * Gemini Chatbot - Backend & Database API Client
 * Encapsulates all HTTP and Server-Sent Events (SSE) communication with the backend and Supabase database.
 */
class GeminiApiClient {
  constructor(baseUrl = '') {
    // If running from same origin (e.g. backend serving frontend), use relative path
    // Otherwise fallback to BACKEND_URL from .env or http://localhost:5000
    this.baseUrl = baseUrl || (window.location.port === '5000' ? '' : (window.getEnv ? window.getEnv('BACKEND_URL', 'http://localhost:5000') : 'http://localhost:5000'));
  }

  setBaseUrl(url) {
    this.baseUrl = (url || '').replace(/\/$/, '');
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  /**
   * Health check to test backend connection, Gemini key, and Supabase database
   */
  async checkHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.warn('API Health Check Failed:', error);
      throw error;
    }
  }

  /**
   * Fetch public config from backend
   */
  async fetchConfig() {
    try {
      const response = await fetch(`${this.baseUrl}/api/config`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.warn('Failed to fetch config:', error);
      return null;
    }
  }

  /**
   * Retrieve list of supported models from backend
   */
  async fetchModels() {
    try {
      const response = await fetch(`${this.baseUrl}/api/models`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.warn('Failed to fetch models:', error);
      return {
        models: [
          { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
          { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
          { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
          { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' }
        ]
      };
    }
  }

  /**
   * DATABASE: Fetch all sessions from Supabase
   */
  async fetchSessions() {
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      console.warn('Failed to fetch sessions from server:', err);
      return null;
    }
  }

  /**
   * DATABASE: Fetch messages for a session
   */
  async fetchSessionMessages(sessionId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/messages`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      console.warn('Failed to fetch session messages:', err);
      return null;
    }
  }

  /**
   * DATABASE: Delete session from Supabase
   */
  async deleteSession(sessionId) {
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE'
      });
      return response.ok;
    } catch (err) {
      console.warn('Failed to delete session:', err);
      return false;
    }
  }

  /**
   * Standard single-turn/multi-turn non-streaming chat request
   */
  async sendMessage({ message, history = [], model, systemInstruction, apiKey, sessionId, sessionTitle }) {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const payload = {
      message,
      history,
      model,
      systemInstruction,
      sessionId,
      sessionTitle
    };

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP error ${response.status}`);
    }

    return data;
  }

  /**
   * Streaming chat request using Server-Sent Events (SSE)
   */
  async streamMessage({ message, history = [], model, systemInstruction, apiKey, sessionId, sessionTitle, signal, onChunk, onError, onDone }) {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const payload = {
      message,
      history,
      model,
      systemInstruction,
      sessionId,
      sessionTitle
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal
      });

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}`;
        try {
          const errData = await response.json();
          if (errData && errData.error) errMessage = errData.error;
        } catch (_) {}
        throw new Error(errMessage);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete trailing fragment in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === '[DONE]') {
            if (onDone) onDone();
            return;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.error) {
              if (onError) onError(new Error(parsed.error));
              return;
            }
            if (parsed.chunk && onChunk) {
              onChunk(parsed.chunk);
            }
            if (parsed.done && onDone) {
              onDone();
              return;
            }
          } catch (e) {
            console.warn('Could not parse SSE JSON line:', jsonStr, e);
          }
        }
      }

      if (onDone) onDone();
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Stream aborted by user');
        if (onDone) onDone();
      } else {
        if (onError) onError(err);
      }
    }
  }
}

// Export single instance for global usage
window.geminiApi = new GeminiApiClient();
