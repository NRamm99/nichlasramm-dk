const AUTH_EMAIL_DOMAIN = "users.padelbyramm.invalid";

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string): boolean {
  return /^[a-z0-9._-]{3,24}$/.test(normalizeUsername(value));
}

export function usernameToAuthEmail(username: string): string {
  return `${normalizeUsername(username)}@${AUTH_EMAIL_DOMAIN}`;
}
