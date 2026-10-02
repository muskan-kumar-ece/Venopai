export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1';
}

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: unknown;

  constructor(message: string, status: number, code?: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export function isValidToken(token: unknown): token is string {
  if (typeof token !== 'string') return false;
  const trimmed = token.trim();
  return trimmed !== '' && trimmed !== 'undefined' && trimmed !== 'null' && trimmed !== '[object Object]';
}

export function getCustomerToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const candidates = [
      sessionStorage.getItem('venopai_customer_token'),
      sessionStorage.getItem('access_token'),
      localStorage.getItem('access_token'),
      localStorage.getItem('venopai_customer_token'),
    ];
    for (const cand of candidates) {
      if (isValidToken(cand)) {
        return cand;
      }
    }
  } catch {
    // ignore storage exceptions
  }
  return null;
}

export function clearCustomerTokens(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem('venopai_customer_token');
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('venopai_customer_user');
    localStorage.removeItem('access_token');
    localStorage.removeItem('venopai_customer_token');
    localStorage.removeItem('venopai_customer_user');
    window.dispatchEvent(new Event('venopai_auth_unauthorized'));
  } catch {
    // ignore storage exceptions
  }
}

export function getCustomerAuthHeaders(explicitToken?: string): Record<string, string> {
  const token = isValidToken(explicitToken) ? explicitToken : getCustomerToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

function buildHeaders(optionsHeaders?: HeadersInit, explicitToken?: string): Record<string, string> {
  const baseHeaders = getCustomerAuthHeaders(explicitToken);
  const result: Record<string, string> = { ...baseHeaders };

  if (optionsHeaders) {
    if (typeof optionsHeaders === 'object' && !Array.isArray(optionsHeaders) && !(optionsHeaders instanceof Headers)) {
      for (const [k, v] of Object.entries(optionsHeaders as Record<string, string>)) {
        if (k.toLowerCase() === 'authorization') {
          const authVal = String(v);
          const rawToken = authVal.replace(/^Bearer\s+/i, '').trim();
          if (isValidToken(rawToken)) {
            result[k] = authVal;
          }
          // If authorization header was invalid (e.g. Bearer undefined), do NOT override baseHeaders
        } else if (v !== undefined && v !== null) {
          result[k] = String(v);
        }
      }
    }
  }

  return result;
}

async function handleResponse(response: Response): Promise<any> {
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const code = errData?.error?.code || errData?.code || (response.status === 401 ? 'UNAUTHORIZED' : undefined);
    const rawMessage = errData?.error?.message || errData?.detail?.message || errData?.detail || `API error: ${response.status}`;

    if (response.status === 401) {
      clearCustomerTokens();
      throw new ApiError(
        '401 Unauthorized: Session expired or sign-in required. Please sign in to continue.',
        401,
        'UNAUTHORIZED',
        errData
      );
    }

    throw new ApiError(rawMessage, response.status, code, errData);
  }
  return response.json();
}

let isCustomerRefreshing = false;
let customerRefreshSubscribers: Array<(newToken: string | null) => void> = [];

function onCustomerTokenRefreshed(newToken: string | null) {
  customerRefreshSubscribers.forEach((cb) => cb(newToken));
  customerRefreshSubscribers = [];
}

function addCustomerRefreshSubscriber(cb: (newToken: string | null) => void) {
  customerRefreshSubscribers.push(cb);
}

export async function silentCustomerRefresh(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  if (isCustomerRefreshing) {
    return new Promise((resolve) => {
      addCustomerRefreshSubscriber((token) => resolve(token));
    });
  }

  isCustomerRefreshing = true;
  try {
    const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      clearCustomerTokens();
      onCustomerTokenRefreshed(null);
      return null;
    }

    const json = await res.json();
    const newAccessToken = json?.data?.access_token;
    const user = json?.data?.user;

    if (newAccessToken && isValidToken(newAccessToken)) {
      sessionStorage.setItem('venopai_customer_token', newAccessToken);
      sessionStorage.setItem('access_token', newAccessToken);
      localStorage.setItem('access_token', newAccessToken);
      localStorage.setItem('venopai_customer_token', newAccessToken);
      if (user) {
        sessionStorage.setItem('venopai_customer_user', JSON.stringify(user));
        localStorage.setItem('venopai_customer_user', JSON.stringify(user));
      }
      onCustomerTokenRefreshed(newAccessToken);
      window.dispatchEvent(new Event('venopai_auth_refreshed'));
      return newAccessToken;
    } else {
      clearCustomerTokens();
      onCustomerTokenRefreshed(null);
      return null;
    }
  } catch {
    clearCustomerTokens();
    onCustomerTokenRefreshed(null);
    return null;
  } finally {
    isCustomerRefreshing = false;
  }
}

async function requestWithRetry(
  endpoint: string,
  options: RequestInit = {},
  isRetry: boolean = false
): Promise<any> {
  const headers = buildHeaders(options.headers);
  const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    credentials: 'include',
    ...options,
    headers,
  });

  if (response.status === 401 && !isRetry && !endpoint.startsWith('/auth/')) {
    const refreshedToken = await silentCustomerRefresh();
    if (refreshedToken) {
      const retryHeaders = {
        ...headers,
        Authorization: `Bearer ${refreshedToken}`,
      };
      return requestWithRetry(endpoint, { ...options, headers: retryHeaders }, true);
    }
  }

  return handleResponse(response);
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const clientMemoryCache = new Map<string, CacheEntry<unknown>>();
const pendingRequests = new Map<string, Promise<unknown>>();

// Default cache TTL for GET endpoints in milliseconds (30 seconds fresh)
const CACHE_FRESH_MS = 30_000;

export function invalidateClientCache(prefix?: string) {
  if (!prefix) {
    clientMemoryCache.clear();
    return;
  }
  for (const key of clientMemoryCache.keys()) {
    if (key.includes(prefix)) {
      clientMemoryCache.delete(key);
    }
  }
}

export const apiClient = {
  get: async (endpoint: string, options: RequestInit & { skipCache?: boolean } = {}) => {
    const isCacheable =
      !options.skipCache &&
      !options.signal &&
      !endpoint.startsWith('/auth/me') &&
      !endpoint.startsWith('/cart');

    if (!isCacheable) {
      return requestWithRetry(endpoint, { ...options, method: 'GET' });
    }

    const cacheKey = `GET:${endpoint}`;
    const now = Date.now();
    const cached = clientMemoryCache.get(cacheKey);

    if (cached && now - cached.timestamp < CACHE_FRESH_MS) {
      return cached.data;
    }

    if (pendingRequests.has(cacheKey)) {
      return pendingRequests.get(cacheKey);
    }

    const fetchPromise = (async () => {
      try {
        const res = await requestWithRetry(endpoint, { ...options, method: 'GET' });
        clientMemoryCache.set(cacheKey, { data: res, timestamp: Date.now() });
        return res;
      } finally {
        pendingRequests.delete(cacheKey);
      }
    })();

    pendingRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
  },
  post: async (endpoint: string, data: unknown, options: RequestInit = {}) => {
    const res = await requestWithRetry(endpoint, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(data),
    });
    invalidateClientCache();
    return res;
  },
  put: async (endpoint: string, data: unknown, options: RequestInit = {}) => {
    const res = await requestWithRetry(endpoint, {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(data),
    });
    invalidateClientCache();
    return res;
  },
  patch: async (endpoint: string, data: unknown, options: RequestInit = {}) => {
    const res = await requestWithRetry(endpoint, {
      ...options,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(data),
    });
    invalidateClientCache();
    return res;
  },
  delete: async (endpoint: string, options: RequestInit = {}) => {
    const res = await requestWithRetry(endpoint, { ...options, method: 'DELETE' });
    invalidateClientCache();
    return res;
  },
  upload: async (endpoint: string, formData: FormData, options: RequestInit = {}) => {
    const res = await requestWithRetry(endpoint, {
      ...options,
      method: 'POST',
      body: formData,
    });
    invalidateClientCache();
    return res;
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
  listFiles: (params?: { association_type?: string; search?: string; page?: number; page_size?: number }, token?: string) => {
    const qs = new URLSearchParams();
    if (params?.association_type) qs.set('association_type', params.association_type);
    if (params?.search) qs.set('search', params.search);
    if (params?.page) qs.set('page', params.page.toString());
    if (params?.page_size) qs.set('page_size', params.page_size.toString());
    return apiClient.get(`/files${qs.toString() ? `?${qs.toString()}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
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

// Phase 9 Domain APIs
export const consultationsApi = {
  createRequest: (data: { topic: string; description: string; file_ids?: string[]; project_id?: string }, token?: string) =>
    apiClient.post('/consultations', data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  listRequests: (params?: { page?: number; page_size?: number }, token?: string) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', params.page.toString());
    if (params?.page_size) qs.set('page_size', params.page_size.toString());
    return apiClient.get(`/consultations${qs.toString() ? `?${qs.toString()}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
  getRequest: (id: string, token?: string) =>
    apiClient.get(`/consultations/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  resolveRequest: (id: string, token?: string) =>
    apiClient.post(`/consultations/${id}/resolve`, {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  listClarifications: (id: string, token?: string) =>
    apiClient.get(`/consultations/${id}/clarifications`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  respondClarification: (id: string, clarificationId: string, text: string, attachedFileIds?: string[], token?: string) =>
    apiClient.post(`/consultations/${id}/clarifications/${clarificationId}/respond`, { text, attached_file_ids: attachedFileIds }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

export const designApi = {
  createRequest: (data: unknown, token?: string) =>
    apiClient.post('/design/requests', data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  listRequests: (params?: { page?: number; page_size?: number }, token?: string) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', params.page.toString());
    if (params?.page_size) qs.set('page_size', params.page_size.toString());
    return apiClient.get(`/design/requests${qs.toString() ? `?${qs.toString()}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
  getRequest: (id: string, token?: string) =>
    apiClient.get(`/design/requests/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  cancelRequest: (id: string, reason?: string, token?: string) =>
    apiClient.post(`/design/requests/${id}/cancel`, { reason }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  startManufacturing: (id: string, token?: string) =>
    apiClient.post(`/design/requests/${id}/start-manufacturing`, {}, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  listClarifications: (id: string, token?: string) =>
    apiClient.get(`/design/requests/${id}/clarifications`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  respondClarification: (id: string, clarificationId: string, text: string, attachedFileIds?: string[], token?: string) =>
    apiClient.post(`/design/requests/${id}/clarifications/${clarificationId}/respond`, { text, attached_file_ids: attachedFileIds }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};

export const softwareApi = {
  createRequest: (data: unknown, token?: string) =>
    apiClient.post('/software/requests', data, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  listRequests: (params?: { page?: number; page_size?: number }, token?: string) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', params.page.toString());
    if (params?.page_size) qs.set('page_size', params.page_size.toString());
    return apiClient.get(`/software/requests${qs.toString() ? `?${qs.toString()}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
  getRequest: (id: string, token?: string) =>
    apiClient.get(`/software/requests/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  cancelRequest: (id: string, reason?: string, token?: string) =>
    apiClient.post(`/software/requests/${id}/cancel`, { reason }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  listClarifications: (id: string, token?: string) =>
    apiClient.get(`/software/requests/${id}/clarifications`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  respondClarification: (id: string, clarificationId: string, text: string, attachedFileIds?: string[], token?: string) =>
    apiClient.post(`/software/requests/${id}/clarifications/${clarificationId}/respond`, { text, attached_file_ids: attachedFileIds }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};


export const profileApi = {
  getProfile: (token?: string) =>
    apiClient.get('/users/me', { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
  updateProfile: (data: { name?: string; phone?: string }, token?: string) =>
    apiClient.patch('/users/me', data, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
  changePassword: (data: { current_password?: string; new_password?: string }, token?: string) =>
    apiClient.post('/users/me/password-change', data, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
  changeEmail: (data: { new_email: string }, token?: string) =>
    apiClient.post('/users/me/email-change', data, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
};

export const notificationsApi = {
  listNotifications: (params?: { page?: number; page_size?: number }, token?: string) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', params.page.toString());
    if (params?.page_size) qs.set('page_size', params.page_size.toString());
    return apiClient.get(`/notifications${qs.toString() ? `?${qs.toString()}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
};

export const reviewsApi = {
  listMyReviews: (token?: string) =>
    apiClient.get('/reviews/mine', { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
  createReview: (data: { target_type?: string; target_id?: string; product_id?: string; rating: number; text?: string; comment?: string }, token?: string) =>
    apiClient.post('/reviews', data, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
  updateReview: (id: string, data: { rating?: number; text?: string; comment?: string }, token?: string) =>
    apiClient.patch(`/reviews/${id}`, data, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
  deleteReview: (id: string, token?: string) =>
    apiClient.delete(`/reviews/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
  getProductReviews: (productId: string) =>
    apiClient.get(`/products/${productId}/reviews`),
};

export const paymentsApi = {
  listPayments: (params?: { page?: number; page_size?: number }, token?: string) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', params.page.toString());
    if (params?.page_size) qs.set('page_size', params.page_size.toString());
    return apiClient.get(`/payments${qs.toString() ? `?${qs.toString()}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
  getPayment: (id: string, token?: string) =>
    apiClient.get(`/payments/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
};

export const ordersApi = {
  listOrders: (params?: { status?: string; page?: number; page_size?: number }, token?: string) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.page) qs.set('page', params.page.toString());
    if (params?.page_size) qs.set('page_size', params.page_size.toString());
    return apiClient.get(`/orders${qs.toString() ? `?${qs.toString()}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
  getOrderDetail: (id: string, token?: string) =>
    apiClient.get(`/orders/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
  cancelOrder: (id: string, reason?: string, token?: string) =>
    apiClient.post(`/orders/${id}/cancel`, { reason }, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
  getInvoice: (id: string, token?: string) =>
    apiClient.get(`/orders/${id}/invoice`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
};

export const addressesApi = {
  listAddresses: (token?: string) =>
    apiClient.get('/addresses', { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
  createAddress: (data: unknown, token?: string) =>
    apiClient.post('/addresses', data, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
  updateAddress: (id: string, data: unknown, token?: string) =>
    apiClient.patch(`/addresses/${id}`, data, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
  deleteAddress: (id: string, token?: string) =>
    apiClient.delete(`/addresses/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
};

export const authApi = {
  register: (data: { email: string; password: string; full_name: string; phone?: string }) =>
    apiClient.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    apiClient.post('/auth/login', data),
  logout: () =>
    apiClient.post('/auth/logout', {}),
  verifyEmail: (token: string) =>
    apiClient.post('/auth/verify-email', { token }),
  resendVerification: (email: string) =>
    apiClient.post('/auth/resend-verification', { email }),
  forgotPassword: (email: string) =>
    apiClient.post('/auth/forgot-password', { email }),
  resetPassword: (data: { token: string; new_password: string }) =>
    apiClient.post('/auth/reset-password', data),
  getMe: (token?: string) =>
    apiClient.get('/users/me', { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
  changePassword: (data: { current_password: string; new_password: string }, token?: string) =>
    apiClient.post('/users/me/password-change', data, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
};

export interface PaginationMeta {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next?: boolean;
  has_prev?: boolean;
}

export interface CatalogListParams {
  category_id?: string;
  category_slug?: string;
  category?: string;
  status?: string;
  search?: string;
  sort?: string;
  availability?: string;
  min_price?: string;
  max_price?: string;
  page?: number;
  page_size?: number;
}

export const catalogApi = {
  listProducts: (params?: CatalogListParams) => {
    const qs = new URLSearchParams();
    if (params?.category_id) {
      qs.set('category_id', params.category_id);
      qs.set('category', params.category_id);
    }
    if (params?.category) qs.set('category', params.category);
    if (params?.category_slug) qs.set('category_slug', params.category_slug);
    if (params?.status) qs.set('status', params.status);
    if (params?.search) qs.set('search', params.search);
    if (params?.sort) qs.set('sort', params.sort);
    if (params?.availability) qs.set('availability', params.availability);
    if (params?.min_price) qs.set('min_price', params.min_price);
    if (params?.max_price) qs.set('max_price', params.max_price);
    if (params?.page) qs.set('page', params.page.toString());
    if (params?.page_size) qs.set('page_size', params.page_size.toString());
    return apiClient.get(`/products${qs.toString() ? `?${qs.toString()}` : ''}`);
  },
  getProduct: (idOrSlug: string) =>
    apiClient.get(`/products/${idOrSlug}`),
  listCategories: () =>
    apiClient.get('/categories'),
};

export const cartApi = {
  getCart: () =>
    apiClient.get('/cart'),
  addItem: (data: { product_id: string; quantity: number }) =>
    apiClient.post('/cart/items', data),
  updateItem: (productId: string, quantity: number) =>
    apiClient.patch(`/cart/items/${productId}`, { quantity }),
  removeItem: (productId: string) =>
    apiClient.delete(`/cart/items/${productId}`),
  clearCart: () =>
    apiClient.delete('/cart'),
};

export const checkoutApi = {
  createSession: (data: { address_id: string }) =>
    apiClient.post('/checkout/sessions', data),
  updateAddress: (sessionId: string, data: { address_id: string }) =>
    apiClient.post(`/checkout/sessions/${sessionId}/address`, data),
  initiatePayment: (data: { checkout_session_id?: string; request_id?: string }) =>
    apiClient.post('/payments/initiate', data),
  confirmPayment: (paymentId: string, data: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) =>
    apiClient.post(`/payments/${paymentId}/confirm`, data),
};

export const shippingApi = {
  checkServiceability: (pincode: string) =>
    apiClient.get(`/shipping/serviceability?pincode=${encodeURIComponent(pincode)}`),
  calculateRates: (data: { origin_pincode?: string; destination_pincode: string; weight_grams: number }) =>
    apiClient.post('/shipping/rates', data),
};

export interface FeedbackSubmissionPayload {
  feedback_type: string;
  subject: string;
  description: string;
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  page_url?: string;
  browser_info?: string;
  order_id?: string;
  service_request_type?: string;
  service_request_id?: string;
  screenshot_url?: string;
  priority?: string;
}

export const feedbackApi = {
  submitFeedback: (data: FeedbackSubmissionPayload) =>
    apiClient.post('/feedback', data),
  listMyFeedbacks: (params?: { status?: string; feedback_type?: string; page?: number; page_size?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.feedback_type) qs.set('feedback_type', params.feedback_type);
    if (params?.page) qs.set('page', params.page.toString());
    if (params?.page_size) qs.set('page_size', params.page_size.toString());
    return apiClient.get(`/feedback${qs.toString() ? `?${qs.toString()}` : ''}`);
  },
  getMyFeedbackDetail: (id: string) =>
    apiClient.get(`/feedback/${id}`),
};

