// services/api.ts — Axios instance with JWT interceptors and token refresh

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const BASE_URL = '/api/v1';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: attach access token ──────────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('access_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: handle 401 → refresh token ─────────────────────────
let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach(p => (error ? p.reject(error) : p.resolve(token!)));
  failedQueue = [];
}

api.interceptors.response.use(
  res => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }
      original._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        isRefreshing = false;
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        processQueue(null, data.access_token);
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return api(original);
      } catch (err) {
        processQueue(err, null);
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data: object) => api.post('/auth/register', data),
  login: (data: object) => api.post('/auth/login', data),
  refresh: (token: string) => api.post('/auth/refresh', { refresh_token: token }),
  logout: (token: string) => api.post('/auth/logout', { refresh_token: token }),
  me: () => api.get('/auth/me'),
};

// ── Patients ──────────────────────────────────────────────────────────────────
export const patientApi = {
  create: (data: object) => api.post('/patients', data),
  list: (params?: object) => api.get('/patients', { params }),
  get: (id: string) => api.get(`/patients/${id}`),
  recordVitals: (patientId: string, data: object) =>
    api.post(`/patients/${patientId}/vitals`, data),
};

// ── Assessments ───────────────────────────────────────────────────────────────
export const assessmentApi = {
  create: (data: object) => api.post('/assessments', data),
  get: (id: string) => api.get(`/assessments/${id}`),
  forPatient: (patientId: string) => api.get(`/assessments/patient/${patientId}`),
  uploadXray: (assessmentId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/assessments/${assessmentId}/upload-xray`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// ── AI ────────────────────────────────────────────────────────────────────────
export const aiApi = {
  predict: (assessmentId: string, imageId: string) =>
    api.post('/ai/predict', null, { params: { assessment_id: assessmentId, image_id: imageId } }),
  activeModel: () => api.get('/ai/model/active'),
  getPrediction: (id: string) => api.get(`/ai/predictions/${id}`),
  recentPredictions: (limit = 10) => api.get('/ai/predictions/recent/list', { params: { limit } }),
};

// ── Models ────────────────────────────────────────────────────────────────────
export const modelApi = {
  list: () => api.get('/models'),
  upload: (form: FormData) =>
    api.post('/models/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } }),
  activate: (id: string) => api.post(`/models/${id}/activate`),
  deactivate: (id: string) => api.post(`/models/${id}/deactivate`),
};

// ── Reports ───────────────────────────────────────────────────────────────────
export const reportApi = {
  generate: (assessmentId: string, predictionId: string) =>
    api.post('/reports/generate', null, {
      params: { assessment_id: assessmentId, prediction_id: predictionId },
    }),
  download: (filename: string) =>
    api.get(`/reports/download/${filename}`, { responseType: 'blob' }),
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const userApi = {
  list: () => api.get('/users'),
  update: (id: string, data: object) => api.patch(`/users/${id}`, data),
  deactivate: (id: string) => api.delete(`/users/${id}`),
};

export default api;
