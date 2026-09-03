/// <reference types="vite/client" />

interface PushyWebSdk {
  register(options: { appId: string; serviceWorkerFile?: string; serviceWorkerScope?: string }): Promise<string>;
}

interface Window {
  Pushy?: PushyWebSdk;
}
