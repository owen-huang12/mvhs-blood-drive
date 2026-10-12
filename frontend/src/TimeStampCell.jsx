import { useEffect, useRef, useState } from "react";
import TimePicker from "./TimePicker.jsx";
import { formatStamp, fromTimeInput, toTimeInput } from "./dayOf.js";

/**
 * One day-of time: a field you type into, with a clock that stamps now.
 *
 * The field is always there, filled or empty, so the column reads the same
 * down its whole length and a volunteer who already knows the time can just
 * write it. It carries no placeholder: the column header already names the
 * field, and three repeated words per row only crowd the table. The clock
 * beside it is the one-tap path — it stamps the current time on an empty
 * cell and opens the picker on a filled one.
 *
 * `locked` means the clerk has already filed this student's attendance. Both
 * controls stay live so `onLocked` can explain why nothing happened — a dead
 * control would leave the desk guessing.
 */
export default function TimeStampCell({
    value,
    label,
    locked,
    // Identifies this cell to the drag-selection, and marks it when it is
    // part of one. Both come from the table, which owns the selection.
    cellId,
    selected = false,
    // Spreadsheet-style selection: the cell reports clicks and pointer
    // entries, and carries the drag handle when it is the block's corner.
    hasHandle = false,
    onSelect,
    onFocusCell,
    onCommitAndMove,
    onExtendFrom,
    onExtendTo,
    onStamp,
    onSet,
    onLocked,
}) {
    // Where the picker opens, or null when it is closed. Anchored to the
    // click like the capacity panel, rather than centred as a dialog.
    const [anchor, setAnchor] = useState(null);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const inputRef = useRef(null);

    useEffect(() => {
        if (editing) inputRef.current?.select();
    }, [editing]);

    const openPicker = (event) => {
        if (locked) {
            onLocked();
            return;
        }
        setAnchor({ x: event.clientX, y: event.clientY });
    };

    /** Clock: stamp the server's clock when empty, correct it when not. */
    const handleClock = (event) => {
        if (locked) {
            onLocked();
            return;
        }
        if (value) openPicker(event);
        else onStamp();
    };

    const commitEdit = () => {
        setEditing(false);
        // An emptied field clears the stamp; anything unparseable is dropped
        // rather than written, so a half-typed time can't land in the record.
        if (draft.trim() === "") {
            if (value) onSet(null);
            return;
        }
        const next = fromTimeInput(draft, value);
        if (next && next !== value) onSet(next);
    };

    return (
        <td
            className="stamp-cell"
            // No styling hangs off this: the block is shown by the outline
            // drawn over it. Kept as a marker so the selected cells can be
            // found in the DOM, which is how the outline measures itself.
            data-selected={selected || undefined}
            data-cell={cellId}
            // Selecting is a click on the cell, never on its controls: the
            // field and the clock are how a single time is edited.
            onMouseDown={(event) => {
                // Clicking a control inside the cell does not start a drag,
                // but it does move the selection here: typing into one cell
                // while a block elsewhere is still outlined would make the
                // next Delete clear something the desk is no longer
                // looking at.
                if (event.target.closest("input, button")) {
                    onFocusCell?.();
                    return;
                }
                onSelect?.(event.shiftKey);
            }}
            onPointerEnter={() => onExtendTo?.()}
        >
            <span className="stamp-filled">
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    className={`stamp-input${locked ? " is-locked" : ""}`}
                    data-cell-input={cellId}
                    aria-label={`${label} time`}
                    // Shows the draft while being typed and the saved time
                    // otherwise, so an outside update lands in the cell
                    // without overwriting what someone is mid-way through.
                    value={editing ? draft : formatStamp(value)}
                    readOnly={locked}
                    title={locked ? "Attendance already filed" : undefined}
                    onMouseDown={(event) => {
                        if (!locked) return;
                        // Explain instead of focusing a field she cannot use.
                        event.preventDefault();
                        onLocked();
                    }}
                    onFocus={() => {
                        if (locked) return;
                        setDraft(toTimeInput(value));
                        setEditing(true);
                    }}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            // Blur commits through onBlur; the move happens
                            // after, so the saved value is the one left
                            // behind in the cell.
                            event.target.blur();
                            onCommitAndMove?.();
                        }
                        if (event.key === "Escape") {
                            // Abandons the draft without writing it; the
                            // cell stays selected, so Escape again is what
                            // dismisses the block.
                            setEditing(false);
                            event.target.blur();
                            event.stopPropagation();
                        }
                    }}
                />
                <button
                    type="button"
                    className="stamp-clock"
                    aria-label={
                        value ? `Change ${label} time` : `Stamp ${label} now`
                    }
                    title={
                        locked
                            ? "Attendance already filed"
                            : value
                              ? "Pick a time"
                              : "Stamp the current time"
                    }
                    onClick={handleClock}
                >
                    <ClockIcon />
                </button>
            </span>

            {/* Drag to extend the block, the way a spreadsheet does. */}
            {hasHandle && (
                <span
                    className="cell-handle"
                    onPointerDown={onExtendFrom}
                    aria-hidden="true"
                />
            )}

            {anchor && (
                <TimePicker
                    anchor={anchor}
                    value={value}
                    label={label}
                    onSave={(next) => {
                        setAnchor(null);
                        if (next !== value) onSet(next);
                    }}
                    onClear={() => {
                        setAnchor(null);
                        onSet(null);
                    }}
                    onClose={() => setAnchor(null)}
                />
            )}
        </td>
    );
}

/** Inherits currentColor so it dims with the button it sits in. */
function ClockIcon() {
    return (
        <svg
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
        >
            <circle cx="8" cy="8" r="6.25" />
            <path d="M8 4.5V8l2.25 1.5" strokeLinecap="round" />
        </svg>
    );
}
