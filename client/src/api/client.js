import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Response interceptor for consistent error extraction
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.error || error.message || 'An unexpected error occurred.';
    const status = error.response?.status;
    const code = error.response?.data?.code;

    // Session was replaced / reset by admin / expired -> tell AuthContext to log this browser out
    if (status === 401 && code === 'SESSION_INVALID') {
      window.dispatchEvent(new CustomEvent('pasconx:session-ended', { detail: { message } }));
    }
    return Promise.reject({ message, status, code, data: error.response?.data });
  }
);

export default api;
