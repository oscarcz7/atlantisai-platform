/**
 * Minimal fixed-window, in-memory rate limiter (per instance). It is a first line of defence
 * against credential stuffing / token guessing; per-account lockout and Cloud Armor/WAF
 * remain the global controls when running several Cloud Run instances.
 */
interface Req {
  ip?: string;
  method: string;
  path: string;
}
interface Res {
  status(code: number): Res;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

export interface RateLimitRule {
  /** Matches req.path (method-agnostic). */
  pattern: RegExp;
  limit: number;
  windowMs: number;
}

export class FixedWindowLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = 0;

  constructor(private readonly maxKeys = 50_000) {}

  /** Returns seconds to wait, or 0 if allowed. */
  hit(key: string, limit: number, windowMs: number, now = Date.now()): number {
    this.sweep(now);
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (this.buckets.size >= this.maxKeys) this.buckets.clear();
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return 0;
    }
    bucket.count += 1;
    if (bucket.count > limit) return Math.ceil((bucket.resetAt - now) / 1000);
    return 0;
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }
}

export const DEFAULT_RATE_LIMIT_RULES: RateLimitRule[] = [
  { pattern: /^\/auth\/login$/, limit: 10, windowMs: 60_000 },
  { pattern: /^\/auth\/(forgot-password|reset-password|accept-invite)$/, limit: 5, windowMs: 60_000 },
  { pattern: /^\/auth\/2fa\/(setup|confirm)$/, limit: 10, windowMs: 60_000 },
  { pattern: /^\/auth\/refresh$/, limit: 60, windowMs: 60_000 },
  { pattern: /^\/access\/passes\//, limit: 60, windowMs: 60_000 },
  { pattern: /^\/access\/gateway\//, limit: 600, windowMs: 60_000 },
];

export function createRateLimitMiddleware(
  rules: RateLimitRule[] = DEFAULT_RATE_LIMIT_RULES,
  limiter = new FixedWindowLimiter(),
) {
  return (req: Req, res: Res, next: () => void): void => {
    if (req.method === 'OPTIONS') return next();
    const ruleIndex = rules.findIndex((r) => r.pattern.test(req.path));
    if (ruleIndex === -1) return next();
    const rule = rules[ruleIndex]!;
    const retryAfter = limiter.hit(`${ruleIndex}:${req.ip ?? 'unknown'}`, rule.limit, rule.windowMs);
    if (retryAfter > 0) {
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        code: 'RATE_LIMITED',
        message: 'Demasiadas solicitudes. Intenta nuevamente en unos momentos.',
      });
      return;
    }
    next();
  };
}
