import { useEffect, useRef } from "react";
import { animate } from "animejs";

/**
 * Themed dialog: coral title bar over an alabaster body, matching the
 * section headers elsewhere in the app.
 *
 * `actions` renders in the footer; the last one should be the primary.
 */
export default function Modal({ title, children, actions, onClose }) {
    const cardRef = useRef(null);
    const overlayRef = useRef(null);

    useEffect(() => {
        animate(overlayRef.current, { opacity: [0, 1], duration: 160, ease: "outQuad" });
        animate(cardRef.current, {
            opacity: [0, 1],
            scale: [0.94, 1],
            translateY: [-8, 0],
            duration: 260,
            ease: "outBack",
        });
    }, []);

    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    return (
        <div
            className="modal-overlay"
            ref={overlayRef}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="modal-card"
                ref={cardRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
            >
                <h2 className="modal-title">{title}</h2>
                <div className="modal-body">{children}</div>
                <div className="modal-actions">{actions}</div>
            </div>
        </div>
    );
}
