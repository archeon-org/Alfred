const DEFAULT_API_BASE_URL = '/api';

export function normalizeApiBaseUrl(value: string | undefined) {
  const candidate = value?.trim() || DEFAULT_API_BASE_URL;
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    throw new Error('VITE_API_URL must be a same-origin relative path.');
  }
  return candidate === '/' ? '' : candidate.replace(/\/+$/u, '');
}
