// DesignHub is restricted to these organizations — enforced on register, email
// login, and Google sign-in alike, so it can't be bypassed via any one path.
const ALLOWED_DOMAINS = ['cutm.ac.in', 'cutmap.ac.in', 'thegttech.com'];

export function isAllowedEmailDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return !!domain && ALLOWED_DOMAINS.includes(domain);
}

export const ALLOWED_DOMAINS_MESSAGE = `Access is restricted to ${ALLOWED_DOMAINS.join(', ')} email addresses.`;
