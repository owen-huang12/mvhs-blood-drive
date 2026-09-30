import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate } from "animejs";
import { SlotPill } from "./SlotPicker.jsx";
import { SHORT_CHOICE_LABELS } from "./timeSlots.js";

/** Kept clear of the viewport edge so the panel never opens half off-screen. */
const VIEWPORT_MARGIN = 12;
// The arrow's tip sits on the click point; the panel hangs off it by this much.
const ARROW_SIZE = 8;
// How far in from the panel's edge the arrow sits, and how close to a corner
// it may get once the panel has been pushed back inside the viewport.
const ARROW_INSET = 20;
const ARROW_MIN = 14;

/**
 * Right-click menu on a booked row: move the person to one of the three
 * times they asked for.
 *
 * Opens with a small arrow pointing at exactly where the click landed. It
 * hangs below the point, or above it when there isn't room below.
 */
export default function PreferredSlotMenu({ signUp, anchor, isFull, onPick, onClose }) {
    const panelRef = useRef(null);
    const [placement, setPlacement] = useState(null);

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

    // Placed before paint, so it never shows a frame at the wrong spot.
    useLayoutEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;

        const { width, height } = panel.getBoundingClientRect();
        const below = anchor.y + ARROW_SIZE + height + VIEWPORT_MARGIN <= window.innerHeight;
        const top = below ? anchor.y + ARROW_SIZE : anchor.y - ARROW_SIZE - height;
        const left = Math.max(
            VIEWPORT_MARGIN,
            Math.min(anchor.x - ARROW_INSET, window.innerWidth - width - VIEWPORT_MARGIN),
        );
        // The panel may have shifted to stay on screen; the arrow moves the
        // other way so it still points at the click.
        const arrowX = Math.max(ARROW_MIN, Math.min(anchor.x - left, width - ARROW_MIN));
        setPlacement({ top, left, arrowX, below });

        animate(panel, {
            opacity: [0, 1],
            translateY: below ? [-4, 0] : [4, 0],
            duration: 160,
            ease: "outQuad",
        });
    }, [anchor.x, anchor.y]);

    const choices = [signUp.first_choice, signUp.second_choice, signUp.third_choice];

    const pick = (slot) => {
        onClose();
        if (slot !== signUp.time_slot) onPick(signUp.id, slot);
    };

    return (
        <div
            className={`preferred-panel${placement?.below === false ? " is-above" : ""}`}
            ref={panelRef}
            role="dialog"
            aria-label={`Switch ${signUp.full_name} to a preferred slot`}
            style={
                placement
                    ? {
                          top: placement.top,
                          left: placement.left,
                          "--arrow-x": `${placement.arrowX}px`,
                      }
                    : { visibility: "hidden" }
            }
        >
            <span className="preferred-panel-arrow" aria-hidden="true" />
            <p className="slot-panel-heading">Switch to preferred slot</p>
            <div className="slot-panel-section">
                {choices.map((choice, index) => (
                    <div className="slot-choice-row" key={`${choice}-${index}`}>
                        <span className="slot-choice-label">{SHORT_CHOICE_LABELS[index]}:</span>
                        <SlotPill
                            value={choice}
                            // Their current slot is never "full" for them.
                            full={choice !== signUp.time_slot && isFull(choice)}
                            selected={choice === signUp.time_slot}
                            onPick={pick}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
