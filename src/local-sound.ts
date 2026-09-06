export type SoundConfig = { type: string; version: number; enabled: boolean; url: string | null; mimeType: string };
export class LocalSound {
  readonly cacheName: string;
  config: SoundConfig | null = null;
  context: AudioContext | null = null;
  buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private pending = Promise.resolve();
  private disposed = false;
  constructor(readonly type: string, readonly actor: string, readonly changed: () => void = () => {}) {
    this.cacheName = `alaqa-sound-${type}`;
  }
  get key() { return new URL(`__sound__/${this.type}`, location.origin).href; }
  get ready() { return !!this.buffer && this.context?.state === "running"; }
  activate() { this.disposed = false; }
  log(status: string) { console.info("notification-sound", { type: this.type, version: this.config?.version, status }); }
  async unlock() {
    this.context ??= new AudioContext();
    await this.context.resume();
    if (this.context.state !== "running") throw new Error("AUDIO_BLOCKED");
    localStorage.setItem(`sound-enabled-${this.type}-${this.actor}`, "1");
    await this.loadLocal();
    this.changed();
  }
  sync(config: SoundConfig | null) {
    // Immediately honor disable, including a currently playing sound.
    this.config = config;
    if (!config?.enabled) { this.source?.stop(); this.source = null; this.buffer = null; this.changed(); }
    this.pending = this.pending.then(async () => {
      if (this.disposed || this.config !== config) return;
      const cache = await caches.open(this.cacheName);
      if (!config) { await cache.delete(this.key); return; }
      const old = await cache.match(this.key);
      const same = old?.headers.get("x-sound-version") === String(config.version);
      if (!same) this.buffer = null;
      if (!config.enabled) {
        if (old) await cache.put(this.key, new Response(await old.arrayBuffer(), { headers: { ...Object.fromEntries(old.headers), "x-sound-enabled": "false" } }));
        return;
      }
      if (!same) {
        if (!config.url || !config.url.startsWith("https://")) throw new Error("AUDIO_URL");
        const response = await fetch(config.url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error("AUDIO_DOWNLOAD");
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 2 * 1024 * 1024 || !bytes.byteLength) throw new Error("AUDIO_SIZE");
        const decoder = new AudioContext();
        try { await decoder.decodeAudioData(bytes.slice(0)); } finally { await decoder.close(); }
        if (this.disposed || this.config !== config) return;
        // A single stable cache entry atomically replaces the previous version.
        await cache.put(this.key, new Response(bytes, { headers: { "content-type": config.mimeType, "x-sound-version": String(config.version), "x-sound-enabled": "true" } }));
        this.log("cached");
      } else if (old?.headers.get("x-sound-enabled") !== "true") {
        await cache.put(this.key, new Response(await old!.arrayBuffer(), { headers: { ...Object.fromEntries(old!.headers), "x-sound-enabled": "true" } }));
      }
      await this.loadLocal();
    }).catch(() => { this.log("cache-failure"); }).finally(() => this.changed());
    return this.pending;
  }
  async loadLocal() {
    if (!this.context || this.disposed || this.config?.enabled === false) return;
    const cached = await (await caches.open(this.cacheName)).match(this.key);
    if (!cached || cached.headers.get("x-sound-enabled") !== "true") return;
    if (this.config && cached.headers.get("x-sound-version") !== String(this.config.version)) return;
    try { this.buffer = await this.context.decodeAudioData(await cached.arrayBuffer()); }
    catch { this.buffer = null; await (await caches.open(this.cacheName)).delete(this.key); this.log("decode-failure"); }
  }
  async play(eventId: string) {
    if (this.disposed || !this.ready || this.config?.enabled === false || document.visibilityState !== "visible") return false;
    const run = async () => {
      const key = `sound-events-${this.type}-${this.actor}`;
      let seen: string[] = [];
      try { seen = JSON.parse(localStorage.getItem(key) || "[]"); } catch {}
      if (!Array.isArray(seen)) seen = [];
      if (seen.includes(eventId)) return false;
      const source = this.context!.createBufferSource();
      source.buffer = this.buffer; source.connect(this.context!.destination);
      // Reserve before playing to prevent duplicate realtime/push/tab delivery.
      localStorage.setItem(key, JSON.stringify([...seen.slice(-499), eventId]));
      this.source = source;
      source.start(); source.onended = () => { source.disconnect(); if (this.source === source) this.source = null; };
      this.log("played"); return true;
    };
    try { return navigator.locks ? await navigator.locks.request(`sound-${this.type}-${this.actor}`, run) : await run(); }
    catch { this.log("play-failure"); return false; }
  }
  dispose() { this.disposed = true; this.source?.stop(); void this.context?.close(); this.context = null; this.buffer = null; }
}
