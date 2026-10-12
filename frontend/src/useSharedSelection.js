import { useCallback, useEffect, useRef, useState } from "react";
import { publishSelection } from "./api.js";

/* The shortest gap between two publishes while a selection is changing.
   Extending a block fires on every cell crossed; at this rate a long drag
   costs a handful of requests rather than one per row. */
const PUBLISH_EVERY_MS = 120;

/**
 * Share this coordinator's selection with the other dashboards, and collect
 * theirs.
 *
 * Nothing here touches the database: a selection is a cursor position, and
 * putting it on the write path would slow down the writes that matter. It
 * rides the stream the page already holds open, so no extra connection is
 * made either.
 *
 * Publishing is throttled and the last state always wins, so a drag sends a
 * few small requests and finishes with the block it ended on — never a
 * stale one.
 *
 * `selected` is the local selection; returns everyone else's, keyed by the
 * coordinator they belong to. The viewer's own is filtered out — the
 * stream delivers every event to every dashboard, the sender included, so
 * without `selfEmail` a coordinator sees their own ring drawn twice.
 */
export default function useSharedSelection(
    selected,
    { enabled = true, selfEmail } = {},
) {
    const [others, setOthers] = useState([]);

    // What is on the wire and what is waiting to go, so the throttle can
    // coalesce a burst into one trailing send.
    const lastSent = useRef("");
    const pendingRef = useRef(null);
    const timer = useRef(null);

    const send = useCallback((cells) => {
        const signature = cells.join(",");
        if (signature === lastSent.current) return;
        lastSent.current = signature;
        // A failure here is not worth surfacing: the next change republishes,
        // and a missing ring is a cosmetic loss, not a lost edit.
        publishSelection(cells).catch(() => {});
    }, []);

    useEffect(() => {
        if (!enabled) return;
        const cells = [...selected];

        // Leading edge, so the first cell of a selection shows at once.
        if (timer.current === null) {
            send(cells);
            timer.current = setTimeout(() => {
                timer.current = null;
                if (pendingRef.current) {
                    send(pendingRef.current);
                    pendingRef.current = null;
                }
            }, PUBLISH_EVERY_MS);
            return;
        }
        // Mid-throttle: hold the latest, which the timer will send.
        pendingRef.current = cells;
    }, [selected, enabled, send]);

    // Clear the ring on the way out rather than leaving it to time out.
    useEffect(() => {
        if (!enabled) return undefined;
        const drop = () => {
            if (lastSent.current === "") return;
            lastSent.current = "";
            publishSelection([], { keepalive: true }).catch(() => {});
        };
        window.addEventListener("pagehide", drop);
        return () => {
            window.removeEventListener("pagehide", drop);
            clearTimeout(timer.current);
            timer.current = null;
            drop();
        };
    }, [enabled]);

    /** A `selection.changed` event from the stream. */
    const applySelection = useCallback(
        (entry) => {
            // This dashboard's own selection, echoed back: it is already
            // drawn from local state, and a second copy would stack a
            // duplicate tag beside the first. Also covers the same person
            // in two tabs, who is one coordinator either way.
            if (selfEmail && entry.email === selfEmail) return;
            setOthers((prev) => {
                const without = prev.filter((o) => o.email !== entry.email);
                return entry.cells?.length
                    ? [...without, { ...entry, selected: new Set(entry.cells) }]
                    : without;
            });
        },
        [selfEmail],
    );

    return { others, applySelection };
}
