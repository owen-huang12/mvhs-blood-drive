import { useEffect, useRef, useState } from "react";
import { animate } from "animejs";
import {
    TIME_SLOTS,
    colorsForPeriod,
    formatSlot,
    parseSlot,
} from "./timeSlots.js";

const CHOICE_LABELS = ["1st", "2nd", "3rd"];

const displaySlot = (value) => {
    const { period, time } = parseSlot(value);
    return time ? `${period}: ${time}` : period;
};

/** A slot pill. Full slots render shaded and inert — no hover, no click. */
function SlotPill({ value, full, selected, onPick }) {
    const colors = colorsForPeriod(parseSlot(value).period);

    return (
        <button
            type="button"
            className={`slot-pill${full ? " is-full" : ""}${
                selected ? " is-selected" : ""
            }`}
            style={
                full
                    ? undefined
                    : { backgroundColor: colors.bg, color: colors.text }
            }
            disabled={full}
            onClick={() => onPick(value)}
            title={full ? `${displaySlot(value)} — full` : displaySlot(value)}
        >
            {displaySlot(value)}
        </button>
    );
}

export default function SlotPicker({
    choices,
    value,
    onChange,
    isFull,
    autoAssigned,
    disabled,
}) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);
    const panelRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;

        const onPointerDown = (e) => {
            if (!wrapRef.current?.contains(e.target)) setOpen(false);
        };
        const onKeyDown = (e) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    useEffect(() => {
        if (!open || !panelRef.current) return;
        animate(panelRef.current, {
            opacity: [0, 1],
            translateY: [-6, 0],
            scale: [0.97, 1],
            duration: 180,
            ease: "outQuad",
        });
    }, [open]);

    const pick = (slot) => {
        onChange(slot);
        setOpen(false);
    };

    const colors = value ? colorsForPeriod(parseSlot(value).period) : null;

    return (
        <div className="slot-picker" ref={wrapRef}>
            <button
                type="button"
                className={`slot-trigger${value ? " has-value" : " is-empty"}`}
                style={
                    colors
                        ? { backgroundColor: colors.bg, color: colors.text }
                        : undefined
                }
                onClick={() => setOpen((prev) => !prev)}
                disabled={disabled}
                aria-haspopup="dialog"
                aria-expanded={open}
            >
                {value ? displaySlot(value) : "Assign Time"}
            </button>

            {open && (
                <div className="slot-panel" ref={panelRef} role="dialog">
                    <div className="slot-panel-section">
                        {choices.map((choice, index) => (
                            <div
                                className="slot-choice-row"
                                key={`${choice}-${index}`}
                            >
                                <span className="slot-choice-label">
                                    {CHOICE_LABELS[index]}:
                                </span>
                                <SlotPill
                                    value={choice}
                                    full={isFull(choice)}
                                    selected={choice === value}
                                    onPick={pick}
                                />
                            </div>
                        ))}
                    </div>

                    {autoAssigned && (
                        <p className="slot-panel-note">
                            All three choices are full — defaulting to the
                            earliest opening.
                        </p>
                    )}

                    <div className="slot-panel-divider" />

                    <p className="slot-panel-heading">Assign any time</p>
                    <div className="slot-panel-all">
                        {TIME_SLOTS.map((slot) => {
                            const key = formatSlot(slot);
                            return (
                                <SlotPill
                                    key={key}
                                    value={key}
                                    full={isFull(key)}
                                    selected={key === value}
                                    onPick={pick}
                                />
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
