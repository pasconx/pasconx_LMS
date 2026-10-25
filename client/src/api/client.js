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
    const rawError = error.response?.data?.error || error.response?.data?.message || error.message;
    let message = 'An unexpected error occurred.';

    if (typeof rawError === 'string') {
      message = rawError;
    } else if (rawError && typeof rawError === 'object') {
      message = rawError.message || rawError.error || rawError.code || JSON.stringify(rawError);
    }

    const status = error.response?.status;
    const code = error.response?.data?.code || (typeof rawError === 'object' ? rawError.code : undefined);

    // Session was replaced / reset by admin / expired -> tell AuthContext to log this browser out
    if (status === 401 && code === 'SESSION_INVALID') {
      window.dispatchEvent(new CustomEvent('pasconx:session-ended', { detail: { message } }));
    }
    return Promise.reject({ message, status, code, data: error.response?.data });
  }
);

export default api;
