import { authenticateOwner, getDatabase, ownerRepositories, portfolioService, summaryService } from '@portfolio-pilot/db';
import { parseServerConfig } from '@portfolio-pilot/config/server';
import { getAuthentication, assertMutationOrigin } from './auth';
import { errorResponse, getRequestId } from './http';

export class AccessError extends Error {
  constructor(public readonly status: 401 | 403 | 404, message: string) { super(message); }
}
type Authorization = {
  user: { id: string; name: string; email: string };
  expiresAt: Date;
  repositories: ReturnType<typeof ownerRepositories>;
  portfolios: ReturnType<typeof portfolioService>;
  summaries: ReturnType<typeof summaryService>;
};
export async function requireAuthorization(request: Request): Promise<Authorization> {
  try { assertMutationOrigin(request); } catch { throw new AccessError(403, 'Untrusted request origin.'); }
  const auth = await getAuthentication();
  const session = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
  if (!session) throw new AccessError(401, 'Sign in to continue.');
  const db = await getDatabase(parseServerConfig(process.env).DATABASE_URL!);
  // A second current DB check mints the opaque repository context, never a browser ID.
  let owner;
  try { owner = await authenticateOwner(db, session.session.token); }
  catch { throw new AccessError(401, 'Sign in to continue.'); }
  return { user: session.user, expiresAt: session.session.expiresAt, repositories: ownerRepositories(db, owner), portfolios: portfolioService(db, owner), summaries: summaryService(db, owner) };
}
export async function requirePortfolio(request: Request, id: string): Promise<Authorization & {
  portfolio: NonNullable<Awaited<ReturnType<Authorization['repositories']['getPortfolio']>>>;
}> {
  const authorization = await requireAuthorization(request);
  const portfolio = await authorization.repositories.getPortfolio(id);
  if (!portfolio) throw new AccessError(404, 'Resource not found.');
  return { ...authorization, portfolio };
}
export function accessResponse(request: Request, error: unknown): Response {
  const status = error instanceof AccessError ? error.status : 503;
  const code = status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR';
  const response = errorResponse(code, error instanceof AccessError ? error.message : 'Service unavailable.', getRequestId(request), status);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
