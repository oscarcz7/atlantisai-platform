import { request as httpRequest, type IncomingMessage } from 'node:http';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import type { FetchLike } from './digest-fetch.js';

/**
 * Per-reader TLS trust settings. TLS verification is never disabled globally:
 * - `ca`: PEM of a private CA (or the reader's own self-signed cert) used *instead of* the
 *   system store for this reader only; normal chain + hostname/IP validation applies.
 * - `fingerprint256`: SHA-256 fingerprint of the reader's leaf certificate. The connection is
 *   only used if the presented certificate matches exactly (chain validation is not required,
 *   which is what makes self-signed reader certs usable). If `ca` is also set, both must pass.
 */
export interface ReaderTlsOptions {
  ca?: string;
  fingerprint256?: string;
}

/** Normalizes "ab:cd..." / "ABCD..." to the "AB:CD:..." format Node reports. Returns null if invalid. */
export function normalizeFingerprint(raw: string): string | null {
  const hex = raw
    .replace(/^sha256[:=]?/i, '')
    .replace(/[\s:]/g, '')
    .toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(hex)) return null;
  return hex.match(/.{2}/g)!.join(':');
}

export function hasPinnedTls(tls: ReaderTlsOptions | undefined): tls is ReaderTlsOptions {
  return Boolean(tls && (tls.ca || tls.fingerprint256));
}

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function connectVerified(
  host: string,
  port: number,
  tls: ReaderTlsOptions,
  signal: AbortSignal,
): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const pin = tls.fingerprint256 ? normalizeFingerprint(tls.fingerprint256) : null;
    if (tls.fingerprint256 && !pin) {
      reject(new Error('Invalid TLS fingerprint256 configured for reader.'));
      return;
    }
    if (signal.aborted) {
      reject(signal.reason ?? new Error('aborted'));
      return;
    }

    const socket = tlsConnect({
      host,
      port,
      ...(tls.ca ? { ca: tls.ca } : {}),
      // With a fingerprint pin the chain is not required to validate (self-signed reader certs);
      // the pin check below is mandatory and happens before any byte of the request is written.
      // With only a CA, full verification (chain + identity) stays on.
      rejectUnauthorized: !pin,
    });

    const onAbort = () => {
      socket.destroy();
      reject(signal.reason ?? new Error('aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });

    socket.once('secureConnect', () => {
      signal.removeEventListener('abort', onAbort);
      if (pin) {
        if (tls.ca && !socket.authorized) {
          socket.destroy();
          reject(
            new Error(
              `Reader TLS certificate not trusted by pinned CA: ${String(socket.authorizationError)}`,
            ),
          );
          return;
        }
        const presented = socket.getPeerCertificate()?.fingerprint256?.toUpperCase();
        if (!presented || presented !== pin) {
          socket.destroy();
          reject(
            new Error(`Reader TLS certificate fingerprint mismatch (got ${presented ?? 'none'}).`),
          );
          return;
        }
      }
      resolve(socket);
    });
    socket.once('error', (err) => {
      signal.removeEventListener('abort', onAbort);
      reject(err);
    });
  });
}

function toResponse(res: IncomingMessage, body: Buffer): Response {
  const headers = new Headers();
  for (const [key, value] of Object.entries(res.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.set(key, value);
  }
  const status = res.statusCode ?? 502;
  const nullBody = status === 204 || status === 205 || status === 304;
  return new Response(nullBody ? null : new Uint8Array(body), { status, headers });
}

/**
 * fetch-compatible transport for HTTPS readers with a pinned CA / fingerprint.
 * Built on node:tls + node:http (no third-party deps; undici is not a dependency of this package).
 */
export function createPinnedTlsFetch(tls: ReaderTlsOptions): FetchLike {
  return async (url, init) => {
    const target = new URL(url);
    if (target.protocol !== 'https:') {
      throw new Error('Pinned TLS transport only supports https:// URLs.');
    }
    const host = stripBrackets(target.hostname);
    const port = Number(target.port || 443);
    const socket = await connectVerified(host, port, tls, init.signal);

    return new Promise<Response>((resolve, reject) => {
      const headers: Record<string, string> = { ...init.headers, Host: target.host };
      if (init.body !== undefined) {
        headers['Content-Length'] = String(Buffer.byteLength(init.body));
      }
      const req = httpRequest({
        createConnection: () => socket,
        method: init.method,
        path: `${target.pathname}${target.search}`,
        headers,
        signal: init.signal,
      });
      req.once('response', (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.once('end', () => {
          socket.end();
          resolve(toResponse(res, Buffer.concat(chunks)));
        });
        res.once('error', reject);
      });
      req.once('error', (err) => {
        socket.destroy();
        reject(err);
      });
      if (init.body !== undefined) req.write(init.body);
      req.end();
    });
  };
}
