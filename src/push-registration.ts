export type PushState = 'idle' | 'checking' | 'ready' | 'denied' | 'error' | 'unsupported';
type Options = {
  key: string;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  permission: () => NotificationPermission | 'unsupported';
  request: () => Promise<NotificationPermission>;
  register: (current: () => boolean) => Promise<void>;
  changed: () => void;
  now?: () => number;
};
export class PushRegistration {
  state: PushState = 'idle';
  private options: Options;
  private pending: Promise<void> | null = null;
  private active = true;
  private checkedAt: number | null = null;
  constructor(options: Options) { this.options = options; }
  get saved() { try { return this.options.storage.getItem(this.options.key) === 'enabled'; } catch { return false; } }
  activate() { this.active = true; }
  private change(state: PushState) { this.state = state; if (this.active) this.options.changed(); }
  ensure(manual = false): Promise<void> {
    if (!this.active) return Promise.resolve();
    if (this.pending) return this.pending;
    const permission = this.options.permission();
    if (permission === 'unsupported') { this.change('unsupported'); return Promise.resolve(); }
    if (permission === 'denied') { this.change('denied'); return Promise.resolve(); }
    if (permission !== 'granted' && !manual) { this.change('idle'); return Promise.resolve(); }
    const now = (this.options.now || Date.now)();
    if (!manual && this.checkedAt !== null && now - this.checkedAt < (this.state === 'ready' ? 300_000 : 30_000)) return Promise.resolve();
    this.checkedAt = now;
    this.change('checking');
    let current = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    this.pending = (async () => {
      try {
        // Only an explicit user click may request a new browser permission.
        if (permission !== 'granted' && await this.options.request() !== 'granted') { this.change('denied'); return; }
        if (!this.active) return;
        await Promise.race([
          this.options.register(() => this.active && current),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('PUSH_TIMEOUT')), 20000); }),
        ]);
        if (!this.active) return;
        try { this.options.storage.setItem(this.options.key, 'enabled'); } catch { /* Browser permission/server registration remain authoritative. */ }
        this.change('ready');
      } catch { if (this.active) this.change('error'); }
    })().finally(() => { current = false; clearTimeout(timeout); this.pending = null; });
    return this.pending;
  }
  async stop() { this.active = false; await this.pending; }
}
