/**
 * Liveness probe for docker-compose (and later for a Kubernetes livenessProbe).
 *
 * It answers from this process and nothing else: no cookies, no session, no call to
 * account-service or product-service. That is the whole point - the probe must report
 * "the Next.js server is up", not "the catalogue happens to be reachable". Probing `/`
 * instead server-renders the landing page, which fans out to two upstream calls on
 * every check and reports a perfectly healthy frontend as unhealthy whenever
 * product-service is merely slow.
 *
 * `src/middleware.ts` excludes this path from its matcher, so a probe never triggers
 * session work either.
 */

// Never prerendered: a statically generated 200 would keep answering from the build
// output even if the running server were wedged.
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return new Response('ok', {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
