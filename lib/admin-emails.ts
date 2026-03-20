/** Emails allowed to access the admin panel. Case-insensitive check. */
export const ADMIN_EMAILS = [
  'gloss.odessa@gmail.com',
];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
