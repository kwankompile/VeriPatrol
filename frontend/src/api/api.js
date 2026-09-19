import { runAuthRefresh, SessionExpiredError } from 'api/authRefreshQueue';
import { clearAuthSession, getAuthToken, markSessionExpired } from 'utils/auth';

// Base API URL from .env or fallback localhost
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

const redirectToLogin = () => {
  if (window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
};

const normalizePath = (url) => url.split('?')[0];

// Build headers with authorization token if present
const buildHeaders = (customHeaders = {}, data) => {
  const token = getAuthToken();
  const headers = {
    Accept: 'application/json',
    ...customHeaders
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const isFormData = typeof FormData !== 'undefined' && data instanceof FormData;

  if (!isFormData && data !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
};

const parseResponseBody = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json') ? await response.json() : await response.text();
};

const throwStructuredError = (response, responseData, message = 'API request failed') => {
  const error = new Error(message);
  error.status = response.status;
  error.data = responseData;
  throw error;
};

const handleSessionExpired = () => {
  clearAuthSession();
  markSessionExpired();
  redirectToLogin();
};

const executeFetch = async (method, url, data, options = {}) => {
  return fetch(`${API_BASE_URL}${url}`, {
    method,
    credentials: 'include',
    headers: buildHeaders(options.headers, data),
    body: data === undefined ? undefined : data instanceof FormData ? data : JSON.stringify(data)
  });
};

// Main request handler
const request = async (method, url, data, options = {}, isRetry = false) => {
  const response = await executeFetch(method, url, data, options);
  const responseData = await parseResponseBody(response);
  const path = normalizePath(url);

  if (response.status === 401) {
    if (path === '/auth/login' || path === '/login') {
      throwStructuredError(response, responseData, 'Unauthorized');
    }

    if (path === '/auth/logout' || path === '/auth/refresh' || path === '/auth/password-setup/complete') {
      throwStructuredError(response, responseData, 'Unauthorized');
    }

    if (
      path === '/auth/2fa/setup/start' ||
      path === '/auth/2fa/setup/verify' ||
      path === '/auth/otp/verify'
    ) {
      throwStructuredError(response, responseData, 'Unauthorized');
    }

    if (options.skipAuthRefresh) {
      throwStructuredError(response, responseData, 'Unauthorized');
    }

    if (isRetry) {
      handleSessionExpired();
      throw new SessionExpiredError('Session expired');
    }

    try {
      await runAuthRefresh();
      return request(method, url, data, options, true);
    } catch (error) {
      redirectToLogin();
      throw error instanceof SessionExpiredError ? error : new SessionExpiredError(error?.message || 'Session expired');
    }
  }

  if (!response.ok) {
    throwStructuredError(response, responseData);
  }

  return {
    data: responseData,
    status: response.status,
    headers: response.headers
  };
};

/**
 * Central API client.
 * Options: `{ headers?, skipAuthRefresh?: boolean }` — set `skipAuthRefresh: true` to bypass refresh-on-401.
 */
const api = {
  get: (url, options) => request('GET', url, undefined, options),
  post: (url, data, options) => request('POST', url, data, options),
  put: (url, data, options) => request('PUT', url, data, options),
  patch: (url, data, options) => request('PATCH', url, data, options),
  delete: (url, options) => request('DELETE', url, undefined, options)
};

export default api;
