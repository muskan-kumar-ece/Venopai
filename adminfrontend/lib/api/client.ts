export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1';
}

function isValidAdminToken(token: unknown): token is string {
  if (typeof token !== 'string') return false;
  const trimmed = token.trim();
  return trimmed !== '' && trimmed !== 'undefined' && trimmed !== 'null' && trimmed !== '[object Object]';
}

export function clearAdminTokens(): void {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem('venopai_admin_token');
      sessionStorage.removeItem('admin_token');
      sessionStorage.removeItem('venopai_admin_refresh_token');
      sessionStorage.removeItem('admin_refresh_token');
      sessionStorage.removeItem('venopai_admin_user');
      sessionStorage.removeItem('admin_user');
      localStorage.removeItem('venopai_admin_token');
      localStorage.removeItem('admin_token');
      localStorage.removeItem('venopai_admin_refresh_token');
      localStorage.removeItem('admin_refresh_token');
      localStorage.removeItem('venopai_admin_user');
      localStorage.removeItem('admin_user');
    } catch {
      // ignore
    }
  }
}

export function getAdminToken(): string | null {
  if (typeof window !== 'undefined') {
    try {
      const candidates = [
        sessionStorage.getItem('venopai_admin_token'),
        sessionStorage.getItem('admin_token'),
        localStorage.getItem('admin_token'),
        localStorage.getItem('venopai_admin_token'),
      ];
      for (const token of candidates) {
        if (isValidAdminToken(token)) return token;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export function getAdminRefreshToken(): string | null {
  if (typeof window !== 'undefined') {
    try {
      const candidates = [
        sessionStorage.getItem('venopai_admin_refresh_token'),
        sessionStorage.getItem('admin_refresh_token'),
        localStorage.getItem('admin_refresh_token'),
        localStorage.getItem('venopai_admin_refresh_token'),
      ];
      for (const token of candidates) {
        if (isValidAdminToken(token)) return token;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function getAdminAuthHeaders(): Record<string, string> {
  const token = getAdminToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

let isAdminRefreshing = false;
let adminRefreshSubscribers: Array<(newToken: string | null) => void> = [];

function onAdminTokenRefreshed(newToken: string | null) {
  adminRefreshSubscribers.forEach((cb) => cb(newToken));
  adminRefreshSubscribers = [];
}

function addAdminRefreshSubscriber(cb: (newToken: string | null) => void) {
  adminRefreshSubscribers.push(cb);
}

export async function silentAdminRefresh(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  if (isAdminRefreshing) {
    return new Promise((resolve) => {
      addAdminRefreshSubscriber((token) => resolve(token));
    });
  }

  isAdminRefreshing = true;
  try {
    const fallbackRefreshToken = getAdminRefreshToken();
    const res = await fetch(`${getApiBaseUrl()}/admin/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(fallbackRefreshToken ? { Authorization: `Bearer ${fallbackRefreshToken}` } : {}),
      },
      body: JSON.stringify({ refresh_token: fallbackRefreshToken }),
    });

    if (!res.ok) {
      clearAdminTokens();
      onAdminTokenRefreshed(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('venopai_admin_unauthorized'));
        const currentPath = window.location.pathname;
        if (!currentPath.includes('/admin/login')) {
          window.location.href = `/admin/login?redirect=${encodeURIComponent(currentPath)}`;
        }
      }
      return null;
    }

    const json = await res.json();
    const newAccessToken = json?.data?.access_token;
    const newRefreshToken = json?.data?.refresh_token;
    const user = json?.data?.user;

    if (newAccessToken && isValidAdminToken(newAccessToken)) {
      sessionStorage.setItem('venopai_admin_token', newAccessToken);
      sessionStorage.setItem('admin_token', newAccessToken);
      localStorage.setItem('admin_token', newAccessToken);
      localStorage.setItem('venopai_admin_token', newAccessToken);
      if (newRefreshToken && isValidAdminToken(newRefreshToken)) {
        sessionStorage.setItem('venopai_admin_refresh_token', newRefreshToken);
        sessionStorage.setItem('admin_refresh_token', newRefreshToken);
        localStorage.setItem('admin_refresh_token', newRefreshToken);
        localStorage.setItem('venopai_admin_refresh_token', newRefreshToken);
      }
      if (user) {
        sessionStorage.setItem('venopai_admin_user', JSON.stringify(user));
        localStorage.setItem('venopai_admin_user', JSON.stringify(user));
      }
      onAdminTokenRefreshed(newAccessToken);
      window.dispatchEvent(new CustomEvent('venopai_admin_refreshed', { detail: { token: newAccessToken, user } }));
      return newAccessToken;
    } else {
      clearAdminTokens();
      onAdminTokenRefreshed(null);
      return null;
    }
  } catch {
    clearAdminTokens();
    onAdminTokenRefreshed(null);
    return null;
  } finally {
    isAdminRefreshing = false;
  }
}

async function handleAdminResponse(response: Response): Promise<any> {
  if (!response.ok) {
    if (response.status === 401) {
      clearAdminTokens();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('venopai_admin_unauthorized'));
        const currentPath = window.location.pathname;
        if (!currentPath.includes('/admin/login')) {
          window.location.href = `/admin/login?redirect=${encodeURIComponent(currentPath)}`;
        }
      }
    }
    let errorDetail = `API error: ${response.status}`;
    try {
      const body = await response.json();
      errorDetail = body.error?.message || body.detail?.message || body.detail || errorDetail;
    } catch {
      // use default
    }
    throw new Error(errorDetail);
  }
  return response.json();
}

async function requestWithRetry(
  endpoint: string,
  options: RequestInit = {},
  isRetry: boolean = false
): Promise<any> {
  const authHeaders = getAdminAuthHeaders();
  const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...authHeaders,
      ...options.headers,
    },
  });

  if (
    response.status === 401 &&
    !isRetry &&
    !endpoint.includes('/admin/auth/login') &&
    !endpoint.includes('/admin/auth/refresh')
  ) {
    const refreshedToken = await silentAdminRefresh();
    if (refreshedToken) {
      const retryHeaders = {
        ...options.headers,
        Authorization: `Bearer ${refreshedToken}`,
      };
      return requestWithRetry(endpoint, { ...options, headers: retryHeaders }, true);
    }
  }

  return handleAdminResponse(response);
}

export const apiClient = {
  get: async (endpoint: string, options: RequestInit = {}) => {
    return requestWithRetry(endpoint, { ...options, method: 'GET' });
  },

  post: async (endpoint: string, data: unknown, options: RequestInit = {}) => {
    return requestWithRetry(endpoint, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(data),
    });
  },

  put: async (endpoint: string, data: unknown, options: RequestInit = {}) => {
    return requestWithRetry(endpoint, {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(data),
    });
  },

  patch: async (endpoint: string, data: unknown, options: RequestInit = {}) => {
    return requestWithRetry(endpoint, {
      ...options,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(data),
    });
  },

  delete: async (endpoint: string, options: RequestInit = {}) => {
    return requestWithRetry(endpoint, { ...options, method: 'DELETE' });
  },

  upload: async (endpoint: string, formData: FormData, options: RequestInit = {}) => {
    return requestWithRetry(endpoint, {
      ...options,
      method: 'POST',
      body: formData,
    });
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
  listQuotes: (params?: { status?: string; request_type?: string; search?: string; page?: number; page_size?: number }, token?: string) => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.request_type) q.append('request_type', params.request_type);
    if (params?.search) q.append('search', params.search);
    if (params?.page) q.append('page', String(params.page));
    if (params?.page_size) q.append('page_size', String(params.page_size));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get(`/admin/quotes${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

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

  createQuote: (data: any, token?: string) =>
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

  updateDraft: (id: string, data: any, token?: string) =>
    apiClient.patch(`/admin/quotes/${id}/draft`, data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  listQuoteApprovals: (id: string, token?: string) =>
    apiClient.get(`/admin/quotes/${id}/approvals`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  listApprovals: (id: string, token?: string) =>
    apiClient.get(`/admin/quotes/${id}/approvals`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  cancelQuote: (id: string, token?: string) =>
    apiClient.post(`/admin/quotes/${id}/cancel`, {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  listQuoteVersions: (id: string, token?: string) =>
    apiClient.get(`/quotes/${id}/versions`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

export const adminFilesApi = {
  listFiles: (params?: { scan_status?: string; association_type?: string; search?: string; page?: number; page_size?: number }, token?: string) => {
    const q = new URLSearchParams();
    if (params?.scan_status) q.append('scan_status', params.scan_status);
    if (params?.association_type) q.append('association_type', params.association_type);
    if (params?.search) q.append('search', params.search);
    if (params?.page) q.append('page', String(params.page));
    if (params?.page_size) q.append('page_size', String(params.page_size));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get(`/admin/files${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  listRequestFiles: (requestType: string, requestId: string, token?: string) =>
    apiClient.get(`/admin/requests/${requestType}/${requestId}/files`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  uploadDeliverable: (formData: FormData, token?: string) =>
    apiClient.upload('/admin/files', formData, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  getDownloadUrl: (fileId: string, token?: string) =>
    apiClient.get(`/admin/files/${fileId}/download`, {
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

export const adminReviewsApi = {
  listQueue: (token?: string) =>
    apiClient.get('/admin/reviews', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  hideReview: (id: string, reason: string, token?: string) =>
    apiClient.post(`/admin/reviews/${id}/hide`, { reason }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  restoreReview: (id: string, token?: string) =>
    apiClient.post(`/admin/reviews/${id}/restore`, {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

export const adminCatalogApi = {
  listProducts: (params?: { category?: string; search?: string; status?: string; page?: number; page_size?: number }, token?: string) => {
    const q = new URLSearchParams();
    if (params?.category) q.append('category', params.category);
    if (params?.search) q.append('search', params.search);
    if (params?.status) q.append('status', params.status);
    if (params?.page) q.append('page', String(params.page));
    if (params?.page_size) q.append('page_size', String(params.page_size));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get(`/admin/products${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
  getProduct: (id: string, token?: string) =>
    apiClient.get(`/admin/products/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  createProduct: (data: unknown, token?: string) =>
    apiClient.post('/admin/products', data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  updateProduct: (id: string, data: unknown, token?: string) =>
    apiClient.patch(`/admin/products/${id}`, data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  uploadProductImage: (id: string, formData: FormData, token?: string) =>
    apiClient.upload(`/admin/products/${id}/images`, formData, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  uploadMedia: (formData: FormData, token?: string) =>
    apiClient.upload('/admin/catalog/upload-media', formData, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  listCategories: (token?: string) =>
    apiClient.get('/admin/categories', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  createCategory: (data: unknown, token?: string) =>
    apiClient.post('/admin/categories', data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  updateCategory: (id: string, data: unknown, token?: string) =>
    apiClient.patch(`/admin/categories/${id}`, data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

export const adminAuthApi = {
  login: (data: { email: string; password: string }) =>
    apiClient.post('/admin/auth/login', data),
  logout: () =>
    apiClient.post('/admin/auth/logout', {}).catch(() => {}),
  me: () =>
    apiClient.get('/admin/auth/me'),
  refresh: () =>
    apiClient.post('/admin/auth/refresh', {}),
};

export const adminInventoryApi = {
  listInventory: (params?: { page?: number; page_size?: number }, token?: string) => {
    const q = new URLSearchParams();
    if (params?.page) q.append('page', String(params.page));
    if (params?.page_size) q.append('page_size', String(params.page_size));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get(`/admin/inventory${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
  getInventory: (productId: string, token?: string) =>
    apiClient.get(`/admin/inventory/${productId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  adjustInventory: (productId: string, data: { delta: number; reason: string }, token?: string) =>
    apiClient.post(`/admin/inventory/${productId}/adjust`, data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  listReservations: (productId: string, token?: string) =>
    apiClient.get(`/admin/inventory/${productId}/reservations`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

export const adminPaymentsApi = {
  listPayments: (params?: { status?: string; source_type?: string; search?: string; page?: number; page_size?: number }, token?: string) => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.source_type) q.append('source_type', params.source_type);
    if (params?.search) q.append('search', params.search);
    if (params?.page) q.append('page', String(params.page));
    if (params?.page_size) q.append('page_size', String(params.page_size));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get(`/admin/payments${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
  refundPayment: (paymentId: string, data: { amount?: number; reason?: string }, token?: string) =>
    apiClient.post(`/admin/payments/${paymentId}/refund`, data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

export const adminOrdersApi = {
  listOrders: (params?: { status?: string; search?: string; page?: number; page_size?: number }, token?: string) => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.search) q.append('search', params.search);
    if (params?.page) q.append('page', String(params.page));
    if (params?.page_size) q.append('page_size', String(params.page_size));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get(`/admin/orders${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
  getOrder: (id: string, token?: string) =>
    apiClient.get(`/admin/orders/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  updateStatus: (id: string, status: string, notes?: string, token?: string) =>
    apiClient.patch(`/admin/orders/${id}/status`, { status, notes }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  addNote: (id: string, note: string, token?: string) =>
    apiClient.post(`/admin/orders/${id}/notes`, { note }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  flagCancellation: (id: string, reason: string, token?: string) =>
    apiClient.post(`/admin/orders/${id}/flag-cancellation`, { reason }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

export const adminShippingApi = {
  listShipments: (params?: { status?: string; carrier?: string; search?: string; page?: number; page_size?: number }, token?: string) => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.carrier) q.append('carrier', params.carrier);
    if (params?.search) q.append('search', params.search);
    if (params?.page) q.append('page', String(params.page));
    if (params?.page_size) q.append('page_size', String(params.page_size));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get(`/admin/shipments${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
  checkServiceability: (pincode: string) =>
    apiClient.get(`/shipping/serviceability?pincode=${encodeURIComponent(pincode)}`),
  calculateRates: (data: { destination_pincode: string; weight_grams: number }) =>
    apiClient.post('/shipping/rates', data),
  createOrderShipment: (orderId: string, data: { carrier?: string; tracking_number?: string; weight_grams?: number }, token?: string) =>
    apiClient.post(`/admin/orders/${orderId}/shipment`, data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  createManufacturingShipment: (requestId: string, data: { carrier?: string; tracking_number?: string; weight_grams?: number }, token?: string) =>
    apiClient.post(`/admin/manufacturing/${requestId}/shipment`, data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  getShipment: (shipmentId: string) =>
    apiClient.get(`/shipments/${shipmentId}`),
  getTracking: (shipmentId: string) =>
    apiClient.get(`/shipments/${shipmentId}/tracking`),
};

export const adminCustomersApi = {
  listCustomers: (params?: { search?: string; status?: string; segment?: string; page?: number; page_size?: number }, token?: string) => {
    const q = new URLSearchParams();
    if (params?.search) q.append('search', params.search);
    if (params?.status) q.append('status', params.status);
    if (params?.segment) q.append('segment', params.segment);
    if (params?.page) q.append('page', String(params.page));
    if (params?.page_size) q.append('page_size', String(params.page_size));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get(`/admin/customers${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
  getCustomer: (id: string, token?: string) =>
    apiClient.get(`/admin/customers/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  getCustomerOrders: (id: string, token?: string) =>
    apiClient.get(`/admin/customers/${id}/orders`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  getCustomerRequests: (id: string, token?: string) =>
    apiClient.get(`/admin/customers/${id}/requests`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  getCustomerProjects: (id: string, token?: string) =>
    apiClient.get(`/admin/customers/${id}/projects`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  deactivateCustomer: (id: string, reason?: string, token?: string) =>
    apiClient.post(`/admin/customers/${id}/deactivate`, { reason }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

export const adminAnalyticsApi = {
  getAnalytics: (token?: string) =>
    apiClient.get('/admin/analytics', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  exportAnalytics: async (token?: string): Promise<string> => {
    const authHeaders = getAdminAuthHeaders();
    const headers = { ...authHeaders, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    const res = await fetch(`${getApiBaseUrl()}/admin/analytics/export`, {
      method: 'GET',
      credentials: 'include',
      headers,
    });
    if (!res.ok) {
      throw new Error(`Export failed: ${res.status}`);
    }
    return res.text();
  },
};

export const adminAuditApi = {
  listAuditLogs: (params?: { page?: number; page_size?: number }, token?: string) => {
    const q = new URLSearchParams();
    if (params?.page) q.append('page', String(params.page));
    if (params?.page_size) q.append('page_size', String(params.page_size));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get(`/admin/audit-logs${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
};

export const adminNotificationsApi = {
  listNotifications: (params?: { page?: number; page_size?: number }, token?: string) => {
    const q = new URLSearchParams();
    if (params?.page) q.append('page', String(params.page));
    if (params?.page_size) q.append('page_size', String(params.page_size));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get(`/admin/notifications${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
};

export const adminDashboardApi = {
  getDashboard: (token?: string) =>
    apiClient.get('/admin/dashboard', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

export const adminSettingsApi = {
  getSettings: (token?: string) =>
    apiClient.get('/admin/settings', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  updateSettings: (data: Record<string, unknown>, token?: string) =>
    apiClient.put('/admin/settings', data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

export interface StaffMember {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: string;
  status: 'verified' | 'deactivated';
  is_active: boolean;
  is_superuser: boolean;
  created_at: string | null;
  updated_at: string | null;
  last_login_at: string | null;
  temporary_password?: string;
  password_generated?: boolean;
  audit_trail?: Array<{
    id: string;
    action: string;
    entity_type: string;
    details: any;
    created_at: string;
  }>;
}

export const adminTeamApi = {
  listStaff: (
    params?: { role?: string; status?: string; search?: string; page?: number; page_size?: number },
    token?: string
  ) => {
    const q = new URLSearchParams();
    if (params?.role) q.append('role', params.role);
    if (params?.status) q.append('status', params.status);
    if (params?.search) q.append('search', params.search);
    if (params?.page) q.append('page', String(params.page));
    if (params?.page_size) q.append('page_size', String(params.page_size));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiClient.get(`/admin/team${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
  getStaff: (id: string, token?: string) =>
    apiClient.get(`/admin/team/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  createStaff: (
    data: {
      email: string;
      full_name: string;
      phone?: string;
      role: string;
      password?: string;
    },
    token?: string
  ) =>
    apiClient.post('/admin/team', data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  updateRole: (id: string, role: string, token?: string) =>
    apiClient.patch(
      `/admin/team/${id}/role`,
      { role },
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    ),
  updateStatus: (id: string, status: 'verified' | 'deactivated', token?: string) =>
    apiClient.patch(
      `/admin/team/${id}/status`,
      { status },
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    ),
  resetPassword: (id: string, new_password?: string, token?: string) =>
    apiClient.post(
      `/admin/team/${id}/reset-password`,
      { new_password },
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    ),
};

export const adminSecurityApi = {
  changePassword: (
    data: {
      current_password: string;
      new_password: string;
      confirm_password: string;
    },
    token?: string
  ) =>
    apiClient.post('/admin/auth/change-password', data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

export interface AdminFeedbackFilterParams {
  status?: string;
  feedback_type?: string;
  priority?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export const adminFeedbackApi = {
  getStats: (token?: string) =>
    apiClient.get('/admin/feedback/stats', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  listFeedbacks: (params?: AdminFeedbackFilterParams, token?: string) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.feedback_type) qs.set('feedback_type', params.feedback_type);
    if (params?.priority) qs.set('priority', params.priority);
    if (params?.search) qs.set('search', params.search);
    if (params?.page) qs.set('page', params.page.toString());
    if (params?.page_size) qs.set('page_size', params.page_size.toString());
    return apiClient.get(`/admin/feedback${qs.toString() ? `?${qs.toString()}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
  getFeedback: (id: string, token?: string) =>
    apiClient.get(`/admin/feedback/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  updateFeedback: (
    id: string,
    data: {
      status?: string;
      priority?: string;
      admin_notes?: string;
      admin_response?: string;
    },
    token?: string
  ) =>
    apiClient.patch(`/admin/feedback/${id}`, data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};







