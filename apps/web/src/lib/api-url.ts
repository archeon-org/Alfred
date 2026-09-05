import { normalizeApiBaseUrl } from './api-base-url';

const apiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_URL);

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiBaseUrl}${normalizedPath}`;
}
