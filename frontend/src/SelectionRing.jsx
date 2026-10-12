import { useCallback, useLayoutEffect, useState } from "react";
import useOverlayMeasure from "./useOverlayMeasure.js";

/* How close two blocks' top-right corners have to be before their tags
   would overlap and need packing side by side. Well under a cell's width,
   so two people in different columns of one row keep separate tags. */
const SAME_CORNER_PX = 8;

/* Each ring after the first is inset slightly, so two selections covering
   the same cells show as nested rectangles instead of one hiding the
   other entirely. */
const NEST_PX = 2;

/**
 * The outlines around selected blocks of cells, one per person selecting.
 *
 * Each is one box measured from the cells rather than a border on each:
 * borders land on every internal edge too, so a block of nine cells comes
 * out as a grid of nine outlines instead of one shape around the whole
 * thing. Each is drawn in its owner's marker colour.
 *
 * Where two people select overlapping blocks their name tags would land on
 * the same point and the later would simply cover the earlier, hiding the
 * fact that anyone else is there. So tags sharing a top edge are shifted
 * sideways to sit in a row, and the rings themselves are nested a couple
 * of pixels apart.
 *
 * `selections` is `[{ id, selected, label, color, isSelf }]`. The viewer's
 * own is drawn last and solid, so it is always the one on top.
 */
export default function SelectionRing({ scrollRef, selections }) {
    const [boxes, setBoxes] = useState([]);
    // Name tags, grouped by the corner they sit on.
    const [tagRows, setTagRows] = useState([]);

    const measure = useCallback(() => {
        const scroll = scrollRef.current;
        if (!scroll) {
            setBoxes([]);
            setTagRows([]);
            return;
        }

        // Relative to the scrolled content, so a ring stays on its block
        // when the table is scrolled sideways.
        const base = scroll.getBoundingClientRect();

        const measured = selections
            .map((selection) => {
                const cells = [...selection.selected]
                    .map((key) => scroll.querySelector(`[data-cell="${key}"]`))
                    .filter(Boolean);
                if (cells.length === 0) return null;

                let top = Infinity;
                let left = Infinity;
                let right = -Infinity;
                let bottom = -Infinity;
                for (const cell of cells) {
                    const r = cell.getBoundingClientRect();
                    top = Math.min(top, r.top - base.top + scroll.scrollTop);
                    left = Math.min(left, r.left - base.left + scroll.scrollLeft);
                    right = Math.max(right, r.right - base.left + scroll.scrollLeft);
                    bottom = Math.max(bottom, r.bottom - base.top + scroll.scrollTop);
                }
                return {
                    ...selection,
                    top,
                    left,
                    width: right - left,
                    height: bottom - top,
                };
            })
            .filter(Boolean);

        // Each tag belongs on its own block's top-right corner, so blocks
        // are grouped by where that corner is — not merely by sharing a
        // row. Two people selecting different columns of the same row have
        // corners far apart and get a tag each; only blocks ending at the
        // same point would collide, and those share one strip so the names
        // pack together instead of overlapping.
        const groups = new Map();
        for (const box of [...measured].sort(
            (a, b) => a.top - b.top || String(a.id).localeCompare(String(b.id)),
        )) {
            const right = box.left + box.width;
            const corner = [...groups.keys()].find(
                ([t, r]) =>
                    Math.abs(t - box.top) <= SAME_CORNER_PX &&
                    Math.abs(r - right) <= SAME_CORNER_PX,
            );
            const key = corner ?? [box.top, right];
            const peers = groups.get(key) ?? [];
            // Nested, so a ring directly under another is still visible.
            box.nest = peers.length * NEST_PX;
            peers.push(box);
            groups.set(key, peers);
        }

        // The viewer's own goes last, which paints it above the others.
        measured.sort((a, b) => Number(Boolean(a.isSelf)) - Number(Boolean(b.isSelf)));
        setBoxes(measured);
        setTagRows(
            [...groups.entries()].map(([[top, right], peers]) => ({
                key: peers.map((p) => p.id).join("|"),
                top,
                right,
                tags: peers
                    .filter((p) => p.label)
                    .map((p) => ({ id: p.id, label: p.label, color: p.color })),
            })),
        );
    }, [scrollRef, selections]);

    // Measured before paint, so a ring never lags its cells by a frame.
    useLayoutEffect(() => {
        measure();
    }, [measure]);

    useOverlayMeasure(scrollRef, measure);

    return (
        <>
            {boxes.map((box) => (
                <div
                    key={box.id}
                    className={`selection-ring${box.isSelf ? " is-self" : ""}`}
                    style={{
                        top: `${box.top - box.nest}px`,
                        left: `${box.left - box.nest}px`,
                        width: `${box.width + box.nest * 2}px`,
                        height: `${box.height + box.nest * 2}px`,
                        "--marker": box.color,
                    }}
                />
            ))}

            {/* Names sit above the line their rings share, in one run with
                no gaps: a second person joining a block adds a tag to the
                left of the first rather than overlapping it. */}
            {tagRows.map((row) => (
                <div
                    key={row.key}
                    className="selection-tags"
                    style={{ top: `${row.top}px`, left: `${row.right}px` }}
                >
                    {row.tags.map((tag) => (
                        <span
                            key={tag.id}
                            className="selection-ring-tag"
                            style={{ "--marker": tag.color }}
                        >
                            {tag.label}
                        </span>
                    ))}
                </div>
            ))}
        </>
    );
}
