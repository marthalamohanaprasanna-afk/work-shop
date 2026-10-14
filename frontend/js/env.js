/**
 * Client-Side Environment (.env) Loader
 * Reads and parses the frontend/.env file and merges with backend /api/config
 */
(function() {
  window.__ENV__ = {
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
    BACKEND_URL: 'http://localhost:5000',
    DEFAULT_MODEL: 'gemini-2.5-flash',
    APP_TITLE: 'Gemini AI Chatbot'
  };

  /**
   * Helper to retrieve environment variable with fallback
   */
  window.getEnv = function(key, defaultValue = '') {
    return (window.__ENV__ && window.__ENV__[key]) || defaultValue;
  };

  /**
   * Parses simple .env text into key-value pairs
   */
  function parseEnvText(text) {
    const result = {};
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const equalsIdx = trimmed.indexOf('=');
      if (equalsIdx > 0) {
        const key = trimmed.slice(0, equalsIdx).trim();
        let val = trimmed.slice(equalsIdx + 1).trim();
        // Remove surrounding quotes if present
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (key && val) {
          result[key] = val;
        }
      }
    }
    return result;
  }

  /**
   * Loads .env file and backend config
   */
  async function loadEnvironment() {
    // 1. Try reading local frontend/.env file
    try {
      const response = await fetch('.env');
      if (response.ok) {
        const text = await response.text();
        const parsed = parseEnvText(text);
        window.__ENV__ = { ...window.__ENV__, ...parsed };
      }
    } catch (_) {
      // Ignore if .env is not directly fetchable
    }

    // 2. Query backend /api/config to merge server-provided config
    try {
      const backendUrl = window.__ENV__.BACKEND_URL || (window.location.port === '5000' ? '' : 'http://localhost:5000');
      const response = await fetch(`${backendUrl}/api/config`);
      if (response.ok) {
        const serverConfig = await response.json();
        if (serverConfig.supabaseUrl && !window.__ENV__.SUPABASE_URL) {
          window.__ENV__.SUPABASE_URL = serverConfig.supabaseUrl;
        }
        if (serverConfig.supabaseAnonKey && !window.__ENV__.SUPABASE_ANON_KEY) {
          window.__ENV__.SUPABASE_ANON_KEY = serverConfig.supabaseAnonKey;
        }
        if (serverConfig.defaultModel && !window.__ENV__.DEFAULT_MODEL) {
          window.__ENV__.DEFAULT_MODEL = serverConfig.defaultModel;
        }
        window.__ENV__.SUPABASE_CONFIGURED = serverConfig.supabaseConfigured;
      }
    } catch (_) {
      // Backend not yet reachable
    }

    // Dispatch event so other modules can react
    window.dispatchEvent(new CustomEvent('env-loaded', { detail: window.__ENV__ }));
  }

  window.loadEnvironment = loadEnvironment;
  loadEnvironment();
})();
