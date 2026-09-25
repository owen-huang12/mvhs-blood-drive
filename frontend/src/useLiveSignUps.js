import { useCallback, useEffect, useState } from "react";
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

    const applyRemote = useCallback((row) => {
        setSignUps((prev) =>
            prev.some((signUp) => signUp.id === row.id)
                ? prev.map((signUp) => (signUp.id === row.id ? row : signUp))
                : [...prev, row],
        );
    }, []);

    useSignUpStream({ onRow: applyRemote, onResync: load });

    /** Swap in the row a local write returned. */
    const applyUpdate = useCallback((updated) => {
        setSignUps((prev) =>
            prev.map((signUp) => (signUp.id === updated.id ? updated : signUp)),
        );
    }, []);

    return { signUps, loading, error, setError, applyUpdate };
}
