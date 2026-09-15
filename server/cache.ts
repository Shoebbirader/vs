/**
 * Simple in-memory cache with TTL support
 * Redis-ready design: easy to replace with Redis later
 */

interface CacheEntry {
  value: any;
  expiresAt: number;
}

class Cache {
  private store: Map<string, CacheEntry> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Get a value from cache
   */
  get(key: string): any {
    const entry = this.store.get(key);
    if (!entry) return null;
    
    // Check expiration
    if (entry.expiresAt < Date.now()) {
      this.invalidate(key);
      return null;
    }
    
    return entry.value;
  }

  /**
   * Set a value in cache with TTL
   * @param key Cache key
   * @param value Value to cache
   * @param ttlMs Time-to-live in milliseconds
   */
  set(key: string, value: any, ttlMs: number = 60000): void {
    // Clear existing timer if any
    const existingTimer = this.timers.get(key);
    if (existingTimer) clearTimeout(existingTimer);

    // Store value with expiration time
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });

    // Auto-invalidate after TTL
    const timer = setTimeout(() => this.invalidate(key), ttlMs);
    this.timers.set(key, timer);
  }

  /**
   * Manually invalidate a cache entry
   */
  invalidate(key: string): void {
    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
    this.store.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    // Clear all timers
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.store.clear();
  }

  /**
   * Get cache stats (for debugging)
   */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.store.size,
      keys: Array.from(this.store.keys()),
    };
  }
}

// Global cache instance
export const cache = new Cache();

/**
 * Cache keys used throughout the system
 */
export const CACHE_KEYS = {
  // Fleet health metrics (60 second TTL)
  FLEET_HEALTH: (orgId: string) => `fleet-health:${orgId}`,
  
  // Cost breakdown per vehicle (1 hour TTL)
  VEHICLE_COST_BREAKDOWN: (vehicleId: string) => `vehicle-cost:${vehicleId}`,
  
  // Component maintenance predictions (1 day TTL)
  COMPONENT_PREDICTION: (componentId: string) => `component-pred:${componentId}`,
  
  // Anomaly detection results (1 hour TTL)
  ANOMALIES: (orgId: string) => `anomalies:${orgId}`,
  
  // Maintenance readiness scores (12 hours TTL)
  MAINTENANCE_READINESS: (vehicleId: string) => `maintenance-ready:${vehicleId}`,
};

/**
 * TTL constants (in milliseconds)
 */
export const TTL = {
  SHORT: 60 * 1000,           // 1 minute
  MEDIUM: 60 * 60 * 1000,      // 1 hour
  LONG: 24 * 60 * 60 * 1000,   // 1 day
};

export { Cache };
