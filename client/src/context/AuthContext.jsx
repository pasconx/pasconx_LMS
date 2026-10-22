import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client.js';
import { getClientInfo } from '../utils/device.js';

const HEARTBEAT_MS = 30 * 1000;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionNotice, setSessionNotice] = useState('');

  const checkAuth = async () => {
    try {
      const res = await api.get('/auth/me');
      if (res.success && res.user) {
        setUser(res.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  // Session ended elsewhere (admin reset / lock expired + other device logged in) -> go to login
  useEffect(() => {
    const onEnded = (e) => {
      setUser(null);
      setSessionNotice(e?.detail?.message || 'Your session has ended. Please log in again.');
    };
    window.addEventListener('pasconx:session-ended', onEnded);
    return () => window.removeEventListener('pasconx:session-ended', onEnded);
  }, []);

  // Keep-alive for students: keeps the single-session lock alive while the tab is open,
  // and lets us notice quickly if the session was reset.
  useEffect(() => {
    if (!user || user.role !== 'STUDENT') return undefined;
    const beat = () => {
      api.get('/auth/heartbeat').catch(() => {});
    };
    const timer = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') beat();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user]);

  const login = async (email, password, turnstileToken = null) => {
    const payload = { email, password, clientInfo: getClientInfo() };
    setSessionNotice('');
    if (turnstileToken) {
      payload.turnstileToken = turnstileToken;
    }
    const res = await api.post('/auth/login', payload);
    if (res.success && res.user) {
      setUser(res.user);
      return res;
    }
    throw new Error(res.error || 'Login failed.');
  };


  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser: checkAuth, sessionNotice, clearSessionNotice: () => setSessionNotice('') }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
