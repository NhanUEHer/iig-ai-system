import axios from 'axios';

const STORAGE_KEY = 'currentUser';

export function readSession() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return value?.token ? value : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(notify = true) {
  localStorage.removeItem(STORAGE_KEY);
  if (notify) window.dispatchEvent(new CustomEvent('auth:logout'));
}

axios.interceptors.request.use(config => {
  const session = readSession();
  if (session?.token) config.headers.Authorization = `Bearer ${session.token}`;
  return config;
});

axios.interceptors.response.use(response => {
  const refreshedToken = response.headers['x-access-token'];
  if (refreshedToken) {
    const session = readSession();
    if (session) saveSession({ ...session, token: refreshedToken });
  }
  return response;
}, error => {
  const isLoginRequest = error.config?.url?.includes('/auth/login');
  if (error.response?.status === 401 && !isLoginRequest) clearSession();
  return Promise.reject(error);
});
