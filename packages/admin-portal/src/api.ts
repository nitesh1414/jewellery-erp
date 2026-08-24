import type { SubscriptionSummary, ActivationSummary } from '../../license-core/src/types';

export type { SubscriptionSummary, ActivationSummary };

/**
 * Thin API client for the license server. Uses relative /api in dev (proxied
 * by Vite) and in production (portal served by the license server itself).
 * Set VITE_LICENSE_API (e.g. https://licenses.example.com/api) to point the
 * portal at a remote server.
 */
const BASE = (import.meta as any).env?.VITE_LICENSE_API || '/api';

let token: string | null = localStorage.getItem('adminToken');

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem('adminToken', t);
  else localStorage.removeItem('adminToken');
}

export function getToken() {
  return token;
}

async function request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null);
      window.location.hash = '#/login';
    }
    const err = new Error(data?.message || `Request failed (${res.status})`) as any;
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) => request<{ ok: boolean; token: string; admin: { id: string; email: string; name: string } }>('POST', '/auth/login', { email, password }),

  stats: () => request('GET', '/stats'),

  listSubscriptions: (params: { search?: string; status?: string; page?: number; pageSize?: number }) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.status) q.set('status', params.status);
    q.set('page', String(params.page || 1));
    q.set('pageSize', String(params.pageSize || 25));
    return request('GET', `/subscriptions?${q.toString()}`);
  },

  getSubscription: (id: string) => request('GET', `/subscriptions/${id}`),

  createSubscription: (body: unknown) => request('POST', '/subscriptions', body),

  updateSubscription: (id: string, body: unknown) => request('PATCH', `/subscriptions/${id}`, body),

  revoke: (id: string) => request('POST', `/subscriptions/${id}/revoke`),

  restore: (id: string) => request('POST', `/subscriptions/${id}/restore`),

  extend: (id: string, durationType: string, durationCount: number) =>
    request('POST', `/subscriptions/${id}/extend`, { durationType, durationCount }),

  remove: (id: string) => request('DELETE', `/subscriptions/${id}?confirm=yes`),

  offlineLicense: (id: string, machineId: string) =>
    request('POST', `/subscriptions/${id}/offline-license`, { machineId }),
};
