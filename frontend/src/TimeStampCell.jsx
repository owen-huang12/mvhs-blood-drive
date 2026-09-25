import { useEffect, useRef, useState } from "react";
import TimePicker from "./TimePicker.jsx";
import { formatStamp, fromTimeInput, toTimeInput } from "./dayOf.js";

/**
 * One day-of time: tap to stamp, then correct it two ways.
 *
 * Empty cells show a button so the common path at the desk is a single tap.
 * Once stamped, the clock opens the picker and double-clicking the time types
 * it directly — a volunteer who already knows the time shouldn't have to go
 * through a panel to enter it.
 *
 * `locked` means the clerk has already filed this student's attendance. Both
 * routes stay clickable so `onLocked` can explain why nothing happened — a
 * dead control would leave the desk guessing.
 */
export default function TimeStampCell({
    value,
    label,
    busy,
    locked,
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

    const openEditor = () => {
        if (locked) {
            onLocked();
            return;
        }
        setDraft(toTimeInput(value));
        setEditing(true);
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

    if (editing) {
        return (
            <td className="stamp-cell">
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    className="stamp-input"
                    aria-label={`${label} time`}
                    value={draft}
                    disabled={busy}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") commitEdit();
                        if (event.key === "Escape") setEditing(false);
                    }}
                />
            </td>
        );
    }

    return (
        <td className="stamp-cell">
            {value ? (
                <span className="stamp-filled">
                    {/* Double-click, so a stray single click on a dense table
                        never puts a filed time into an editor by accident. */}
                    <span
                        className={`stamp-text${locked ? " is-locked" : ""}`}
                        onDoubleClick={openEditor}
                        title={
                            locked
                                ? "Attendance already filed"
                                : "Double-click to type a time"
                        }
                    >
                        {formatStamp(value)}
                    </span>
                    <button
                        type="button"
                        className="stamp-clock"
                        disabled={busy}
                        aria-label={`Change ${label} time`}
                        title={
                            locked ? "Attendance already filed" : "Pick a time"
                        }
                        onClick={openPicker}
                    >
                        <ClockIcon />
                    </button>
                </span>
            ) : (
                <button
                    type="button"
                    className="stamp-btn"
                    disabled={busy}
                    title={locked ? "Attendance already filed" : `Stamp ${label}`}
                    onClick={() => (locked ? onLocked() : onStamp())}
                >
                    {label}
                </button>
            )}

            {anchor && (
                <TimePicker
                    anchor={anchor}
                    value={value}
                    label={label}
                    busy={busy}
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
