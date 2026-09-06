import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate } from "animejs";
import {
    baseCapacityFor,
    capacityFor,
    colorsForPeriod,
    countInSlot,
    parseSlot,
    slotsInPeriod,
} from "./timeSlots.js";

/** Kept clear of the viewport edge so the panel never opens half off-screen. */
const VIEWPORT_MARGIN = 12;

/**
 * One slot's row: its time, how many of its positions are taken, and the
 * −/+ controls.
 *
 * "−" is disabled at two floors — the slot's original capacity, and the number
 * of people already booked — each with its own reason on hover, so the limit
 * is legible before it is hit rather than only as an error afterwards.
 */
function CapacityRow({ slotKey, capacity, booked, busy, onChange }) {
    const base = baseCapacityFor(slotKey);
    const atBase = capacity <= base;
    const wouldOrphan = capacity - 1 < booked;

    const removeTitle = atBase
        ? `${slotKey} started with ${base} ${
              base === 1 ? "position" : "positions"
          } — the original ones can't be removed`
        : wouldOrphan
          ? `${booked} ${booked === 1 ? "person is" : "people are"} booked here`
          : "Remove a position";

    return (
        <div className="capacity-row">
            <span className="capacity-time">{parseSlot(slotKey).time}</span>
            <span className="capacity-count">
                {booked}/{capacity}
            </span>
            <div className="capacity-controls">
                <button
                    type="button"
                    className="capacity-btn"
                    onClick={() => onChange(slotKey, -1)}
                    disabled={busy || atBase || wouldOrphan}
                    title={removeTitle}
                    aria-label={`Remove a position from ${slotKey}`}
                >
                    −
                </button>
                <button
                    type="button"
                    className="capacity-btn"
                    onClick={() => onChange(slotKey, 1)}
                    disabled={busy}
                    title="Add a position"
                    aria-label={`Add a position to ${slotKey}`}
                >
                    +
                </button>
            </div>
        </div>
    );
}

/**
 * Right-click panel for adding and removing positions across one period.
 *
 * Anchored to the pointer like a context menu, but built from the same pills
 * and panel styling as SlotPicker so the two read as one family.
 */
export default function CapacityPicker({
    period,
    anchor,
    signUps,
    capacity,
    onChange,
    onClose,
}) {
    const panelRef = useRef(null);
    const [busySlot, setBusySlot] = useState(null);
    const [error, setError] = useState("");
    const [placed, setPlaced] = useState(false);

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

    const handleChange = async (slotKey, delta) => {
        setBusySlot(slotKey);
        setError("");
        try {
            await onChange(slotKey, delta);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusySlot(null);
        }
    };

    const slots = slotsInPeriod(period);
    const colors = colorsForPeriod(period);

    return (
        <div
            className="capacity-panel"
            ref={panelRef}
            role="dialog"
            aria-label={`Positions for ${period}`}
            // Hidden until placed, so it never flashes at the top-left corner.
            style={{ visibility: placed ? "visible" : "hidden" }}
        >
            <div
                className="capacity-panel-header"
                style={{ backgroundColor: colors.bg, color: colors.text }}
            >
                {period}
            </div>

            <div className="capacity-panel-body">
                {slots.map((slotKey) => (
                    <CapacityRow
                        key={slotKey}
                        slotKey={slotKey}
                        capacity={capacityFor(slotKey, capacity)}
                        booked={countInSlot(signUps, slotKey)}
                        busy={busySlot === slotKey}
                        onChange={handleChange}
                    />
                ))}
            </div>

            {error && <p className="capacity-error">{error}</p>}
        </div>
    );
}
