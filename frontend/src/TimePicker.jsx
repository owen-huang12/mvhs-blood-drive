import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate } from "animejs";
import { formatStamp } from "./dayOf.js";

/** Kept clear of the viewport edge so the panel never opens half off-screen. */
const VIEWPORT_MARGIN = 12;

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

/** Split a timestamp into the three parts the columns select. */
function partsOf(value) {
    const at = value ? new Date(value) : new Date();
    const hour24 = at.getHours();
    return {
        hour: hour24 % 12 || 12,
        minute: at.getMinutes(),
        meridiem: hour24 < 12 ? "AM" : "PM",
    };
}

/** Rebuild a timestamp from the selected parts, keeping the original date. */
function toStamp({ hour, minute, meridiem }, existing) {
    const at = existing ? new Date(existing) : new Date();
    const hour24 = (hour % 12) + (meridiem === "PM" ? 12 : 0);
    at.setHours(hour24, minute, 0, 0);
    return at.toISOString();
}

/** One scrolling column of choices, scrolled to keep the selection in view. */
function Column({ values, selected, format, onPick, label }) {
    const listRef = useRef(null);

    useLayoutEffect(() => {
        const active = listRef.current?.querySelector(".time-option.selected");
        // Centred rather than scrolled-to-top: the neighbouring values are
        // what make a column readable as a scale.
        active?.scrollIntoView({ block: "center" });
    }, []);

    return (
        <div className="time-column" ref={listRef} role="listbox" aria-label={label}>
            {values.map((value) => (
                <button
                    key={value}
                    type="button"
                    role="option"
                    aria-selected={value === selected}
                    className={`time-option${value === selected ? " selected" : ""}`}
                    onClick={() => onPick(value)}
                >
                    {format ? format(value) : value}
                </button>
            ))}
        </div>
    );
}

/**
 * Anchored panel for setting one day-of time.
 *
 * Replaces the browser's native time input, which cannot be styled and looks
 * nothing like the rest of the dashboard. Built from the same card, columns
 * and pills as SlotPicker and CapacityPicker so the three read as one family.
 *
 * Every change is local until "Save": a mistyped hour shouldn't write to the
 * record, and the desk should see the whole time before committing it.
 */
export default function TimePicker({
    anchor,
    value,
    label,
    busy,
    onSave,
    onClear,
    onClose,
}) {
    const panelRef = useRef(null);
    const [placed, setPlaced] = useState(false);
    const [parts, setParts] = useState(() => partsOf(value));

    useEffect(() => {
        const onPointerDown = (e) => {
            if (!panelRef.current?.contains(e.target)) onClose();
        };
        const onKeyDown = (e) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [onClose]);

    // Positioned before paint: measuring after would show the panel at the raw
    // pointer position for a frame before it snapped inside the viewport.
    useLayoutEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;

        const { width, height } = panel.getBoundingClientRect();
        const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN;
        const maxTop = window.innerHeight - height - VIEWPORT_MARGIN;

        panel.style.left = `${Math.max(VIEWPORT_MARGIN, Math.min(anchor.x, maxLeft))}px`;
        panel.style.top = `${Math.max(VIEWPORT_MARGIN, Math.min(anchor.y, maxTop))}px`;
        setPlaced(true);

        animate(panel, {
            opacity: [0, 1],
            scale: [0.97, 1],
            duration: 160,
            ease: "outQuad",
        });
    }, [anchor.x, anchor.y]);

    const preview = toStamp(parts, value);

    return (
        <div
            className="time-panel"
            ref={panelRef}
            role="dialog"
            aria-label={`Set ${label}`}
            style={{ visibility: placed ? "visible" : "hidden" }}
        >
            <div className="time-panel-header">
                <span>{label}</span>
                <span className="time-panel-preview">{formatStamp(preview)}</span>
            </div>

            <div className="time-panel-body">
                <Column
                    label="Hour"
                    values={HOURS}
                    selected={parts.hour}
                    format={(h) => String(h).padStart(2, "0")}
                    onPick={(hour) => setParts((p) => ({ ...p, hour }))}
                />
                <Column
                    label="Minute"
                    values={MINUTES}
                    selected={parts.minute}
                    format={(m) => String(m).padStart(2, "0")}
                    onPick={(minute) => setParts((p) => ({ ...p, minute }))}
                />
                <div className="time-column meridiem" role="listbox" aria-label="AM or PM">
                    {["AM", "PM"].map((meridiem) => (
                        <button
                            key={meridiem}
                            type="button"
                            role="option"
                            aria-selected={parts.meridiem === meridiem}
                            className={`time-option${
                                parts.meridiem === meridiem ? " selected" : ""
                            }`}
                            onClick={() => setParts((p) => ({ ...p, meridiem }))}
                        >
                            {meridiem}
                        </button>
                    ))}
                </div>
            </div>

            <div className="time-panel-actions">
                {/* Only offered once there is something to clear, so the
                    destructive action isn't the first thing on an empty cell. */}
                {value && (
                    <button
                        type="button"
                        className="time-action"
                        disabled={busy}
                        onClick={onClear}
                    >
                        Clear
                    </button>
                )}
                <button
                    type="button"
                    className="time-action"
                    disabled={busy}
                    onClick={() => setParts(partsOf(null))}
                    title="Set to the current time"
                >
                    Now
                </button>
                <button
                    type="button"
                    className="time-action primary"
                    disabled={busy}
                    onClick={() => onSave(preview)}
                >
                    Save
                </button>
            </div>
        </div>
    );
}
