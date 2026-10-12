import { useCallback, useEffect, useLayoutEffect, useState } from "react";

/**
 * The outline around the slot being served, drawn as one box over the table.
 *
 * Built from the rows' measured positions rather than from cell borders.
 * Borders came apart wherever the pieces met: each cell paints its own under
 * `border-collapse: separate`, so corners doubled, the column dividers
 * chopped the horizontal runs into segments, and the table's rounded
 * `overflow: hidden` clipped whatever reached the last row. One absolutely
 * positioned element has none of those seams — it is a single rectangle,
 * the same width the whole way round, sitting above the cells.
 *
 * `rowSelector` finds the slot's rows inside `scrollRef`, and
 * `startSelector` the cell its left edge lines up with — the time column,
 * since the period label spans several slots and ringing it would enclose
 * rows belonging to other times. The box is re-measured whenever the rows
 * change and whenever the table resizes.
 */
export default function SlotRing({
    scrollRef,
    rowSelector,
    startSelector,
    deps = [],
}) {
    const [box, setBox] = useState(null);

    const measure = useCallback(() => {
        const scroll = scrollRef.current;
        if (!scroll || !rowSelector) {
            setBox(null);
            return;
        }

        const rows = scroll.querySelectorAll(rowSelector);
        if (rows.length === 0) {
            setBox(null);
            return;
        }

        // Relative to the scrolling box, and to its scrolled content rather
        // than its viewport, so the ring stays on the slot when the table is
        // scrolled sideways.
        const base = scroll.getBoundingClientRect();
        const first = rows[0].getBoundingClientRect();
        const last = rows[rows.length - 1].getBoundingClientRect();

        // Starts at the time column, not the table's edge: the period label
        // spans several slots, so enclosing it would ring rows that are not
        // in this one. Falls back to the full width if that cell is missing.
        const anchor = rows[0].querySelector(startSelector);
        const anchorLeft = anchor
            ? anchor.getBoundingClientRect().left - base.left + scroll.scrollLeft
            : scroll.scrollLeft;

        setBox({
            top: first.top - base.top + scroll.scrollTop,
            left: anchorLeft,
            width: scroll.scrollWidth - anchorLeft,
            height: last.bottom - first.top,
        });
    }, [scrollRef, rowSelector, startSelector]);

    // Layout effect: measuring after paint would show the ring a frame
    // behind the rows it is drawn around.
    useLayoutEffect(() => {
        measure();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [measure, ...deps]);

    useEffect(() => {
        const scroll = scrollRef.current;
        if (!scroll) return;

        const observer = new ResizeObserver(measure);
        observer.observe(scroll);
        // A font loading or a column resizing moves the rows under the ring.
        const table = scroll.querySelector("table");
        if (table) observer.observe(table);

        scroll.addEventListener("scroll", measure);
        window.addEventListener("resize", measure);
        return () => {
            observer.disconnect();
            scroll.removeEventListener("scroll", measure);
            window.removeEventListener("resize", measure);
        };
    }, [scrollRef, measure]);

    if (!box) return null;

    return (
        <div
            className="slot-ring"
            style={{
                top: `${box.top}px`,
                left: `${box.left}px`,
                width: `${box.width}px`,
                height: `${box.height}px`,
            }}
        >
            {/* Names what the outline means. Read out rather than hidden:
                for anyone not seeing the ring, this is the only thing
                saying which slot is being served. */}
            <span className="slot-ring-tag">now</span>
        </div>
    );
}
