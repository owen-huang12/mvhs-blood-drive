import { useCallback, useLayoutEffect, useState } from "react";
import useOverlayMeasure from "./useOverlayMeasure.js";

/* How far apart two rings' top edges can be and still be treated as the
   same line for stacking. A row is ~30px, so this catches blocks that
   start on the same row without catching the one below. */
const SAME_LINE_PX = 8;

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
    // One row of name tags per group of rings sharing a top edge.
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

        // Rings whose tops line up would each pin a tag to the same point,
        // so their tags are collected into one strip instead — laid out as
        // a row, which packs them edge to edge at whatever width they
        // actually render, rather than guessing at a fixed one.
        const groups = new Map();
        for (const box of [...measured].sort(
            (a, b) => a.top - b.top || String(a.id).localeCompare(String(b.id)),
        )) {
            const line = [...groups.keys()].find(
                (t) => Math.abs(t - box.top) <= SAME_LINE_PX,
            );
            const key = line ?? box.top;
            const peers = groups.get(key) ?? [];
            // Nested, so a ring directly under another is still visible.
            box.nest = peers.length * NEST_PX;
            peers.push(box);
            groups.set(key, peers);
        }

        // The viewer's own goes last, which paints it above the others.
        measured.sort((a, b) => Number(Boolean(a.isSelf)) - Number(Boolean(b.isSelf)));
        setBoxes(measured);
        // One strip per line, anchored to the rightmost ring sharing it.
        setTagRows(
            [...groups.values()].map((peers) => ({
                key: peers.map((p) => p.id).join("|"),
                top: Math.min(...peers.map((p) => p.top)),
                right: Math.max(...peers.map((p) => p.left + p.width)),
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
