const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1';

export const apiClient = {
  get: async (endpoint: string, options: RequestInit = {}) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) {
      let errorDetail = `API error: ${response.status}`;
      try {
        const body = await response.json();
        errorDetail = body.error?.message || body.detail || errorDetail;
      } catch {
        // use default
      }
      throw new Error(errorDetail);
    }
    return response.json();
  },

  post: async (endpoint: string, data: unknown, options: RequestInit = {}) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      let errorDetail = `API error: ${response.status}`;
      try {
        const body = await response.json();
        errorDetail = body.error?.message || body.detail || errorDetail;
      } catch {
        // use default
      }
      throw new Error(errorDetail);
    }
    return response.json();
  },

  put: async (endpoint: string, data: unknown, options: RequestInit = {}) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      let errorDetail = `API error: ${response.status}`;
      try {
        const body = await response.json();
        errorDetail = body.error?.message || body.detail || errorDetail;
      } catch {
        // use default
      }
      throw new Error(errorDetail);
    }
    return response.json();
  },

  patch: async (endpoint: string, data: unknown, options: RequestInit = {}) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      let errorDetail = `API error: ${response.status}`;
      try {
        const body = await response.json();
        errorDetail = body.error?.message || body.detail || errorDetail;
      } catch {
        // use default
      }
      throw new Error(errorDetail);
    }
    return response.json();
  },

  delete: async (endpoint: string, options: RequestInit = {}) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok) {
      let errorDetail = `API error: ${response.status}`;
      try {
        const body = await response.json();
        errorDetail = body.error?.message || body.detail || errorDetail;
      } catch {
        // use default
      }
      throw new Error(errorDetail);
    }
    return response.json();
  },

  upload: async (endpoint: string, formData: FormData, options: RequestInit = {}) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!response.ok) {
      let errorDetail = `Upload error: ${response.status}`;
      try {
        const body = await response.json();
        errorDetail = body.error?.message || body.detail || errorDetail;
      } catch {
        // use default
      }
      throw new Error(errorDetail);
    }
    return response.json();
  },
};

export const adminManufacturingApi = {
  listQueue: (params?: {
    status?: string;
    prototype_type?: string;
    sort_by?: string;
    order?: string;
    page?: number;
    page_size?: number;
  }, token?: string) => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.prototype_type) q.append('prototype_type', params.prototype_type);
    if (params?.sort_by) q.append('sort_by', params.sort_by);
    if (params?.order) q.append('order', params.order);
    if (params?.page) q.append('page', String(params.page));
    if (params?.page_size) q.append('page_size', String(params.page_size));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get(`/admin/manufacturing/requests${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  listCancellationQueue: (token?: string) =>
    apiClient.get('/admin/manufacturing/cancellation-review-queue', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  getRequest: (id: string, token?: string) =>
    apiClient.get(`/admin/manufacturing/requests/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  confirmRequirements: (id: string, notes?: string, token?: string) =>
    apiClient.post(`/admin/manufacturing/requests/${id}/confirm-requirements`, { notes }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  raiseClarification: (id: string, question: string, token?: string) =>
    apiClient.post(`/admin/manufacturing/requests/${id}/clarifications`, { question }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  postStatusUpdate: (id: string, note: string, token?: string) =>
    apiClient.post(`/admin/manufacturing/requests/${id}/status-update`, { note }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  completeExecution: (id: string, token?: string) =>
    apiClient.post(`/admin/manufacturing/requests/${id}/complete-execution`, {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  completeRequest: (id: string, token?: string) =>
    apiClient.post(`/admin/manufacturing/requests/${id}/complete`, {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  resolveCancellation: (
    id: string,
    data: { decision: 'approved' | 'declined'; refund_amount?: string; notes?: string },
    token?: string
  ) =>
    apiClient.post(`/admin/manufacturing/requests/${id}/resolve-cancellation`, data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

export const adminQuotesApi = {
  draftQuote: (
    data: {
      request_type: string;
      request_id: string;
      line_items: Array<{ description: string; amount: string }>;
      shipping_amount?: string;
      estimated_timeline?: string;
      valid_until?: string;
      terms?: string;
      scope_summary?: string;
    },
    token?: string
  ) =>
    apiClient.post('/admin/quotes', data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  getQuote: (id: string, token?: string) =>
    apiClient.get(`/admin/quotes/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  sendQuote: (id: string, token?: string) =>
    apiClient.post(`/admin/quotes/${id}/send`, {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  reviseQuote: (
    id: string,
    data: {
      line_items: Array<{ description: string; amount: string }>;
      shipping_amount?: string;
      estimated_timeline?: string;
      valid_until?: string;
      terms?: string;
      scope_summary?: string;
    },
    token?: string
  ) =>
    apiClient.post(`/admin/quotes/${id}/revise`, data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  updateDraftQuote: (
    id: string,
    data: {
      line_items?: Array<{ description: string; amount: string }>;
      shipping_amount?: string;
      estimated_timeline?: string;
      valid_until?: string;
      terms?: string;
      scope_summary?: string;
    },
    token?: string
  ) =>
    apiClient.patch(`/admin/quotes/${id}/draft`, data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  listQuoteApprovals: (id: string, token?: string) =>
    apiClient.get(`/admin/quotes/${id}/approvals`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  cancelQuote: (id: string, token?: string) =>
    apiClient.post(`/admin/quotes/${id}/cancel`, {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

export const adminFilesApi = {
  uploadDeliverable: (formData: FormData, token?: string) =>
    apiClient.upload('/admin/files', formData, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  overrideScan: (fileId: string, status: string, notes?: string, token?: string) =>
    apiClient.post(`/admin/files/${fileId}/override-scan`, { status, notes }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  listPendingScan: (token?: string) =>
    apiClient.get('/admin/files/pending-scan', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

// Phase 9 Admin APIs
export const adminConsultationsApi = {
  listQueue: (status?: string, page?: number, pageSize?: number, token?: string) => {
    const q = new URLSearchParams();
    if (status) q.append('status', status);
    if (page) q.append('page', String(page));
    if (pageSize) q.append('page_size', String(pageSize));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get(`/admin/consultations${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  getRequest: (id: string, token?: string) =>
    apiClient.get(`/admin/consultations/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  respond: (id: string, data: { admin_response: string; internal_notes?: string }, token?: string) =>
    apiClient.post(`/admin/consultations/${id}/respond`, data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  convertToQuote: (
    id: string,
    data: {
      line_items: Array<{ name: string; amount: string }>;
      shipping_amount?: string;
      destination_state?: string;
      estimated_timeline?: string;
      valid_until?: string;
      terms?: string;
      scope_summary?: string;
    },
    token?: string
  ) =>
    apiClient.post(`/admin/consultations/${id}/convert-to-quote`, data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  close: (id: string, data?: { notes?: string }, token?: string) =>
    apiClient.post(`/admin/consultations/${id}/close`, data || {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  raiseClarification: (id: string, question: string, token?: string) =>
    apiClient.post(`/admin/consultations/${id}/clarifications`, { question }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  resolveClarification: (id: string, clarificationId: string, token?: string) =>
    apiClient.post(`/admin/consultations/${id}/clarifications/${clarificationId}/resolve`, {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

export const adminDesignApi = {
  listQueue: (params?: { status?: string; page?: number; page_size?: number }, token?: string) => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.page) q.append('page', String(params.page));
    if (params?.page_size) q.append('page_size', String(params.page_size));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get(`/admin/design/requests${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  listCancellationQueue: (token?: string) =>
    apiClient.get('/admin/design/cancellation-review-queue', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  getRequest: (id: string, token?: string) =>
    apiClient.get(`/admin/design/requests/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  confirmRequirements: (id: string, notes?: string, token?: string) =>
    apiClient.post(`/admin/design/requests/${id}/confirm-requirements`, { notes }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  raiseClarification: (id: string, question: string, token?: string) =>
    apiClient.post(`/admin/design/requests/${id}/clarifications`, { question }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  resolveClarification: (id: string, clarificationId: string, token?: string) =>
    apiClient.post(`/admin/design/requests/${id}/clarifications/${clarificationId}/resolve`, {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  postStatusUpdate: (id: string, note: string, token?: string) =>
    apiClient.post(`/admin/design/requests/${id}/status-update`, { note }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  completeExecution: (id: string, token?: string) =>
    apiClient.post(`/admin/design/requests/${id}/complete-execution`, {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  completeRequest: (id: string, token?: string) =>
    apiClient.post(`/admin/design/requests/${id}/complete`, {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  resolveCancellation: (
    id: string,
    data: { decision: 'approved' | 'declined'; refund_amount?: string; notes?: string },
    token?: string
  ) =>
    apiClient.post(`/admin/design/requests/${id}/resolve-cancellation`, data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

export const adminSoftwareApi = {
  listQueue: (params?: { status?: string; page?: number; page_size?: number }, token?: string) => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.page) q.append('page', String(params.page));
    if (params?.page_size) q.append('page_size', String(params.page_size));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get(`/admin/software/requests${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  listCancellationQueue: (token?: string) =>
    apiClient.get('/admin/software/cancellation-review-queue', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  getRequest: (id: string, token?: string) =>
    apiClient.get(`/admin/software/requests/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  confirmRequirements: (id: string, notes?: string, token?: string) =>
    apiClient.post(`/admin/software/requests/${id}/confirm-requirements`, { notes }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  raiseClarification: (id: string, question: string, token?: string) =>
    apiClient.post(`/admin/software/requests/${id}/clarifications`, { question }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  resolveClarification: (id: string, clarificationId: string, token?: string) =>
    apiClient.post(`/admin/software/requests/${id}/clarifications/${clarificationId}/resolve`, {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  postStatusUpdate: (id: string, note: string, token?: string) =>
    apiClient.post(`/admin/software/requests/${id}/status-update`, { note }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  completeExecution: (id: string, token?: string) =>
    apiClient.post(`/admin/software/requests/${id}/complete-execution`, {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  completeRequest: (id: string, token?: string) =>
    apiClient.post(`/admin/software/requests/${id}/complete`, {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  resolveCancellation: (
    id: string,
    data: { decision: 'approved' | 'declined'; refund_amount?: string; notes?: string },
    token?: string
  ) =>
    apiClient.post(`/admin/software/requests/${id}/resolve-cancellation`, data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

