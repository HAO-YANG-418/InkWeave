// ============================================================
// LocalStorage 持久化存储 — 浏览器端冷却状态持久化
// ============================================================

import type { CoolingStorage } from './cooling-system';

const STORAGE_KEY = 'gwe_cooling_state';

export class LocalStorageCoolingStorage implements CoolingStorage {
  private key: string;

  constructor(key?: string) {
    this.key = key || STORAGE_KEY;
  }

  async load(): Promise<Record<string, unknown> | null> {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async save(data: Record<string, unknown>): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch {
      // storage full or unavailable
    }
  }

  clear(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.key);
  }
}