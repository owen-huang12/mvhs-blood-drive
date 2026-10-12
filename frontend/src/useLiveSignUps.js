import { useCallback, useEffect, useRef, useState } from "react";
import { listSignUps } from "./api.js";
import useSignUpStream from "./useSignUpStream.js";

/**
 * Every sign-up, kept current from the event stream.
 *
 * The day-of station and the clerk's worklist are two views of the same rows
 * being written from both sides at once, so each has to see the other's
 * writes without a refresh.
 *
 * Unlike the coordinator dashboard this holds no lock set: day-of writes are
 * single-field taps that settle immediately, not drags that a late-arriving
 * update could yank out from under the user.
 */
export default function useLiveSignUps() {
    const [signUps, setSignUps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    /** Fetch and replace every row. Also the resync path after a dropped stream. */
    const load = useCallback(async (cancelled = () => false) => {
        try {
            const rows = await listSignUps();
            if (cancelled()) return;
            setSignUps(rows);
            setError("");
        } catch {
            if (cancelled()) return;
            setError("Could not load sign-ups. Check that the server is running.");
        } finally {
            if (!cancelled()) setLoading(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            await load(() => cancelled);
        })();

        return () => {
            cancelled = true;
        };
    }, [load]);

    /**
     * Rows this page has written and not yet seen come back.
     *
     * Every write is echoed to every dashboard, including the one that made
     * it, so without this a local change lands twice — once from the
     * response, once from the echo. With several writes in flight the
     * echoes interleave with the responses and the row flickers between
     * their partial views on its way to settling.
     */
    const pending = useRef(new Map());

    /** Upsert one row: replace it if it is already held, add it if not. */
    const upsert = useCallback((row) => {
        setSignUps((prev) =>
            prev.some((signUp) => signUp.id === row.id)
                ? prev.map((signUp) => (signUp.id === row.id ? row : signUp))
                : [...prev, row],
        );
    }, []);

    /** A pushed row from another dashboard — or an echo of one of ours. */
    const applyRemote = useCallback(
        (row) => {
            if (pending.current.has(row.id)) return;
            upsert(row);
        },
        [upsert],
    );

    useSignUpStream({ onRow: applyRemote, onResync: load });

    /** Swap in the row a local write returned. */
    const applyUpdate = useCallback((updated) => {
        setSignUps((prev) =>
            prev.map((signUp) => (signUp.id === updated.id ? updated : signUp)),
        );
    }, []);

    /**
     * Run a write, ignoring this row's pushed updates until it settles.
     *
     * Counted rather than flagged: two writes to one row can overlap, and
     * the first to finish must not reopen it while the second is still out.
     */
    const write = useCallback(async (id, action) => {
        pending.current.set(id, (pending.current.get(id) ?? 0) + 1);
        try {
            return await action();
        } finally {
            const left = (pending.current.get(id) ?? 1) - 1;
            if (left > 0) pending.current.set(id, left);
            else pending.current.delete(id);
        }
    }, []);

    return {
        signUps,
        loading,
        error,
        setError,
        applyUpdate,
        write,
        addRow: upsert,
    };
}
