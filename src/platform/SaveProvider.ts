export interface SaveProvider {
  load(): string | null;
  save(data: string): void;
  clear(): void;
}

export class LocalStorageSaveProvider implements SaveProvider {
  constructor(private readonly key: string) {}

  load(): string | null {
    try {
      return window.localStorage.getItem(this.key);
    } catch {
      return null;
    }
  }

  save(data: string): void {
    try {
      window.localStorage.setItem(this.key, data);
    } catch {
      // private mode / quota: play on without persistence
    }
  }

  clear(): void {
    try {
      window.localStorage.removeItem(this.key);
    } catch {
      // ignore
    }
  }
}
