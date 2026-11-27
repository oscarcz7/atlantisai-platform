interface Res {
  setHeader(name: string, value: string): void;
}

/** helmet-equivalent baseline for a JSON API (no new dependency). */
export function securityHeadersMiddleware(isProduction: boolean) {
  return (req: { path: string }, res: Res, next: () => void): void => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    if (isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (req.path.startsWith('/auth/') || req.path.startsWith('/access/passes/')) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  };
}
