import { useCallback, useEffect, useRef } from "react";

/**
 * Re-measure an overlay whenever the table under it moves.
 *
 * Zoom is the awkward one: it changes every length on the page, and the
 * events arrive in a burst while the browser is still reflowing — measured
 * at the wrong moment, an overlay lands on where the cells used to be.
 *
 * So measurements are deferred to the next animation frame, after layout
 * has settled, and a burst collapses into one. Everything else that moves
 * the table — scrolling, a column resizing, a font loading — goes through
 * the same path.
 */
export default function useOverlayMeasure(scrollRef, measure) {
    // Held in a ref so a changing measure() never rebuilds the observers.
    const measureRef = useRef(measure);
    useEffect(() => {
        measureRef.current = measure;
    });

    const schedule = useCallback(() => {
        // Two frames: the first lets the browser finish the reflow that
        // prompted this, the second measures what it settled on. One frame
        // is enough in most engines but not while zooming in Safari.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => measureRef.current());
        });
    }, []);

    useEffect(() => {
        const scroll = scrollRef.current;
        if (!scroll) return;

        const observer = new ResizeObserver(schedule);
        observer.observe(scroll);
        const table = scroll.querySelector("table");
        if (table) observer.observe(table);

        // Scrolling moves the content under a fixed overlay, and zoom
        // fires resize in most browsers; visualViewport catches the
        // pinch-zoom and browser-zoom cases that do not.
        scroll.addEventListener("scroll", schedule, { passive: true });
        window.addEventListener("resize", schedule);
        window.visualViewport?.addEventListener("resize", schedule);
        window.visualViewport?.addEventListener("scroll", schedule);

        return () => {
            observer.disconnect();
            scroll.removeEventListener("scroll", schedule);
            window.removeEventListener("resize", schedule);
            window.visualViewport?.removeEventListener("resize", schedule);
            window.visualViewport?.removeEventListener("scroll", schedule);
        };
    }, [scrollRef, schedule]);
}
