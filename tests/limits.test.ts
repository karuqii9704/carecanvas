import { describe, expect, it } from "vitest";

import { LimitExceededError, SlidingWindowRateLimiter, UsageBudget } from "@/server/security/limits";

describe("cost and abuse guardrails", () => {
  it("enforces daily live generation limits", () => {
    const budget = new UsageBudget(1, 50);
    const now = new Date("2026-07-20T05:00:00Z");
    budget.reserve("owner", now);
    expect(() => budget.reserve("owner", now)).toThrow(LimitExceededError);
  });

  it("enforces a lifetime ceiling across days", () => {
    const budget = new UsageBudget(2, 2);
    budget.reserve("owner", new Date("2026-07-20T05:00:00Z"));
    budget.reserve("owner", new Date("2026-07-21T05:00:00Z"));
    expect(() => budget.reserve("owner", new Date("2026-07-22T05:00:00Z"))).toThrow(/budget is exhausted/);
  });

  it("resets a request window after its duration", () => {
    const limiter = new SlidingWindowRateLimiter(1, 1_000);
    limiter.check("ip", 1_000);
    expect(() => limiter.check("ip", 1_500)).toThrow(/Too many requests/);
    expect(() => limiter.check("ip", 2_001)).not.toThrow();
  });
});
