import { useEffect, useRef } from "react";
import { openSignUpStream } from "./api.js";

const FIRST_RETRY_MS = 1000;
const MAX_RETRY_MS = 30000;

/**
 * Keep the dashboard in step with every other open dashboard.
 *
 * `onRow` receives a full sign-up row to upsert. `onResync` is called when the
 * local view may have missed events and has to be rebuilt from a fetch —
 * events sent while disconnected are not replayed, so reconnecting without a
 * resync would leave the table silently stale.
 */
export default function useSignUpStream({ onRow, onResync }) {
    // Held in refs so a changing callback identity never tears down the
    // connection; the effect below deliberately runs once.
    const onRowRef = useRef(onRow);
    const onResyncRef = useRef(onResync);

    useEffect(() => {
        onRowRef.current = onRow;
        onResyncRef.current = onResync;
    });

    useEffect(() => {
        const controller = new AbortController();
        let stopped = false;
        let retryMs = FIRST_RETRY_MS;
        let timer;
        // The first connection rides along with the initial load, which has
        // already fetched the rows. Only reconnections need to resync.
        let isReconnect = false;

        const connect = async () => {
            try {
                await openSignUpStream({
                    signal: controller.signal,
                    onEvent: ({ type, data }) => {
                        if (type === "ready") {
                            // Reaching the server proves the backoff can reset.
                            retryMs = FIRST_RETRY_MS;
                            if (isReconnect) onResyncRef.current();
                        } else if (type === "desync") {
                            onResyncRef.current();
                        } else {
                            onRowRef.current(data);
                        }
                    },
                });
            } catch (err) {
                if (controller.signal.aborted) return;
                // A rejected token will not start working on its own, so
                // retrying just burns requests until the coordinator signs in.
                if (err.status === 401) return;
            }

            if (stopped) return;
            isReconnect = true;
            timer = setTimeout(connect, retryMs);
            retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
        };

        connect();

        return () => {
            stopped = true;
            controller.abort();
            clearTimeout(timer);
        };
    }, []);
}
