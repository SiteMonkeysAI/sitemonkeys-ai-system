/* ============================================================
   UI OVERHAUL — Additive JavaScript
   Loaded AFTER embedded <script> in index.html.
   Accesses globals: conversationHistory, getUserId(), etc.
   Covers: Fix 4 (footer icons), Fix 5 (history panel),
           Fix 6 (account panel)
   ============================================================ */

(function () {
  'use strict';

  // ----------------------------------------------------------------
  // FIX 4 — New Chat + History footer icon handlers
  // ----------------------------------------------------------------

  /**
   * Save the current conversation to localStorage before clearing.
   * Stores up to 50 sessions with FIFO eviction.
   */
  function saveCurrentSession() {
    // conversationHistory is a global from the embedded script
    if (typeof conversationHistory === 'undefined' || conversationHistory.length === 0) return;

    const sessions = JSON.parse(localStorage.getItem('chat_sessions') || '[]');

    // Build messages array from conversation history
    const messages = conversationHistory.map(function (entry) {
      return {
        role: entry.role,
        content: entry.content,
        timestamp: Date.now()
      };
    });

    // Also capture messages from the DOM if conversationHistory is empty
    // (fallback in case conversationHistory doesn't have all messages)
    const firstUserMsg = conversationHistory.find(function (m) {
      return m.role === 'user';
    });

    sessions.unshift({
      id: Date.now().toString(),
      startedAt: new Date().toISOString(),
      firstMessage: firstUserMsg ? firstUserMsg.content.substring(0, 200) : 'Conversation',
      messages: messages
    });

    // Cap at 50 sessions
    if (sessions.length > 50) {
      sessions.length = 50;
    }

    localStorage.setItem('chat_sessions', JSON.stringify(sessions));
  }

  /**
   * Clear the current chat — does NOT wipe persistent memory.
   */
  function clearChat() {
    var box = document.getElementById('chat-box');
    if (box) {
      box.innerHTML = '';
    }

    // Reset the global conversation history array
    if (typeof conversationHistory !== 'undefined') {
      conversationHistory.length = 0;
    }
  }

  /**
   * Show a confirmation dialog before starting a new chat.
   */
  function showNewChatConfirmation() {
    // Don't show multiple confirmations
    if (document.querySelector('.confirm-backdrop')) return;

    var backdrop = document.createElement('div');
    backdrop.className = 'confirm-backdrop';

    var dialog = document.createElement('div');
    dialog.className = 'new-chat-confirm';
    dialog.innerHTML =
      '<p>Start new chat?</p>' +
      '<div class="confirm-subtitle">Your memory is preserved.</div>' +
      '<div class="new-chat-confirm-actions">' +
      '<button class="confirm-yes" id="confirm-new-chat">Confirm</button>' +
      '<button class="confirm-no" id="cancel-new-chat">Cancel</button>' +
      '</div>';

    document.body.appendChild(backdrop);
    document.body.appendChild(dialog);

    document.getElementById('confirm-new-chat').addEventListener('click', function () {
      saveCurrentSession();
      clearChat();
      backdrop.remove();
      dialog.remove();
    });

    document.getElementById('cancel-new-chat').addEventListener('click', function () {
      backdrop.remove();
      dialog.remove();
    });

    backdrop.addEventListener('click', function () {
      backdrop.remove();
      dialog.remove();
    });
  }

  /**
   * Handle New Chat button click.
   */
  function handleNewChat() {
    var box = document.getElementById('chat-box');
    if (box && box.children.length > 0) {
      showNewChatConfirmation();
    } else {
      clearChat();
    }
  }

  // Bind all New Chat buttons (desktop + mobile)
  document.querySelectorAll('.new-chat-trigger').forEach(function (btn) {
    btn.addEventListener('click', handleNewChat);
  });

  // Bind all History buttons (desktop + mobile)
  document.querySelectorAll('.history-trigger').forEach(function (btn) {
    btn.addEventListener('click', openHistoryPanel);
  });

  // ----------------------------------------------------------------
  // FIX 5 — Left Panel: Chat History
  // ----------------------------------------------------------------

  function openHistoryPanel() {
    var backdrop = document.getElementById('history-backdrop');
    var panel = document.getElementById('history-panel');
    if (backdrop) backdrop.classList.add('active');
    if (panel) panel.classList.add('active');
    renderSessionList();
  }

  function closeHistoryPanel() {
    var backdrop = document.getElementById('history-backdrop');
    var panel = document.getElementById('history-panel');
    if (backdrop) backdrop.classList.remove('active');
    if (panel) panel.classList.remove('active');
  }

  // Close history panel on backdrop click
  var historyBackdrop = document.getElementById('history-backdrop');
  if (historyBackdrop) {
    historyBackdrop.addEventListener('click', closeHistoryPanel);
  }

  // Close button inside panel
  var historyClose = document.getElementById('history-panel-close');
  if (historyClose) {
    historyClose.addEventListener('click', closeHistoryPanel);
  }

  /**
   * Render the session list in the history panel.
   */
  function renderSessionList() {
    var sessions = JSON.parse(localStorage.getItem('chat_sessions') || '[]');
    var list = document.getElementById('history-list');
    if (!list) return;

    if (sessions.length === 0) {
      list.innerHTML = '<div class="panel-empty">No previous conversations yet</div>';
      return;
    }

    var html = '';
    sessions.forEach(function (session) {
      var date = new Date(session.startedAt);
      var dateStr = date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      var timeStr = date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      });
      var preview = session.firstMessage
        ? session.firstMessage.substring(0, 80)
        : 'Empty conversation';
      if (session.firstMessage && session.firstMessage.length > 80) {
        preview += '...';
      }

      html +=
        '<div class="session-item" data-session-id="' + session.id + '">' +
        '<button class="session-delete" data-delete-id="' + session.id + '" title="Delete">&times;</button>' +
        '<div class="session-date">' + dateStr + ' at ' + timeStr + '</div>' +
        '<div class="session-preview">' + escapeHtml(preview) + '</div>' +
        '</div>';
    });

    list.innerHTML = html;

    // Bind click handlers for loading sessions
    list.querySelectorAll('.session-item').forEach(function (item) {
      item.addEventListener('click', function (e) {
        // Don't load if clicking delete button
        if (e.target.classList.contains('session-delete')) return;
        var sessionId = item.getAttribute('data-session-id');
        loadSession(sessionId);
      });
    });

    // Bind delete handlers
    list.querySelectorAll('.session-delete').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var deleteId = btn.getAttribute('data-delete-id');
        deleteSession(deleteId);
      });
    });
  }

  /**
   * Load a saved session into the chat view.
   * Read-only display — does NOT re-store to memory.
   */
  function loadSession(sessionId) {
    var sessions = JSON.parse(localStorage.getItem('chat_sessions') || '[]');
    var session = sessions.find(function (s) {
      return s.id === sessionId;
    });
    if (!session) return;

    // Save current conversation first (if any)
    var box = document.getElementById('chat-box');
    if (box && box.children.length > 0 && typeof conversationHistory !== 'undefined' && conversationHistory.length > 0) {
      saveCurrentSession();
    }

    // Clear current chat
    if (box) box.innerHTML = '';
    if (typeof conversationHistory !== 'undefined') {
      conversationHistory.length = 0;
    }

    // Render the saved messages
    session.messages.forEach(function (msg) {
      var bubble = document.createElement('div');

      if (msg.role === 'user') {
        bubble.className = 'bubble user';
        bubble.innerHTML =
          '<div class="bubble-content"><strong>You:</strong> ' +
          escapeHtml(msg.content) +
          '</div>';
      } else {
        bubble.className = 'bubble ai';
        bubble.innerHTML =
          '<div class="bubble-content">' +
          escapeHtml(msg.content) +
          '</div>';
      }

      box.appendChild(bubble);
    });

    // Scroll to top of loaded conversation
    if (box) box.scrollTop = 0;

    closeHistoryPanel();
  }

  /**
   * Delete a saved session from localStorage.
   */
  function deleteSession(sessionId) {
    var sessions = JSON.parse(localStorage.getItem('chat_sessions') || '[]');
    sessions = sessions.filter(function (s) {
      return s.id !== sessionId;
    });
    localStorage.setItem('chat_sessions', JSON.stringify(sessions));
    renderSessionList();
  }

  // ----------------------------------------------------------------
  // FIX 6 — Right Panel: Account Shell
  // ----------------------------------------------------------------

  function openAccountPanel() {
    var backdrop = document.getElementById('account-backdrop');
    var panel = document.getElementById('account-panel');
    if (backdrop) backdrop.classList.add('active');
    if (panel) panel.classList.add('active');
  }

  function closeAccountPanel() {
    var backdrop = document.getElementById('account-backdrop');
    var panel = document.getElementById('account-panel');
    if (backdrop) backdrop.classList.remove('active');
    if (panel) panel.classList.remove('active');
  }

  // Account trigger button
  var accountBtn = document.getElementById('account-btn');
  if (accountBtn) {
    accountBtn.addEventListener('click', openAccountPanel);
  }

  // Close account panel on backdrop click
  var accountBackdrop = document.getElementById('account-backdrop');
  if (accountBackdrop) {
    accountBackdrop.addEventListener('click', closeAccountPanel);
  }

  // Close button inside panel
  var accountClose = document.getElementById('account-panel-close');
  if (accountClose) {
    accountClose.addEventListener('click', closeAccountPanel);
  }

  // Sign In placeholder
  var signInBtn = document.getElementById('sign-in-btn');
  if (signInBtn) {
    signInBtn.addEventListener('click', function () {
      var msg = document.getElementById('auth-placeholder-msg');
      if (msg) {
        msg.classList.add('visible');
        setTimeout(function () {
          msg.classList.remove('visible');
        }, 3000);
      }
    });
  }

  // Create Account placeholder
  var createAccountLink = document.getElementById('create-account-link');
  if (createAccountLink) {
    createAccountLink.addEventListener('click', function (e) {
      e.preventDefault();
      var msg = document.getElementById('auth-placeholder-msg');
      if (msg) {
        msg.textContent = 'Account creation coming soon';
        msg.classList.add('visible');
        setTimeout(function () {
          msg.classList.remove('visible');
          msg.textContent = 'Authentication coming soon';
        }, 3000);
      }
    });
  }

  // ----------------------------------------------------------------
  // Keyboard: Escape key closes any open panel
  // ----------------------------------------------------------------
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeHistoryPanel();
      closeAccountPanel();

      // Also close new chat confirmation if open
      var backdrop = document.querySelector('.confirm-backdrop');
      var dialog = document.querySelector('.new-chat-confirm');
      if (backdrop) backdrop.remove();
      if (dialog) dialog.remove();
    }
  });

  // ----------------------------------------------------------------
  // Utility
  // ----------------------------------------------------------------
  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
