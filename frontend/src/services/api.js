import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor for Request (attach auth token if needed)
api.interceptors.request.use(
  (config) => {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        if (user.token) {
          config.headers.Authorization = `Bearer ${user.token}`;
        }
      } catch (e) {
        console.error('Error parsing stored user token:', e);
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor for Response (global error handler)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      console.warn('Unauthorized access, redirecting to login...');
    }
    return Promise.reject(error);
  }
);

export default api;
