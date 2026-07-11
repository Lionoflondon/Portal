export const ADMIN_CLAIM = 'portalAdmin';
export const SUPER_ADMIN_EMAIL = 'ayojason600@gmail.com';

export function isAdminUser(claims = {}) {
  return claims[ADMIN_CLAIM] === true;
}
