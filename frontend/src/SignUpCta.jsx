import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { animate } from "animejs";

const ROUTES = [
    { to: "/signup/student", label: "I'm a student" },
    { to: "/signup/teacher", label: "I'm a teacher" },
    { to: "/signup/community-member", label: "I'm a community member" },
];

/**
 * Grace period between the pointer leaving and the panel closing.
 *
 * The pill and the panel are separate boxes with a gap between them, so
 * without this the panel would snap shut the moment the pointer crossed that
 * gap on its way to a link.
 */
const CLOSE_DELAY_MS = 260;

/**
 * The floating "Sign up" pill, which opens into the three participant routes
 * on hover.
 *
 * Hover alone can't be the only way in — it does not exist on touch, and it
 * is awkward for keyboard users — so the pill is also a button that toggles
 * on click/Enter, and focus anywhere inside keeps the panel open.
 */
export default function SignUpCta() {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);
    const panelRef = useRef(null);
    const closeTimer = useRef(null);

    const cancelClose = () => {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
    };

    const openNow = () => {
        cancelClose();
        setOpen(true);
    };

    const closeSoon = () => {
        cancelClose();
        closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
    };

    useEffect(() => cancelClose, []);

    useEffect(() => {
        if (!open) return undefined;

        const onKeyDown = (e) => {
            if (e.key === "Escape") setOpen(false);
        };
        // Tapping elsewhere dismisses it, which is the only way out on a
        // touch screen — there is no pointer to move away.
        const onPointerDown = (e) => {
            if (!wrapRef.current?.contains(e.target)) setOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("mousedown", onPointerDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("mousedown", onPointerDown);
        };
    }, [open]);

    useEffect(() => {
        const panel = panelRef.current;
        if (!open || !panel) return;

        animate(panel, {
            opacity: [0, 1],
            translateY: [10, 0],
            scale: [0.94, 1],
            duration: 260,
            ease: "out(3)",
        });

        // Staggered so the options read as a list unfolding rather than one
        // block appearing — the same easing family as the panel itself.
        animate(panel.querySelectorAll(".signup-cta-option"), {
            opacity: [0, 1],
            translateY: [8, 0],
            duration: 240,
            delay: (_, i) => 60 + i * 55,
            ease: "out(3)",
        });
    }, [open]);

    return (
        <div
            className="signup-cta-wrap"
            ref={wrapRef}
            onMouseEnter={openNow}
            onMouseLeave={closeSoon}
            // Focus moving inside keeps it open; leaving for anything outside
            // the wrapper closes it.
            onFocus={openNow}
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) closeSoon();
            }}
        >
            {open && (
                <div className="signup-cta-panel" ref={panelRef} role="menu">
                    {ROUTES.map((route) => (
                        <Link
                            key={route.to}
                            to={route.to}
                            className="signup-cta-option"
                            role="menuitem"
                        >
                            {route.label}
                        </Link>
                    ))}
                </div>
            )}

            <button
                type="button"
                className={`signup-cta${open ? " is-open" : ""}`}
                onClick={() => (open ? setOpen(false) : openNow())}
                aria-haspopup="menu"
                aria-expanded={open}
            >
                <span className="cta-arrow" aria-hidden="true">
                    &#8594;
                </span>
                <span>
                    Sign up for the
                    <br />
                    10/16 blood drive
                </span>
            </button>
        </div>
    );
}
