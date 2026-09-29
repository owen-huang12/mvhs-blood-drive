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

export function isTokenValid() {
    const token = getToken();
    if (!token) return false;
    try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        return payload.exp * 1000 > Date.now();
    } catch {
        return false;
    }
}
