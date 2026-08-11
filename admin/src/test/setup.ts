import "@testing-library/jest-dom/vitest";

class MockEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  /** Test hook: the most recently constructed mock instance. */
  static lastInstance: MockEventSource | null = null;
  /** Test hook: total number of instances constructed (for reconnect assertions). */
  static instanceCount = 0;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;

  readyState: number = MockEventSource.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  url: string;
  withCredentials: boolean = false;
  /** Test hook: the options bag the constructor was invoked with. */
  initOptions: EventSourceInit | undefined;
  private listeners: Map<string, Set<EventListenerOrEventListenerObject>> =
    new Map();

  constructor(url: string, options?: EventSourceInit) {
    this.url = url;
    this.initOptions = options;
    if (options?.withCredentials) this.withCredentials = true;
    MockEventSource.lastInstance = this;
    MockEventSource.instanceCount++;
    setTimeout(() => {
      this.readyState = MockEventSource.OPEN;
      if (this.onopen) this.onopen();
      this.dispatchEvent(new Event("connected"));
    }, 0);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      handlers.forEach((h) => {
        if (typeof h === "function") {
          h(event);
        } else {
          h.handleEvent(event);
        }
      });
    }
    return true;
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }
}

Object.defineProperty(globalThis, "EventSource", {
  value: MockEventSource,
  writable: true,
  configurable: true,
});
