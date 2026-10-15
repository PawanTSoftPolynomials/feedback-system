const TOKEN_KEY = 'feedback_admin_token';

export const adminSession = {
  get() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(token) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* storage unavailable */ }
  },
  clear() {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
  },
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, admin = false, raw = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (admin) {
    const token = adminSession.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Could not reach the server. Please check your connection and try again.', 0);
  }
  if (res.ok && raw) return res;
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && admin) {
      adminSession.clear();
      window.dispatchEvent(new Event('admin-logout'));
    }
    throw new ApiError((data && data.error) || `Request failed (${res.status}).`, res.status);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
};

export const adminApi = {
  get: (path) => request(path, { admin: true }),
  post: (path, body) => request(path, { method: 'POST', body, admin: true }),
  put: (path, body) => request(path, { method: 'PUT', body, admin: true }),
  del: (path) => request(path, { method: 'DELETE', admin: true }),
  download: (path) => request(path, { admin: true, raw: true }),
};

export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
