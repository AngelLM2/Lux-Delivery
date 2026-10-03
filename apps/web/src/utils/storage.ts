/**
 * Token storage is no longer needed — tokens live in HttpOnly cookies
 * set by the server. These stubs are kept to avoid breaking any imports
 * but they are no-ops.
 */

export const getAccessToken = () => null
export const getRefreshToken = () => null
export const setTokens = (_tokens: { access_token?: string; refresh_token?: string }) => {}
export const clearTokens = () => {
  // Tokens are cleared server-side via POST /auth/logout
}
