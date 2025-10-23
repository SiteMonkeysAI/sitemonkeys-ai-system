// api/lib/session-manager.js
import util from 'util';
// SESSION LIFECYCLE MANAGER
// Handles cache flush, context cleanup, and session state management

/**
 * SESSION MANAGER RESPONSIBILITIES:
 * 1. Cache Flush: Clear user context buffer on logout/session end
 * 2. Memory Cleanup: Prevent ghost recalls from cache pollution
 * 3. State Management: Track active sessions and their resources
 * 4. Graceful Shutdown: Clean up resources on session termination
 */

class SessionManager {
  constructor() {
    this.activeSessions = new Map();
    this.sessionContexts = new Map(); // User context buffers
    this.sessionCaches = new Map(); // Per-session caches
    
    // Standard logging: supports format strings
    this.log = (message, ...args) => {
      const timestamp = new Date().toISOString();
      const formatted = args.length ? util.format(message, ...args) : message;
      console.log(`[${timestamp}] [SESSION-MANAGER] ${formatted}`);
    };
    
    // Error logging: supports format strings, tainted input as argument!
    this.error = (message, ...args) => {
      const timestamp = new Date().toISOString();
      const formatted = args.length ? util.format(message, ...args) : message;
      // Show additional error argument (if present & not in format string)
      if (args.length > 0 && args[args.length - 1] instanceof Error) {
        console.error(`[${timestamp}] [SESSION-MANAGER ERROR] ${formatted}`, args[args.length - 1]);
      } else {
        console.error(`[${timestamp}] [SESSION-MANAGER ERROR] ${formatted}`);
      }
    };
    
    // Auto-cleanup inactive sessions every 10 minutes
    this.cleanupInterval = setInterval(() => {
      this._cleanupInactiveSessions();
    }, 10 * 60 * 1000);
    
    this.log('Session manager initialized');
  }

  /**
   * Initialize a new session
   */
  initializeSession(sessionId, userId) {
    try {
      if (this.activeSessions.has(sessionId)) {
        this.log("Session %s already initialized", sessionId);
        return this.activeSessions.get(sessionId);
      }
      
      const session = {
        sessionId,
        userId,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        requestCount: 0,
        contextSize: 0,
        resources: {
          documents: new Set(),
          vaultAccess: false,
          memoryLoaded: false
        }
      };
      
      this.activeSessions.set(sessionId, session);
      this.sessionContexts.set(sessionId, {
        conversationHistory: [],
        documentContext: null,
        vaultContext: null,
        userPreferences: {}
      });
      this.sessionCaches.set(sessionId, new Map());
      
      this.log("Session %s initialized for user %s", sessionId, userId);
      return session;
      
    } catch (error) {
      this.error("Failed to initialize session %s", sessionId, error);
      return null;
    }
  }

  /**
   * Update session activity
   */
  updateActivity(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      session.requestCount++;
    }
  }

  /**
   * Get session context
   */
  getContext(sessionId) {
    return this.sessionContexts.get(sessionId) || {
      conversationHistory: [],
      documentContext: null,
      vaultContext: null,
      userPreferences: {}
    };
  }

  /**
   * Update session context
   */
  updateContext(sessionId, contextUpdates) {
    try {
      const context = this.getContext(sessionId);
      
      // Merge updates
      if (contextUpdates.conversationHistory) {
        context.conversationHistory = contextUpdates.conversationHistory;
      }
      if (contextUpdates.documentContext !== undefined) {
        context.documentContext = contextUpdates.documentContext;
      }
      if (contextUpdates.vaultContext !== undefined) {
        context.vaultContext = contextUpdates.vaultContext;
      }
      if (contextUpdates.userPreferences) {
        context.userPreferences = {
          ...context.userPreferences,
          ...contextUpdates.userPreferences
        };
      }
      
      this.sessionContexts.set(sessionId, context);
      
      // Update session stats
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.contextSize = this._calculateContextSize(context);
      }
      
    } catch (error) {
      this.error(`Failed to update context for session ${sessionId}`, error);
    }
  }

  /**
   * Get session cache
   */
  getCache(sessionId) {
    return this.sessionCaches.get(sessionId) || new Map();
  }

  /**
   * Set cache value for session
   */
  setCache(sessionId, key, value) {
    const cache = this.getCache(sessionId);
    cache.set(key, {
      value,
      timestamp: Date.now()
    });
    this.sessionCaches.set(sessionId, cache);
  }

  /**
   * Get cache value for session
   */
  getCacheValue(sessionId, key) {
    const cache = this.getCache(sessionId);
    const entry = cache.get(key);
    return entry ? entry.value : null;
  }

  /**
   * CRITICAL: Flush cache on session end
   * Prevents ghost recalls from cache pollution
   */
  flushCache(sessionId) {
    try {
      const cache = this.sessionCaches.get(sessionId);
      if (cache) {
        const cacheSize = cache.size;
        cache.clear();
        this.log("Cache flushed for session %s: %d entries cleared", sessionId, cacheSize);
      }
      
      // Clear session context
      const context = this.sessionContexts.get(sessionId);
      if (context) {
        context.conversationHistory = [];
        context.documentContext = null;
        context.vaultContext = null;
        this.log("Context cleared for session %s", sessionId);
      }
      
      return true;
      
    } catch (error) {
      this.error("Failed to flush cache for session %s", sessionId, error);
      return false;
    }
  }

  /**
   * End session and cleanup all resources
   */
  endSession(sessionId, reason = 'logout') {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        this.log("Session %s not found for cleanup", sessionId);
        return false;
      }
      
      this.log("Ending session %s (reason: %s)", sessionId, reason);
      
      // Flush cache
      this.flushCache(sessionId);
      
      // Clear document references
      if (session.resources.documents.size > 0) {
        this.log("Clearing %d document references", session.resources.documents.size);
        session.resources.documents.clear();
      }
      
      // Remove from active sessions
      this.activeSessions.delete(sessionId);
      this.sessionContexts.delete(sessionId);
      this.sessionCaches.delete(sessionId);
      
      this.log("Session %s cleanup complete", sessionId);
      return true;
      
    } catch (error) {
      this.error("Failed to end session %s", sessionId, error);
      return false;
    }
  }

  /**
   * Clear user context buffer (prevent ghost recalls)
   */
  clearUserContext(userId) {
    try {
      let cleared = 0;
      
      // Find all sessions for this user
      for (const [sessionId, session] of this.activeSessions.entries()) {
        if (session.userId === userId) {
          this.flushCache(sessionId);
          cleared++;
        }
      }
      
      this.log(`Cleared context for ${cleared} sessions belonging to user ${userId}`);
      return cleared;
      
    } catch (error) {
      this.error(`Failed to clear context for user ${userId}`, error);
      return 0;
    }
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return null;
    }
    
    const context = this.getContext(sessionId);
    const cache = this.getCache(sessionId);
    
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      duration: Date.now() - session.createdAt,
      requestCount: session.requestCount,
      contextSize: session.contextSize,
      cacheSize: cache.size,
      conversationLength: context.conversationHistory.length,
      hasDocuments: !!context.documentContext,
      hasVault: !!context.vaultContext,
      resources: session.resources
    };
  }

  /**
   * Get all active sessions
   */
  getActiveSessions() {
    return Array.from(this.activeSessions.values()).map(session => ({
      sessionId: session.sessionId,
      userId: session.userId,
      lastActivity: session.lastActivity,
      requestCount: session.requestCount
    }));
  }

  /**
   * Get global statistics
   */
  getGlobalStats() {
    return {
      activeSessions: this.activeSessions.size,
      totalContextSize: Array.from(this.activeSessions.values())
        .reduce((sum, s) => sum + s.contextSize, 0),
      totalCacheEntries: Array.from(this.sessionCaches.values())
        .reduce((sum, cache) => sum + cache.size, 0),
      totalRequests: Array.from(this.activeSessions.values())
        .reduce((sum, s) => sum + s.requestCount, 0)
    };
  }

  /**
   * Cleanup inactive sessions (internal)
   */
  _cleanupInactiveSessions() {
    try {
      const now = Date.now();
      const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
      let cleaned = 0;
      
      for (const [sessionId, session] of this.activeSessions.entries()) {
        const inactiveDuration = now - session.lastActivity;
        
        if (inactiveDuration > inactiveThreshold) {
          this.endSession(sessionId, 'inactive_timeout');
          cleaned++;
        }
      }
      
      if (cleaned > 0) {
        this.log(`Cleanup: ${cleaned} inactive sessions removed`);
      }
      
    } catch (error) {
      this.error('Session cleanup failed', error);
    }
  }

  /**
   * Calculate context size (internal)
   */
  _calculateContextSize(context) {
    let size = 0;
    
    if (context.conversationHistory) {
      size += context.conversationHistory.reduce((sum, msg) => 
        sum + (msg.content?.length || 0), 0);
    }
    
    if (context.documentContext) {
      size += context.documentContext.length || 0;
    }
    
    if (context.vaultContext) {
      size += context.vaultContext.length || 0;
    }
    
    return size;
  }

  /**
   * Cleanup on process exit
   */
  cleanup() {
    try {
      this.log('Cleaning up all sessions...');
      
      // Clear interval
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
      
      // End all active sessions
      for (const sessionId of this.activeSessions.keys()) {
        this.endSession(sessionId, 'process_exit');
      }
      
      this.log('Session manager cleanup complete');
      
    } catch (error) {
      this.error('Cleanup failed', error);
    }
  }
}

// Singleton instance
export const sessionManager = new SessionManager();

// Export for global access
if (typeof global !== 'undefined') {
  global.sessionManager = sessionManager;
}

// Cleanup on process exit
process.on('SIGTERM', () => {
  sessionManager.cleanup();
});

process.on('SIGINT', () => {
  sessionManager.cleanup();
  process.exit(0);
});

export default sessionManager;
