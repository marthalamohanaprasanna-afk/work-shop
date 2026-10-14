/**
 * Gemini AI Chatbot - Main Application Logic
 * Integrates Google Gemini LLM with Supabase Database Cloud Persistence
 * Manages UI interactions, streaming states, localStorage fallback, sound synthesis, and markdown formatting.
 */

// System Persona Presets
const PERSONA_PRESETS = {
  default: "You are a friendly, highly knowledgeable, and versatile AI assistant powered by Google Gemini. Provide helpful, accurate, well-formatted, and engaging answers.",
  coder: "You are an expert Principal Software Engineer and Architect. Provide clean, modern, production-ready code with best practices, concise explanations, and considerations for error handling and performance.",
  creative: "You are an imaginative creative writer and brainstorming partner. Write with vivid imagery, creative flair, expressive vocabulary, and original thinking.",
  concise: "You are a direct, ultra-concise assistant. Answer questions directly in crisp bullet points with zero fluff or conversational filler.",
  eli5: "Explain everything like I am 5 years old. Use simple, everyday analogies, friendly language, and avoid technical jargon."
};

class GeminiChatApp {
  constructor() {
    // State
    this.sessions = [];
    this.currentSessionId = null;
    this.isGenerating = false;
    this.abortController = null;
    this.isBackendOnline = false;
    this.isSupabaseOnline = false;

    // Preferences & Settings (loaded from .env and localStorage)
    this.settings = {
      model: window.getEnv ? window.getEnv('DEFAULT_MODEL', 'gemini-2.5-flash') : 'gemini-2.5-flash',
      persona: 'default',
      customSystemPrompt: '',
      stream: true,
      sound: true,
      customApiKey: '',
      backendUrl: window.getEnv ? window.getEnv('BACKEND_URL', 'http://localhost:5000') : 'http://localhost:5000',
      supabaseUrl: window.getEnv ? window.getEnv('SUPABASE_URL', '') : '',
      supabaseAnonKey: window.getEnv ? window.getEnv('SUPABASE_ANON_KEY', '') : ''
    };

    // Audio Context (Synthesized sound effects)
    this.audioCtx = null;

    // Cache DOM Elements
    this.dom = {
      appSidebar: document.getElementById('appSidebar'),
      sidebarBackdrop: document.getElementById('sidebarBackdrop'),
      mobileMenuBtn: document.getElementById('mobileMenuBtn'),
      closeSidebarBtn: document.getElementById('closeSidebarBtn'),
      newChatBtn: document.getElementById('newChatBtn'),
      modelSelect: document.getElementById('modelSelect'),
      personaSelect: document.getElementById('personaSelect'),
      streamToggle: document.getElementById('streamToggle'),
      soundToggle: document.getElementById('soundToggle'),
      historyList: document.getElementById('historyList'),
      clearAllHistoryBtn: document.getElementById('clearAllHistoryBtn'),
      backendStatusPill: document.getElementById('backendStatusPill'),
      sidebarStatusDot: document.getElementById('sidebarStatusDot'),
      statusText: document.getElementById('statusText'),
      openSettingsBtn: document.getElementById('openSettingsBtn'),
      settingsModal: document.getElementById('settingsModal'),
      closeSettingsModal: document.getElementById('closeSettingsModal'),
      customApiKeyInput: document.getElementById('customApiKeyInput'),
      toggleKeyVisibility: document.getElementById('toggleKeyVisibility'),
      backendUrlInput: document.getElementById('backendUrlInput'),
      supabaseUrlInput: document.getElementById('supabaseUrlInput'),
      supabaseAnonKeyInput: document.getElementById('supabaseAnonKeyInput'),
      customSystemPrompt: document.getElementById('customSystemPrompt'),
      modalStatusDetails: document.getElementById('modalStatusDetails'),
      testConnectionBtn: document.getElementById('testConnectionBtn'),
      saveSettingsBtn: document.getElementById('saveSettingsBtn'),
      activeModelTag: document.getElementById('activeModelTag'),
      exportChatBtn: document.getElementById('exportChatBtn'),
      clearChatBtn: document.getElementById('clearChatBtn'),
      messagesArea: document.getElementById('messagesArea'),
      welcomeHero: document.getElementById('welcomeHero'),
      chatMessages: document.getElementById('chatMessages'),
      typingIndicator: document.getElementById('typingIndicator'),
      scrollBottomBtn: document.getElementById('scrollBottomBtn'),
      userInput: document.getElementById('userInput'),
      sendBtn: document.getElementById('sendBtn'),
      stopStreamBtn: document.getElementById('stopStreamBtn'),
      toastContainer: document.getElementById('toastContainer')
    };

    this.init();
  }

  async init() {
    this.loadSettings();
    this.setupEventListeners();
    this.setupMarked();
    await this.checkBackendHealth();
    await this.loadSessions();

    // Periodic health check every 30 seconds
    setInterval(() => this.checkBackendHealth(), 30000);
  }

  // -------------------------------------------------------------
  // SETTINGS & STORAGE
  // -------------------------------------------------------------
  loadSettings() {
    try {
      const saved = localStorage.getItem('gemini_chat_settings');
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load settings from storage:', e);
    }

    // Fallbacks from environment variables (.env) if empty
    if (!this.settings.supabaseUrl && window.getEnv) {
      this.settings.supabaseUrl = window.getEnv('SUPABASE_URL', '');
    }
    if (!this.settings.supabaseAnonKey && window.getEnv) {
      this.settings.supabaseAnonKey = window.getEnv('SUPABASE_ANON_KEY', '');
    }
    if (!this.settings.backendUrl && window.getEnv) {
      this.settings.backendUrl = window.getEnv('BACKEND_URL', 'http://localhost:5000');
    }

    // Apply settings to UI controls
    if (this.dom.modelSelect) this.dom.modelSelect.value = this.settings.model;
    if (this.dom.personaSelect) this.dom.personaSelect.value = this.settings.persona;
    if (this.dom.streamToggle) this.dom.streamToggle.checked = this.settings.stream;
    if (this.dom.soundToggle) this.dom.soundToggle.checked = this.settings.sound;
    if (this.dom.activeModelTag) this.dom.activeModelTag.textContent = this.settings.model;
    if (this.dom.customApiKeyInput) this.dom.customApiKeyInput.value = this.settings.customApiKey || '';
    if (this.dom.backendUrlInput) this.dom.backendUrlInput.value = this.settings.backendUrl || 'http://localhost:5000';
    if (this.dom.supabaseUrlInput) this.dom.supabaseUrlInput.value = this.settings.supabaseUrl || '';
    if (this.dom.supabaseAnonKeyInput) this.dom.supabaseAnonKeyInput.value = this.settings.supabaseAnonKey || '';
    if (this.dom.customSystemPrompt) this.dom.customSystemPrompt.value = this.settings.customSystemPrompt || '';

    if (window.geminiApi && this.settings.backendUrl) {
      window.geminiApi.setBaseUrl(this.settings.backendUrl);
    }
  }

  saveSettings() {
    try {
      this.settings.model = this.dom.modelSelect.value;
      this.settings.persona = this.dom.personaSelect.value;
      this.settings.stream = this.dom.streamToggle.checked;
      this.settings.sound = this.dom.soundToggle.checked;
      this.settings.customApiKey = this.dom.customApiKeyInput.value.trim();
      this.settings.backendUrl = this.dom.backendUrlInput.value.trim() || 'http://localhost:5000';
      this.settings.supabaseUrl = this.dom.supabaseUrlInput.value.trim();
      this.settings.supabaseAnonKey = this.dom.supabaseAnonKeyInput.value.trim();
      this.settings.customSystemPrompt = this.dom.customSystemPrompt.value.trim();

      localStorage.setItem('gemini_chat_settings', JSON.stringify(this.settings));

      if (window.geminiApi) {
        window.geminiApi.setBaseUrl(this.settings.backendUrl);
      }
      if (this.dom.activeModelTag) {
        this.dom.activeModelTag.textContent = this.settings.model;
      }
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  // -------------------------------------------------------------
  // SESSIONS & SUPABASE DATABASE SYNC
  // -------------------------------------------------------------
  async loadSessions() {
    // 1. Try loading cached sessions from localStorage first for instant render
    try {
      const saved = localStorage.getItem('gemini_chat_sessions');
      if (saved) this.sessions = JSON.parse(saved);
    } catch (e) {
      this.sessions = [];
    }

    // 2. Fetch from Supabase via backend if connected
    try {
      const result = await window.geminiApi.fetchSessions();
      if (result && result.configured && Array.isArray(result.sessions) && result.sessions.length > 0) {
        // Map Supabase sessions
        const remoteSessions = result.sessions.map(s => {
          const localMatch = this.sessions.find(ls => ls.id === s.id);
          return {
            id: s.id,
            title: s.title || 'Conversation',
            createdAt: s.created_at || new Date().toISOString(),
            messages: localMatch ? localMatch.messages : []
          };
        });
        this.sessions = remoteSessions;
        this.saveSessionsToLocal();
      }
    } catch (err) {
      console.warn('Could not sync sessions with Supabase:', err);
    }

    if (this.sessions.length === 0) {
      this.createNewSession();
    } else {
      this.currentSessionId = this.sessions[0].id;
      this.renderHistoryList();
      await this.loadMessagesForSession(this.currentSessionId);
    }
  }

  async loadMessagesForSession(sessionId) {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) return;

    // If session has no messages cached, fetch from Supabase
    if (!session.messages || session.messages.length === 0) {
      try {
        const result = await window.geminiApi.fetchSessionMessages(sessionId);
        if (result && Array.isArray(result.messages) && result.messages.length > 0) {
          session.messages = result.messages.map(m => ({
            role: m.role,
            text: m.content,
            model: m.model,
            createdAt: m.created_at
          }));
          this.saveSessionsToLocal();
        }
      } catch (err) {
        console.warn('Could not load session messages from database:', err);
      }
    }

    this.renderCurrentSession();
  }

  saveSessionsToLocal() {
    try {
      localStorage.setItem('gemini_chat_sessions', JSON.stringify(this.sessions));
      this.renderHistoryList();
    } catch (e) {
      console.warn('Failed to save sessions to localStorage:', e);
    }
  }

  createNewSession() {
    const newSession = {
      id: 'session_' + Date.now(),
      title: 'New Conversation',
      createdAt: new Date().toISOString(),
      messages: []
    };
    this.sessions.unshift(newSession);
    this.currentSessionId = newSession.id;
    this.saveSessionsToLocal();
    this.renderCurrentSession();
    this.closeSidebarOnMobile();
  }

  getCurrentSession() {
    return this.sessions.find(s => s.id === this.currentSessionId) || null;
  }

  async deleteSession(sessionId, e) {
    if (e) e.stopPropagation();

    // Call Supabase delete
    window.geminiApi.deleteSession(sessionId).catch(err => console.warn(err));

    this.sessions = this.sessions.filter(s => s.id !== sessionId);
    if (this.sessions.length === 0) {
      this.createNewSession();
    } else if (this.currentSessionId === sessionId) {
      this.currentSessionId = this.sessions[0].id;
      await this.loadMessagesForSession(this.currentSessionId);
    }
    this.saveSessionsToLocal();
    this.showToast('Conversation deleted', 'info');
  }

  async switchSession(sessionId) {
    if (this.isGenerating) {
      this.showToast('Please wait or stop the current response first.', 'info');
      return;
    }
    this.currentSessionId = sessionId;
    this.renderHistoryList();
    await this.loadMessagesForSession(sessionId);
    this.closeSidebarOnMobile();
  }

  clearCurrentSession() {
    const session = this.getCurrentSession();
    if (!session) return;
    session.messages = [];
    session.title = 'New Conversation';
    this.saveSessionsToLocal();
    this.renderCurrentSession();
    this.showToast('Chat cleared', 'info');
  }

  // -------------------------------------------------------------
  // AUDIO SYNTHESIS
  // -------------------------------------------------------------
  playTone(type) {
    if (!this.settings.sound) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!this.audioCtx) this.audioCtx = new AudioCtx();
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (type === 'send') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'receive') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(659.25, now);
        osc.frequency.setValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    } catch (_) {}
  }

  // -------------------------------------------------------------
  // MARKDOWN & HIGHLIGHT CONFIGURATION
  // -------------------------------------------------------------
  setupMarked() {
    if (window.marked) {
      window.marked.setOptions({
        gfm: true,
        breaks: true,
        highlight: (code, lang) => {
          if (window.hljs) {
            const validLang = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language: validLang }).value;
          }
          return code;
        }
      });
    }
  }

  renderMarkdown(text) {
    if (window.marked) {
      try {
        let html = window.marked.parse(text);
        html = html.replace(/<pre><code(?:\s+class="language-(\w+)")?>([\s\S]*?)<\/code><\/pre>/gi, (match, lang, code) => {
          const displayLang = lang || 'code';
          return `
            <div class="code-block-container">
              <div class="code-block-header">
                <span>${displayLang.toUpperCase()}</span>
                <button class="code-copy-btn" onclick="window.geminiApp.copyCodeSnippet(this)">
                  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  <span>Copy</span>
                </button>
              </div>
              <pre><code class="language-${displayLang}">${code}</code></pre>
            </div>
          `;
        });
        return html;
      } catch (e) {
        console.error('Marked parse error:', e);
      }
    }

    const escape = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<p>${escape(text).replace(/\n/g, '<br>')}</p>`;
  }

  copyCodeSnippet(button) {
    const codeBlock = button.closest('.code-block-container')?.querySelector('code');
    if (!codeBlock) return;
    const text = codeBlock.textContent || '';
    navigator.clipboard.writeText(text).then(() => {
      const orig = button.innerHTML;
      button.innerHTML = `<span>Copied!</span>`;
      setTimeout(() => { button.innerHTML = orig; }, 1800);
    });
  }

  copyMessageText(text) {
    navigator.clipboard.writeText(text).then(() => {
      this.showToast('Message copied to clipboard!', 'success');
    });
  }

  // -------------------------------------------------------------
  // BACKEND & SUPABASE HEALTH CHECK
  // -------------------------------------------------------------
  async checkBackendHealth() {
    try {
      const data = await window.geminiApi.checkHealth();
      this.isBackendOnline = true;
      this.isSupabaseOnline = Boolean(data.supabase && data.supabase.connected);

      let statusMsg = 'Backend Online';
      if (this.isSupabaseOnline) {
        statusMsg += ' • Supabase ✅';
      } else if (data.supabase && data.supabase.configured === false) {
        statusMsg += ' • Local DB';
      }

      this.updateStatusUI(true, statusMsg);

      if (this.dom.modalStatusDetails) {
        const keyInfo = data.apiKeyConfiguredInEnv ? 'Ready ✅' : 'Missing ⚠️';
        const dbInfo = this.isSupabaseOnline
          ? 'Connected ✅'
          : (data.supabase?.configured ? `Error: ${data.supabase.message}` : 'Not configured in .env (Local storage fallback)');

        this.dom.modalStatusDetails.innerHTML = `
          <strong>Backend:</strong> Online (Port 5000)<br>
          <strong>Gemini API Key:</strong> ${keyInfo}<br>
          <strong>Supabase Database:</strong> ${dbInfo}<br>
          <strong>Active Model:</strong> ${data.defaultModel}
        `;
      }
    } catch (err) {
      this.isBackendOnline = false;
      this.isSupabaseOnline = false;
      this.updateStatusUI(false, 'Backend Offline');
      if (this.dom.modalStatusDetails) {
        this.dom.modalStatusDetails.textContent = `Error connecting to ${window.geminiApi.getBaseUrl()}. Run "npm start" in backend folder.`;
      }
    }
  }

  updateStatusUI(isOnline, text) {
    if (this.dom.statusText) this.dom.statusText.textContent = text;
    if (this.dom.sidebarStatusDot) {
      this.dom.sidebarStatusDot.className = `status-pulse-dot ${isOnline ? 'online' : 'offline'}`;
    }
    const indicator = this.dom.backendStatusPill?.querySelector('.status-indicator');
    if (indicator) {
      indicator.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
    }
  }

  // -------------------------------------------------------------
  // UI RENDERING
  // -------------------------------------------------------------
  renderHistoryList() {
    if (!this.dom.historyList) return;
    this.dom.historyList.innerHTML = '';

    if (this.sessions.length === 0) {
      this.dom.historyList.innerHTML = `<div class="history-empty">No conversations yet</div>`;
      return;
    }

    this.sessions.forEach(session => {
      const item = document.createElement('div');
      item.className = `history-item ${session.id === this.currentSessionId ? 'active' : ''}`;
      item.title = session.title;

      item.innerHTML = `
        <span class="history-item-title">${this.escapeHtml(session.title)}</span>
        <button class="history-item-del" title="Delete conversation">&times;</button>
      `;

      item.addEventListener('click', () => this.switchSession(session.id));
      const delBtn = item.querySelector('.history-item-del');
      delBtn.addEventListener('click', (e) => this.deleteSession(session.id, e));

      this.dom.historyList.appendChild(item);
    });
  }

  renderCurrentSession() {
    const session = this.getCurrentSession();
    if (!session || !session.messages || session.messages.length === 0) {
      this.dom.welcomeHero.style.display = 'flex';
      this.dom.chatMessages.innerHTML = '';
      return;
    }

    this.dom.welcomeHero.style.display = 'none';
    this.dom.chatMessages.innerHTML = '';

    session.messages.forEach(msg => {
      this.appendMessageElement(msg.role, msg.text, msg.model, false);
    });

    this.scrollToBottom();
  }

  appendMessageElement(role, text, model = null, animate = true) {
    this.dom.welcomeHero.style.display = 'none';

    const row = document.createElement('div');
    row.className = `message-row ${role}`;
    if (!animate) row.style.animation = 'none';

    const isUser = role === 'user';
    const avatarContent = isUser
      ? '<span>You</span>'
      : `<img src="assets/avatar.jpg" alt="Gemini" onerror="this.outerHTML='<span>✨</span>'">`;

    const renderedHtml = isUser
      ? this.escapeHtml(text)
      : this.renderMarkdown(text);

    const modelTag = (!isUser && model) ? `<span class="active-badge" style="font-size:0.65rem; padding: 1px 6px;">${model}</span>` : '';

    row.innerHTML = `
      <div class="message-avatar">
        ${avatarContent}
      </div>
      <div class="message-content-wrapper">
        <div class="message-bubble">${renderedHtml}</div>
        <div class="message-meta">
          <span>${isUser ? 'You' : 'Gemini'}</span>
          ${modelTag}
          <div class="message-actions-bar">
            <button class="bubble-action-btn copy-msg-btn" title="Copy text">
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Copy</span>
            </button>
          </div>
        </div>
      </div>
    `;

    const copyBtn = row.querySelector('.copy-msg-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => this.copyMessageText(text));
    }

    this.dom.chatMessages.appendChild(row);
    this.scrollToBottom();
    return row;
  }

  // -------------------------------------------------------------
  // SEND MESSAGE HANDLER
  // -------------------------------------------------------------
  async handleSendMessage(textToSend = null) {
    const rawText = textToSend !== null ? textToSend : this.dom.userInput.value;
    const message = rawText.trim();
    if (!message || this.isGenerating) return;

    const session = this.getCurrentSession();
    if (!session) return;

    // Reset textarea
    this.dom.userInput.value = '';
    this.adjustTextareaHeight();
    this.playTone('send');

    // 1. Add user message
    if (!session.messages) session.messages = [];
    session.messages.push({ role: 'user', text: message });
    if (session.messages.length === 1) {
      session.title = message.slice(0, 32) + (message.length > 32 ? '...' : '');
    }
    this.saveSessionsToLocal();
    this.appendMessageElement('user', message);

    // 2. Prepare request data
    const selectedModel = this.dom.modelSelect.value;
    const personaKey = this.dom.personaSelect.value;
    const systemPrompt = this.settings.customSystemPrompt || PERSONA_PRESETS[personaKey] || PERSONA_PRESETS.default;
    const historyPayload = session.messages.slice(0, -1).map(m => ({
      role: m.role,
      text: m.text
    }));

    const apiKey = this.settings.customApiKey || undefined;
    const isStreaming = this.dom.streamToggle.checked;

    // 3. UI Generation State
    this.isGenerating = true;
    this.dom.sendBtn.disabled = true;
    this.dom.stopStreamBtn.style.display = isStreaming ? 'flex' : 'none';

    if (isStreaming) {
      await this.executeStreamChat({
        message,
        history: historyPayload,
        model: selectedModel,
        systemInstruction: systemPrompt,
        apiKey,
        session
      });
    } else {
      await this.executeStandardChat({
        message,
        history: historyPayload,
        model: selectedModel,
        systemInstruction: systemPrompt,
        apiKey,
        session
      });
    }

    this.isGenerating = false;
    this.dom.sendBtn.disabled = false;
    this.dom.stopStreamBtn.style.display = 'none';
    this.dom.userInput.focus();
  }

  // -------------------------------------------------------------
  // STREAMING CHAT EXECUTION (PERSISTED TO SUPABASE)
  // -------------------------------------------------------------
  async executeStreamChat({ message, history, model, systemInstruction, apiKey, session }) {
    this.abortController = new AbortController();

    const row = document.createElement('div');
    row.className = 'message-row bot';
    row.innerHTML = `
      <div class="message-avatar">
        <img src="assets/avatar.jpg" alt="Gemini" onerror="this.outerHTML='<span>✨</span>'">
      </div>
      <div class="message-content-wrapper">
        <div class="message-bubble"><span class="stream-content"></span><span class="streaming-cursor"></span></div>
        <div class="message-meta">
          <span>Gemini</span>
          <span class="active-badge" style="font-size:0.65rem; padding: 1px 6px;">${model}</span>
        </div>
      </div>
    `;
    this.dom.chatMessages.appendChild(row);
    this.scrollToBottom();

    const contentSpan = row.querySelector('.stream-content');
    let accumulatedText = '';

    await window.geminiApi.streamMessage({
      message,
      history,
      model,
      systemInstruction,
      apiKey,
      sessionId: session.id,
      sessionTitle: session.title,
      signal: this.abortController.signal,
      onChunk: (chunk) => {
        accumulatedText += chunk;
        contentSpan.innerHTML = this.renderMarkdown(accumulatedText);
        this.scrollToBottom();
      },
      onError: (err) => {
        console.error('Stream error:', err);
        const cursor = row.querySelector('.streaming-cursor');
        if (cursor) cursor.remove();

        const errMsg = err.message || 'Error communicating with Gemini.';
        contentSpan.innerHTML = `<span style="color:var(--danger)">⚠️ ${this.escapeHtml(errMsg)}</span>`;
        this.handleApiErrorAlert(errMsg);
      },
      onDone: () => {
        const cursor = row.querySelector('.streaming-cursor');
        if (cursor) cursor.remove();

        if (accumulatedText.trim()) {
          session.messages.push({ role: 'model', text: accumulatedText, model });
          this.saveSessionsToLocal();
          this.playTone('receive');

          const meta = row.querySelector('.message-meta');
          if (meta) {
            meta.innerHTML += `
              <div class="message-actions-bar">
                <button class="bubble-action-btn copy-msg-btn" title="Copy text">
                  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  <span>Copy</span>
                </button>
              </div>
            `;
            const copyBtn = meta.querySelector('.copy-msg-btn');
            if (copyBtn) {
              copyBtn.addEventListener('click', () => this.copyMessageText(accumulatedText));
            }
          }
        }
      }
    });
  }

  // -------------------------------------------------------------
  // STANDARD CHAT EXECUTION (PERSISTED TO SUPABASE)
  // -------------------------------------------------------------
  async executeStandardChat({ message, history, model, systemInstruction, apiKey, session }) {
    this.dom.typingIndicator.style.display = 'flex';
    this.scrollToBottom();

    try {
      const data = await window.geminiApi.sendMessage({
        message,
        history,
        model,
        systemInstruction,
        apiKey,
        sessionId: session.id,
        sessionTitle: session.title
      });

      this.dom.typingIndicator.style.display = 'none';
      const reply = data.reply || 'No response generated.';
      session.messages.push({ role: 'model', text: reply, model });
      this.saveSessionsToLocal();
      this.appendMessageElement('model', reply, model);
      this.playTone('receive');
    } catch (err) {
      this.dom.typingIndicator.style.display = 'none';
      console.error('Chat error:', err);
      const errMsg = err.message || 'Error communicating with Gemini.';
      this.appendMessageElement('model', `⚠️ **Error:** ${errMsg}`);
      this.handleApiErrorAlert(errMsg);
    }
  }

  handleApiErrorAlert(errMsg) {
    if (errMsg.includes('API key is missing') || errMsg.includes('API key not valid') || errMsg.includes('API_KEY_INVALID')) {
      this.showToast('Gemini API key is required! Open settings or update backend/.env', 'error');
      setTimeout(() => this.openSettingsModal(), 600);
    } else {
      this.showToast(errMsg, 'error');
    }
  }

  // -------------------------------------------------------------
  // EXPORT CONVERSATION
  // -------------------------------------------------------------
  exportConversation() {
    const session = this.getCurrentSession();
    if (!session || !session.messages || session.messages.length === 0) {
      this.showToast('No messages to export.', 'info');
      return;
    }

    let md = `# ${session.title}\n`;
    md += `*Exported on: ${new Date().toLocaleString()}*\n\n---\n\n`;

    session.messages.forEach(msg => {
      const author = msg.role === 'user' ? '### 👤 User' : `### ✨ Gemini (${msg.model || 'model'})`;
      md += `${author}\n\n${msg.text}\n\n---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.title.toLowerCase().replace(/[^a-z0-9]/gi, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('Conversation exported as Markdown!', 'success');
  }

  // -------------------------------------------------------------
  // UI UTILITIES
  // -------------------------------------------------------------
  adjustTextareaHeight() {
    const el = this.dom.userInput;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  scrollToBottom() {
    const el = this.dom.messagesArea;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }

  openSettingsModal() {
    this.dom.settingsModal.style.display = 'flex';
    this.checkBackendHealth();
  }

  closeSettingsModal() {
    this.dom.settingsModal.style.display = 'none';
  }

  closeSidebarOnMobile() {
    if (window.innerWidth <= 768) {
      this.dom.appSidebar.classList.remove('open');
      this.dom.sidebarBackdrop.classList.remove('active');
    }
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span><span>${this.escapeHtml(message)}</span>`;

    this.dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // -------------------------------------------------------------
  // EVENT LISTENERS
  // -------------------------------------------------------------
  setupEventListeners() {
    // Send message via button
    this.dom.sendBtn.addEventListener('click', () => this.handleSendMessage());

    // Stop streaming button
    this.dom.stopStreamBtn.addEventListener('click', () => {
      if (this.abortController) {
        this.abortController.abort();
        this.showToast('Generation stopped', 'info');
      }
    });

    // Auto-resize & Enter/Shift+Enter handler
    this.dom.userInput.addEventListener('input', () => this.adjustTextareaHeight());
    this.dom.userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSendMessage();
      }
    });

    // Model select change
    this.dom.modelSelect.addEventListener('change', () => {
      this.saveSettings();
      this.showToast(`Active model changed to: ${this.dom.modelSelect.value}`, 'info');
    });

    // Persona change
    this.dom.personaSelect.addEventListener('change', () => {
      this.saveSettings();
      this.showToast(`Persona set to: ${this.dom.personaSelect.options[this.dom.personaSelect.selectedIndex].text}`, 'info');
    });

    // Toggles
    this.dom.streamToggle.addEventListener('change', () => this.saveSettings());
    this.dom.soundToggle.addEventListener('change', () => this.saveSettings());

    // New Chat
    this.dom.newChatBtn.addEventListener('click', () => this.createNewSession());

    // Clear current chat
    this.dom.clearChatBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear the messages in this chat?')) {
        this.clearCurrentSession();
      }
    });

    // Clear all history
    this.dom.clearAllHistoryBtn.addEventListener('click', () => {
      if (confirm('Clear all conversation history? This cannot be undone.')) {
        this.sessions = [];
        this.createNewSession();
        this.showToast('All chat history cleared.', 'info');
      }
    });

    // Export Chat
    this.dom.exportChatBtn.addEventListener('click', () => this.exportConversation());

    // Starter Prompt Chips
    document.querySelectorAll('.prompt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.getAttribute('data-prompt');
        if (prompt) {
          this.handleSendMessage(prompt);
        }
      });
    });

    // Mobile Sidebar toggle
    this.dom.mobileMenuBtn.addEventListener('click', () => {
      this.dom.appSidebar.classList.add('open');
      this.dom.sidebarBackdrop.classList.add('active');
    });

    this.dom.closeSidebarBtn.addEventListener('click', () => this.closeSidebarOnMobile());
    this.dom.sidebarBackdrop.addEventListener('click', () => this.closeSidebarOnMobile());

    // Settings Modal
    this.dom.openSettingsBtn.addEventListener('click', () => this.openSettingsModal());
    this.dom.backendStatusPill.addEventListener('click', () => this.openSettingsModal());
    this.dom.closeSettingsModal.addEventListener('click', () => this.closeSettingsModal());
    this.dom.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.dom.settingsModal) this.closeSettingsModal();
    });

    // Toggle API Key visibility
    this.dom.toggleKeyVisibility.addEventListener('click', () => {
      const type = this.dom.customApiKeyInput.type === 'password' ? 'text' : 'password';
      this.dom.customApiKeyInput.type = type;
      this.dom.toggleKeyVisibility.textContent = type === 'password' ? '👁️' : '🔒';
    });

    // Test Connection in Modal
    this.dom.testConnectionBtn.addEventListener('click', async () => {
      this.dom.modalStatusDetails.textContent = 'Testing backend & database connection...';
      const url = this.dom.backendUrlInput.value.trim() || 'http://localhost:5000';
      window.geminiApi.setBaseUrl(url);
      await this.checkBackendHealth();
    });

    // Save Settings in Modal
    this.dom.saveSettingsBtn.addEventListener('click', async () => {
      this.saveSettings();
      this.closeSettingsModal();
      this.showToast('Settings saved successfully!', 'success');
      await this.checkBackendHealth();
      await this.loadSessions();
    });

    // Scroll to bottom button visibility
    this.dom.messagesArea.addEventListener('scroll', () => {
      const area = this.dom.messagesArea;
      const distanceFromBottom = area.scrollHeight - area.scrollTop - area.clientHeight;
      if (distanceFromBottom > 150) {
        this.dom.scrollBottomBtn.style.display = 'flex';
      } else {
        this.dom.scrollBottomBtn.style.display = 'none';
      }
    });

    this.dom.scrollBottomBtn.addEventListener('click', () => this.scrollToBottom());
  }
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  window.geminiApp = new GeminiChatApp();
});
