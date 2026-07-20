import "server-only";

export class LimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LimitExceededError";
  }
}

type UsageRecord = { dates: string[]; lifetime: number };

export class UsageBudget {
  private readonly usage = new Map<string, UsageRecord>();

  constructor(
    private readonly dailyLimit: number,
    private readonly lifetimeLimit: number,
  ) {}

  reserve(ownerId: string, now = new Date()): void {
    const day = now.toISOString().slice(0, 10);
    const record = this.usage.get(ownerId) ?? { dates: [], lifetime: 0 };
    const todayCount = record.dates.filter((date) => date === day).length;
    if (todayCount >= this.dailyLimit) throw new LimitExceededError("Daily live-generation limit reached.");
    if (record.lifetime >= this.lifetimeLimit) throw new LimitExceededError("Public demo generation budget is exhausted.");
    record.dates.push(day);
    record.lifetime += 1;
    this.usage.set(ownerId, record);
  }
}

type WindowRecord = { count: number; resetAt: number };

export class SlidingWindowRateLimiter {
  private readonly windows = new Map<string, WindowRecord>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now = Date.now()): void {
    const record = this.windows.get(key);
    if (!record || record.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }
    if (record.count >= this.limit) throw new LimitExceededError("Too many requests. Try again shortly.");
    record.count += 1;
  }
}

const globalLimits = globalThis as typeof globalThis & {
  __carecanvasRateLimiter?: SlidingWindowRateLimiter;
  __carecanvasBudget?: UsageBudget;
};

export function getRateLimiter(): SlidingWindowRateLimiter {
  globalLimits.__carecanvasRateLimiter ??= new SlidingWindowRateLimiter(6, 10 * 60 * 1000);
  return globalLimits.__carecanvasRateLimiter;
}

export function getUsageBudget(daily = 1, lifetime = 50): UsageBudget {
  globalLimits.__carecanvasBudget ??= new UsageBudget(daily, lifetime);
  return globalLimits.__carecanvasBudget;
}
