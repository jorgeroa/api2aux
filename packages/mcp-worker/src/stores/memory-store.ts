/**
 * In-memory TenantStore implementation.
 * Suitable for development and single-instance deployments.
 */

import type { TenantStore, TenantConfig } from '../types'

export class MemoryTenantStore implements TenantStore {
  private data = new Map<string, string>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()

  async get(key: string): Promise<TenantConfig | null> {
    const raw = this.data.get(key)
    if (!raw) return null
    return JSON.parse(raw) as TenantConfig
  }

  async put(key: string, config: TenantConfig, ttlSeconds?: number): Promise<void> {
    this.data.set(key, JSON.stringify(config))

    // Clear any existing timer
    const existing = this.timers.get(key)
    if (existing) clearTimeout(existing)

    if (ttlSeconds) {
      const timer = setTimeout(() => {
        this.data.delete(key)
        this.timers.delete(key)
      }, ttlSeconds * 1000)
      // Don't block process exit
      if (timer.unref) timer.unref()
      this.timers.set(key, timer)
    }
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key)
    const timer = this.timers.get(key)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(key)
    }
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = []
    for (const key of this.data.keys()) {
      if (key.startsWith(prefix)) keys.push(key)
    }
    return keys
  }
}
