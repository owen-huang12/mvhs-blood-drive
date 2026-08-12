import { getToken } from "./auth.js";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/**
 * Thrown for any non-2xx response so callers can catch network and HTTP
 * failures in one place.
 */
export class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

async function request(path, { method = "GET", body, form, auth = false } = {}) {
    const headers = {};
    if (auth) headers.Authorization = `Bearer ${getToken()}`;
    if (body) headers["Content-Type"] = "application/json";

    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : form,
    });

    if (!res.ok) {
        // FastAPI puts the human-readable reason in `detail`; surface it so
        // callers can show the real message rather than a status code.
        let detail;
        try {
            ({ detail } = await res.json());
        } catch {
            detail = undefined;
        }
        throw new ApiError(res.status, detail || `Request failed: ${res.status}`);
    }
    return res.json();
}

export const signUpStudent = (signUp) =>
    request("/student-sign-up", { method: "POST", body: signUp });

export const getCurrentCoordinator = () => request("/me", { auth: true });

export const listSignUps = () => request("/sign-ups", { auth: true });

export const confirmSignUp = (id, timeSlot) =>
    request(`/sign-ups/${id}/confirm`, {
        method: "PATCH",
        auth: true,
        body: { time_slot: timeSlot },
    });

export const unconfirmSignUp = (id) =>
    request(`/sign-ups/${id}/unconfirm`, { method: "PATCH", auth: true });

/** Coordinator override: move a sign-up to any slot on the schedule. */
export const moveSignUp = (id, timeSlot) =>
    request(`/sign-ups/${id}/slot`, {
        method: "PATCH",
        auth: true,
        body: { time_slot: timeSlot },
    });

export const login = (email, password) =>
    request("/login", {
        method: "POST",
        // OAuth2PasswordRequestForm expects form encoding, not JSON.
        form: new URLSearchParams({ username: email, password }),
    });
