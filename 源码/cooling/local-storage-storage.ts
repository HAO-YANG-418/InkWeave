// ============================================================
// LocalStorage 持久化存储 — 浏览器端冷却状态持久化
// ============================================================

import type { CoolingStorage } from './cooling-system';
import { logWarn } from '../logger';

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
      logWarn('CoolingStorage', `冷却数据加载失败（key: ${this.key}），已重置`);
      return null;
    }
  }

  async save(data: Record<string, unknown>): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch {
      logWarn('CoolingStorage', `冷却数据保存失败（key: ${this.key}），可能存储已满`);
    }
  }

  clear(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.key);
  }
}