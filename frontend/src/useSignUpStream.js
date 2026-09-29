import { useEffect, useRef } from "react";
import { openSignUpStream } from "./api.js";
import { endSession } from "./auth.js";

const FIRST_RETRY_MS = 1000;
const MAX_RETRY_MS = 30000;

// The server sends a keepalive every 20s (SSE_KEEPALIVE_SECONDS in
// backend/main.py). Two missed in a row means the connection is dead even if
// the browser hasn't noticed, which is what happens when a laptop sleeps or a
// phone changes networks.
const IDLE_TIMEOUT_MS = 45000;

const ROW_EVENTS = new Set(["sign_up.created", "sign_up.updated"]);

/**
 * Keep the dashboard in step with every other open dashboard.
 *
 * `onRow` receives a full sign-up row to upsert, `onCapacity` a slot whose
 * positions another coordinator changed. `onResync` is called when the local
 * view may have missed events and has to be rebuilt from a fetch — events sent
 * while disconnected are not replayed, so reconnecting without a resync would
 * leave the table silently stale.
 */
export default function useSignUpStream({ onRow, onCapacity, onResync }) {
    // Held in refs so a changing callback identity never tears down the
    // connection; the effect below deliberately runs once.
    const onRowRef = useRef(onRow);
    const onCapacityRef = useRef(onCapacity);
    const onResyncRef = useRef(onResync);

    useEffect(() => {
        onRowRef.current = onRow;
        onCapacityRef.current = onCapacity;
        onResyncRef.current = onResync;
    });

    useEffect(() => {
        let stopped = false;
        let retryMs = FIRST_RETRY_MS;
        let timer;
        // The live connection's controller, or null while waiting to retry.
        let current = null;
        let lastActivity = Date.now();
        // The first connection rides along with the initial load, which has
        // already fetched the rows. Only reconnections need to resync.
        let isReconnect = false;

        const connect = async () => {
            const attempt = new AbortController();
            current = attempt;
            let idle;
            const onActivity = () => {
                lastActivity = Date.now();
                clearTimeout(idle);
                idle = setTimeout(() => attempt.abort(), IDLE_TIMEOUT_MS);
            };
            onActivity();

            try {
                await openSignUpStream({
                    signal: attempt.signal,
                    onActivity,
                    onEvent: ({ type, data }) => {
                        if (type === "ready") {
                            // Reaching the server proves the backoff can reset.
                            retryMs = FIRST_RETRY_MS;
                            if (isReconnect) onResyncRef.current();
                        } else if (type === "desync") {
                            onResyncRef.current();
                        } else if (type === "capacity.updated") {
                            // Optional: the day-of pages don't show capacity.
                            onCapacityRef.current?.(data);
                        } else if (ROW_EVENTS.has(type)) {
                            onRowRef.current(data);
                        }
                    },
                });
            } catch (err) {
                if (stopped) return;
                // A rejected token will not start working on its own.
                if (err.status === 401) {
                    endSession();
                    return;
                }
            } finally {
                clearTimeout(idle);
                if (current === attempt) current = null;
            }

            if (stopped) return;
            isReconnect = true;
            timer = setTimeout(connect, retryMs);
            retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
        };

        // Coming back to the tab, or back online: timers may not have run
        // while the device slept, so check by the clock and reconnect now if
        // the stream has gone quiet, instead of waiting out the backoff.
        const wake = () => {
            if (stopped || document.visibilityState !== "visible") return;
            if (current) {
                if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) current.abort();
            } else {
                clearTimeout(timer);
                retryMs = FIRST_RETRY_MS;
                connect();
            }
        };

        connect();
        document.addEventListener("visibilitychange", wake);
        window.addEventListener("online", wake);

        return () => {
            stopped = true;
            current?.abort();
            clearTimeout(timer);
            document.removeEventListener("visibilitychange", wake);
            window.removeEventListener("online", wake);
        };
    }, []);
}
