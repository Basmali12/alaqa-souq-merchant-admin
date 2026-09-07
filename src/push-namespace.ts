type PushyConfig = {localStorageKeys: {token: string; tokenAuth: string; tokenAppId: string}};

// Configure the pinned SDK's own keys once per page realm, before any registration.
// Do not copy the legacy global credentials: they may belong to the other PWA.
// Existing browser subscriptions, sessions and activation preferences are untouched.
export function isolatePushyStorage(config: PushyConfig, role: string, scope: string): string {
  const prefix = `alaqa_push_v2:${role}:${scope}:`;
  config.localStorageKeys.token = prefix + 'token';
  config.localStorageKeys.tokenAuth = prefix + 'auth';
  config.localStorageKeys.tokenAppId = prefix + 'appId';
  return prefix;
}
