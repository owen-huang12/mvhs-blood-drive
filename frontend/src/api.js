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

/** Step one of coordinator registration: is this admin code real? */
export const verifyInviteCode = (inviteCode) =>
    request("/coordinator/verify-invite", {
        method: "POST",
        body: { invite_code: inviteCode },
    });

export const createCoordinator = ({ fullName, email, password, inviteCode }) =>
    request("/coordinator", {
        method: "POST",
        body: {
            full_name: fullName,
            email,
            password,
            invite_code: inviteCode,
        },
    });

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

/**
 * Parse one SSE frame into `{ type, data }`, or null if it carries no data.
 *
 * Comment frames (`: keepalive`) are the null case — they exist only to hold
 * the connection open through proxies.
 */
function parseFrame(frame) {
    let type = "message";
    const data = [];

    for (const line of frame.split("\n")) {
        if (line.startsWith(":")) continue;
        if (line.startsWith("event:")) type = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trim());
    }

    if (data.length === 0) return null;
    return { type, data: JSON.parse(data.join("\n")) };
}

/**
 * Read `/events` until the connection drops or `signal` aborts.
 *
 * Uses `fetch` rather than `EventSource` because the endpoint is authenticated
 * and `EventSource` cannot send an Authorization header.
 */
export async function openSignUpStream({ signal, onEvent }) {
    const res = await fetch(`${BASE_URL}/events`, {
        headers: { Authorization: `Bearer ${getToken()}` },
        signal,
    });
    if (!res.ok) throw new ApiError(res.status, `Stream failed: ${res.status}`);

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) return;

        buffer += value;
        // A frame ends at a blank line; a read can deliver several, or half of
        // one, so whatever trails the last separator stays buffered.
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const parsed = parseFrame(frame);
            if (parsed) onEvent(parsed);
        }
    }
}

export const login = (email, password) =>
    request("/login", {
        method: "POST",
        // OAuth2PasswordRequestForm expects form encoding, not JSON.
        form: new URLSearchParams({ username: email, password }),
    });
