/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COURIER_APP_URL?: string;
}

interface PushyWebSdk {
  register(options: { appId: string; serviceWorkerFile?: string; serviceWorkerScope?: string }): Promise<string>;
}

interface Window {
  Pushy?: PushyWebSdk;
}
