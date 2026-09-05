const DEFAULT_API_BASE_URL = '/api';

function normalizeApiBaseUrl(value: string | undefined) {
  const candidate = value?.trim() || DEFAULT_API_BASE_URL;
  return candidate === '/' ? '' : candidate.replace(/\/+$/u, '');
}

const apiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_URL);

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiBaseUrl}${normalizedPath}`;
}
