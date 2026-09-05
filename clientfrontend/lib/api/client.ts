const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1';

export const apiClient = {
  get: async (endpoint: string, options: RequestInit = {}) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      method: 'GET',
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || errData?.detail?.message || `API error: ${response.status}`);
    }
    return response.json();
  },
  post: async (endpoint: string, data: unknown, options: RequestInit = {}) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || errData?.detail?.message || `API error: ${response.status}`);
    }
    return response.json();
  },
  put: async (endpoint: string, data: unknown, options: RequestInit = {}) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || errData?.detail?.message || `API error: ${response.status}`);
    }
    return response.json();
  },
  patch: async (endpoint: string, data: unknown, options: RequestInit = {}) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || errData?.detail?.message || `API error: ${response.status}`);
    }
    return response.json();
  },
  delete: async (endpoint: string, options: RequestInit = {}) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      method: 'DELETE',
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || errData?.detail?.message || `API error: ${response.status}`);
    }
    return response.json();
  },
  upload: async (endpoint: string, formData: FormData, options: RequestInit = {}) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || errData?.detail?.message || `API error: ${response.status}`);
    }
    return response.json();
  },
};

// Phase 8 Domain APIs
export const manufacturingApi = {
  createRequest: (data: unknown, token?: string) =>
    apiClient.post('/manufacturing/requests', data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  listRequests: (params?: { page?: number; page_size?: number }, token?: string) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', params.page.toString());
    if (params?.page_size) qs.set('page_size', params.page_size.toString());
    return apiClient.get(`/manufacturing/requests${qs.toString() ? `?${qs.toString()}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
  getRequest: (id: string, token?: string) =>
    apiClient.get(`/manufacturing/requests/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  cancelRequest: (id: string, reason?: string, token?: string) =>
    apiClient.post(`/manufacturing/requests/${id}/cancel`, { reason }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  listClarifications: (id: string, token?: string) =>
    apiClient.get(`/manufacturing/requests/${id}/clarifications`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  respondClarification: (id: string, clarificationId: string, text: string, attachedFileIds?: string[], token?: string) =>
    apiClient.post(`/manufacturing/requests/${id}/clarifications/${clarificationId}/respond`, { text, attached_file_ids: attachedFileIds }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  getHistory: (id: string, token?: string) =>
    apiClient.get(`/manufacturing/requests/${id}/history`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

export const projectsApi = {
  listProjects: (token?: string) =>
    apiClient.get('/projects', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  createProject: (name: string, token?: string) =>
    apiClient.post('/projects', { name }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  getProject: (id: string, token?: string) =>
    apiClient.get(`/projects/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  renameProject: (id: string, name: string, token?: string) =>
    apiClient.patch(`/projects/${id}`, { name }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  linkRequest: (id: string, requestType: string, requestId: string, token?: string) =>
    apiClient.post(`/projects/${id}/link`, { request_type: requestType, request_id: requestId }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  unlinkRequest: (id: string, requestType: string, requestId: string, token?: string) =>
    apiClient.post(`/projects/${id}/unlink`, { request_type: requestType, request_id: requestId }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  getProjectFiles: (id: string, token?: string) =>
    apiClient.get(`/projects/${id}/files`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

export const quotesApi = {
  listQuotes: (token?: string) =>
    apiClient.get('/quotes', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  getQuote: (id: string, token?: string) =>
    apiClient.get(`/quotes/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  approveQuote: (id: string, token?: string) =>
    apiClient.post(`/quotes/${id}/approve`, {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  rejectQuote: (id: string, reason?: string, token?: string) =>
    apiClient.post(`/quotes/${id}/reject`, { reason }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

export const filesApi = {
  uploadFile: (formData: FormData, token?: string) =>
    apiClient.upload('/files', formData, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  getMetadata: (fileId: string, token?: string) =>
    apiClient.get(`/files/${fileId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  getDownloadUrl: (fileId: string, token?: string) =>
    apiClient.get(`/files/${fileId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  deleteFile: (fileId: string, token?: string) =>
    apiClient.delete(`/files/${fileId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};
