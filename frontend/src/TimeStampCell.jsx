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
        <td className="stamp-cell">
            <span className="stamp-filled">
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    className={`stamp-input${locked ? " is-locked" : ""}`}
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
                        if (event.key === "Enter") event.target.blur();
                        if (event.key === "Escape") {
                            setEditing(false);
                            event.target.blur();
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
