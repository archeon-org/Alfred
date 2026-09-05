const DEFAULT_DEV_API_PROXY_TARGET = 'http://127.0.0.1:3000';

export function resolveDevApiProxyTarget(
  processEnvironmentValue: string | undefined,
  fileEnvironmentValue: string | undefined,
) {
  const candidate =
    processEnvironmentValue?.trim() || fileEnvironmentValue?.trim() || DEFAULT_DEV_API_PROXY_TARGET;
  const url = new URL(candidate);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('ALFRED_DEV_API_PROXY_TARGET must use HTTP or HTTPS.');
  }

  return candidate.replace(/\/+$/u, '');
}
