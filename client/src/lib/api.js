import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4000/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("brightloop_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 &&
      !String(error.config?.url).includes("/auth/login")) {
      localStorage.removeItem("brightloop_token");
      localStorage.removeItem("brightloop_admin");
      window.dispatchEvent(new Event("brightloop:logout"));
    }
    return Promise.reject(error);
  },
);

export default api;

export const errorMessage = (error) =>
  error.response?.data?.message || error.message || "Something went wrong.";

export const authApi = {
  login: (credentials) => api.post("/auth/login", credentials).then((response) => response.data.data),
  me: () => api.get("/auth/me").then((response) => response.data.data),
};

export const productApi = {
  list: (params) => api.get("/products", { params }).then((response) => response.data),
  get: (id) => api.get(`/products/${id}`).then((response) => response.data.data),
  create: (data) => api.post("/products", data).then((response) => response.data),
  update: (id, data) => api.put(`/products/${id}`, data).then((response) => response.data),
  status: (id, status) => api.patch(`/products/${id}/status`, { status }).then((response) => response.data),
  duplicate: (id) => api.post(`/products/${id}/duplicate`).then((response) => response.data),
  remove: (id) => api.delete(`/products/${id}`).then((response) => response.data),
  bulk: (ids, action) => api.post("/products/bulk", { ids, action }).then((response) => response.data),
};

export const catalogApi = {
  taxes: () => api.get("/taxes").then((response) => response.data.data),
  templates: () => api.get("/quotation-templates").then((response) => response.data.data),
  createTemplate: (data) => api.post("/quotation-templates", data).then((response) => response.data),
  updateTemplate: (id, data) => api.put(`/quotation-templates/${id}`, data).then((response) => response.data),
  deleteTemplate: (id) => api.delete(`/quotation-templates/${id}`).then((response) => response.data),
};
