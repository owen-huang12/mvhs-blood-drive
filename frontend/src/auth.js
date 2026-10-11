const TOKEN_KEY = "coordinator_token";

export function saveToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}

export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
}

/**
 * The server rejected the token (it expired, or the account is gone): drop it
 * and send the coordinator to sign in again, rather than leaving every save
 * on the page failing with a generic error.
 */
export function endSession() {
    clearToken();
    window.location.assign("/coordinators?expired=1");
}

/** The token's payload, or null if there isn't a readable one. */
function tokenPayload() {
    const token = getToken();
    if (!token) return null;
    try {
        return JSON.parse(atob(token.split(".")[1]));
    } catch {
        return null;
    }
}

/**
 * Signed in as the attendance clerk rather than a coordinator.
 *
 * The API decides this too — her token is refused everywhere but the roster,
 * the stream and her own filing. This copy only keeps the UI honest, so she
 * is not shown a dashboard that would fail on every request.
 */
export const isClerk = () => tokenPayload()?.role === "attendance_clerk";

export function isTokenValid() {
    const payload = tokenPayload();
    return Boolean(payload) && payload.exp * 1000 > Date.now();
}
