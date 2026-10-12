import { useCallback, useEffect, useRef, useState } from "react";

/** A cell's identity as a string, so selections can live in a Set. */
export const cellKey = (id, field) => `${id}:${field}`;

/** "12:time_in" -> { id: 12, field: "time_in" } */
export const parseCellKey = (key) => {
    const at = key.indexOf(":");
    return { id: Number(key.slice(0, at)), field: key.slice(at + 1) };
};

/**
 * Select a block of time cells the way a spreadsheet does.
 *
 * Clicking a cell anchors the selection there; dragging the handle on its
 * corner extends it to cover a rectangle of rows and columns. Shift-clicking
 * another cell extends to it in one step.
 *
 * Deliberately not a free drag over the table: the cells hold controls the
 * desk clicks constantly, and a drag that begins anywhere would swallow
 * those clicks. Starting from the handle keeps both.
 *
 * The block is computed from the grid — the rows and columns between the
 * anchor and the focus — rather than from what a rectangle happens to
 * touch, so it never half-covers a row.
 *
 * `rows` is the visible order of row ids, `columns` the field names in
 * their displayed order; both are needed to turn two corners into a block.
 */
export default function useCellSelection({ rows, columns }) {
    // The cell a selection starts from, and the one it currently reaches.
    const [anchor, setAnchor] = useState(null);
    const [focus, setFocus] = useState(null);
    // True while the handle is being dragged.
    const dragging = useRef(false);
    // Where the block was when it was last dismissed, so the keyboard can
    // pick up from there.
    const lastCell = useRef(null);
    // The live focus, readable inside the state updater in clearSelection.
    const focusRef = useRef(null);

    /**
     * Dismiss the block, remembering where it was.
     *
     * The next arrow press resumes from that cell rather than jumping back
     * to the top of the table — dismissing a selection by accident should
     * cost one keystroke to recover, not a scroll back to where you were.
     */
    const clearSelection = useCallback(() => {
        setAnchor((current) => {
            if (current) lastCell.current = focusRef.current ?? current;
            return null;
        });
        setFocus(null);
    }, []);

    useEffect(() => {
        focusRef.current = focus;
    }, [focus]);

    /** Every cell in the block between the two corners. */
    const selected = (() => {
        if (!anchor) return new Set();
        const end = focus ?? anchor;
        const r1 = rows.indexOf(anchor.id);
        const r2 = rows.indexOf(end.id);
        const c1 = columns.indexOf(anchor.field);
        const c2 = columns.indexOf(end.field);
        if (r1 === -1 || r2 === -1 || c1 === -1 || c2 === -1) return new Set();

        const keys = new Set();
        for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r += 1) {
            for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c += 1) {
                keys.add(cellKey(rows[r], columns[c]));
            }
        }
        return keys;
    })();

    /**
     * Press on a cell: anchor there, or extend to it when shift is held.
     *
     * The press also begins a drag, so moving across the table from here
     * extends the block — the way selecting a range in a spreadsheet
     * works, without having to find the handle first.
     */
    const selectCell = useCallback((id, field, extend = false) => {
        if (extend) {
            setFocus({ id, field });
            setAnchor((current) => current ?? { id, field });
        } else {
            setAnchor({ id, field });
            setFocus({ id, field });
        }
        dragging.current = true;
    }, []);

    /**
     * Collapse the selection onto one cell, without starting a drag.
     *
     * For a click on a control inside a cell: the block follows the desk to
     * where they are working, so Delete never applies to somewhere they
     * have left behind.
     */
    const focusCell = useCallback((id, field) => {
        setAnchor({ id, field });
        setFocus({ id, field });
    }, []);

    /**
     * Move the selection one cell in a direction, the way a spreadsheet
     * does: plain arrows move it, shift-arrows stretch it.
     *
     * Moving walks from the focus — the end that was last moved — so
     * holding shift and changing direction shrinks the block again rather
     * than only ever growing it.
     *
     * Stops at the edges instead of wrapping: a selection that jumped from
     * the last column of one row to the first of the next would be a
     * surprise when the desk is tabbing along a single person's times.
     */
    const moveFocus = useCallback(
        (rowStep, columnStep, extend = false) => {
            if (rows.length === 0 || columns.length === 0) return;

            // Nothing selected: carry on from where the last block was
            // dismissed, so the arrow moves rather than only re-selecting
            // the cell it was left on. The very first press starts at the
            // top-left, which is the only time there is nowhere to resume.
            const remembered = lastCell.current;
            const from =
                focus ??
                anchor ??
                (remembered && rows.includes(remembered.id)
                    ? remembered
                    : { id: rows[0], field: columns[0] });

            const r = rows.indexOf(from.id);
            const c = columns.indexOf(from.field);
            if (r === -1 || c === -1) return;

            const clamp = (value, max) => Math.min(Math.max(value, 0), max);
            const next = {
                id: rows[clamp(r + rowStep, rows.length - 1)],
                field: columns[clamp(c + columnStep, columns.length - 1)],
            };
            // Without shift the block collapses to the cell moved to.
            if (!extend) setAnchor(next);
            setFocus(next);
        },
        [rows, columns, anchor, focus],
    );

    /**
     * Put the selection on the cell below a given one.
     *
     * For committing a typed time with Enter: calling `focusCell` and then
     * `moveFocus` would not work, because the second reads the focus from
     * the render it was created in and would still see the old cell.
     */
    const moveDownFrom = useCallback(
        (id, field) => {
            const r = rows.indexOf(id);
            const c = columns.indexOf(field);
            if (r === -1 || c === -1) return;
            const next = {
                id: rows[Math.min(r + 1, rows.length - 1)],
                field: columns[c],
            };
            setAnchor(next);
            setFocus(next);
        },
        [rows, columns],
    );

    /** The handle on the block's corner: another way into the same drag,
        and the one that works when the block is already where it should
        start. */
    const startExtend = useCallback((event) => {
        event.preventDefault();
        event.stopPropagation();
        dragging.current = true;
    }, []);

    /** Called as the pointer passes over a cell. */
    const extendTo = useCallback((id, field) => {
        if (!dragging.current) return;
        setFocus({ id, field });
    }, []);

    useEffect(() => {
        const stop = () => {
            dragging.current = false;
        };
        window.addEventListener("pointerup", stop);
        window.addEventListener("blur", stop);
        return () => {
            window.removeEventListener("pointerup", stop);
            window.removeEventListener("blur", stop);
        };
    }, []);

    // The cell the handle hangs off: the far corner of the block.
    const handleCell = (() => {
        if (!anchor) return null;
        const end = focus ?? anchor;
        const r = Math.max(rows.indexOf(anchor.id), rows.indexOf(end.id));
        const c = Math.max(
            columns.indexOf(anchor.field),
            columns.indexOf(end.field),
        );
        if (r === -1 || c === -1) return null;
        return cellKey(rows[r], columns[c]);
    })();

    return {
        selected,
        handleCell,
        clearSelection,
        selectCell,
        focusCell,
        moveFocus,
        moveDownFrom,
        startExtend,
        extendTo,
    };
}
