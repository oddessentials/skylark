export const cookieName = 'admin_session';

export function hasAdminSession(request: Request): boolean {
  const cookie = request.headers.get('cookie') ?? '';
  return cookie.split(';').some((part) => part.trim().startsWith(`${cookieName}=`));
}
