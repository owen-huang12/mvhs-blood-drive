import { useEffect, useState } from "react";
import { currentSlotTime } from "./dayOf.js";

/** Milliseconds until the next whole minute, plus a moment's slack. */
const untilNextMinute = () => 60000 - (Date.now() % 60000) + 250;

/**
 * The schedule time the drive is currently in, kept current as the day runs.
 *
 * Re-checked on the minute rather than on an interval from mount, so the
 * highlight moves when the clock does and not a fraction later each hour.
 * Nothing else on these pages re-renders on a timer, so without this the
 * ring would sit on whichever slot was current when the page was opened.
 *
 * `times` is the distinct slot times in schedule order.
 */
export default function useCurrentSlot(times) {
    const [slot, setSlot] = useState(() => currentSlotTime(times));

    useEffect(() => {
        let timer;

        const tick = () => {
            setSlot(currentSlotTime(times));
            timer = setTimeout(tick, untilNextMinute());
        };

        timer = setTimeout(tick, untilNextMinute());

        // A sleeping laptop stops timers, and a tab in the background may
        // have them throttled to minutes — so re-check on the way back in
        // rather than trusting the one that was pending.
        const resync = () => {
            if (document.visibilityState !== "visible") return;
            clearTimeout(timer);
            setSlot(currentSlotTime(times));
            timer = setTimeout(tick, untilNextMinute());
        };

        document.addEventListener("visibilitychange", resync);
        return () => {
            clearTimeout(timer);
            document.removeEventListener("visibilitychange", resync);
        };
    }, [times]);

    return slot;
}
