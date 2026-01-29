/**
 * Instrumentation для логирования серверных ошибок (в т.ч. 503 и RSC).
 * Ошибки при рендере _rsc попадают сюда — в логах будет path, заголовки (без cookie), стек.
 * См. docs/503-DEBUG.md
 */
import * as Sentry from '@sentry/nextjs';

export async function register() {
  // При необходимости — инициализация метрик/трейсинга при старте
}

type RequestInfo = {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
};

type ErrorContext = {
  routerKind?: 'Pages Router' | 'App Router';
  routePath?: string;
  routeType?: 'render' | 'route' | 'action' | 'proxy';
  renderSource?: 'react-server-components' | 'react-server-components-payload' | 'server-rendering';
  revalidateReason?: 'on-demand' | 'stale' | undefined;
  renderType?: 'dynamic' | 'dynamic-resume';
};

function sanitizeHeaders(headers: RequestInfo['headers'] | Headers): Record<string, string> {
  const out: Record<string, string> = {};
  const allow = ['rsc', 'next-router-prefetch', 'next-url', 'referer', 'user-agent', 'x-forwarded-for'];
  const isHeadersInstance = headers instanceof Headers;
  const keys = isHeadersInstance
    ? Array.from((headers as Headers).keys())
    : Object.keys(headers ?? {});
  for (const key of keys) {
    const k = key.toLowerCase();
    if (allow.some((a) => k === a || k.startsWith('x-'))) {
      const v = isHeadersInstance
        ? (headers as Headers).get(key)
        : (headers as Record<string, string | string[] | undefined>)[key];
      out[key] = Array.isArray(v) ? v.join(', ') : (v ?? '');
    }
  }
  return out;
}

export const onRequestError = async (
  err: Error & { digest?: string },
  request: RequestInfo,
  context: ErrorContext
) => {
  const payload = {
    message: err.message,
    name: err.name,
    digest: err.digest,
    path: request.path,
    method: request.method,
    headers: sanitizeHeaders(request.headers),
    context: {
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
      renderType: context.renderType,
    },
    stack: err.stack,
  };

  // Единый блок в stdout для поиска по логам (grep "\[onRequestError\]" или "\[503/RSC\]")
  console.error(
    '[onRequestError]',
    JSON.stringify(
      {
        ...payload,
        stack: payload.stack?.split('\n').slice(0, 15).join('\n'),
      },
      null,
      2
    )
  );

  Sentry.captureException(err, {
    tags: {
      routePath: context.routePath ?? request.path,
      routeType: context.routeType ?? 'unknown',
      renderSource: context.renderSource ?? 'unknown',
    },
    extra: {
      path: request.path,
      method: request.method,
      digest: err.digest,
      context,
    },
  });
};
