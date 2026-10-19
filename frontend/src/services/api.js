import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
});

// Interceptor for Request (attach auth token if needed)
api.interceptors.request.use(
  (config) => {
    // Let the browser generate the multipart boundary. Forcing application/json
    // here makes multer see an empty request and req.file remains undefined.
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      delete config.headers['Content-Type'];
      delete config.headers['content-type'];
    }
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
