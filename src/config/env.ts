const configuredApiUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

export function getApiBaseUrl() {
  if (!configuredApiUrl) {
    throw new Error(
      'Pairing server is not configured. Set EXPO_PUBLIC_API_BASE_URL in a local .env file.',
    );
  }
  return configuredApiUrl.replace(/\/$/, '');
}
