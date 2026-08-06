export const STAFF_EMAIL_DOMAIN = "osam-staff.local";

export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@${STAFF_EMAIL_DOMAIN}`;
}
