import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "./Modal.jsx";
import { clearToken, isClerk } from "./auth.js";
import { DEFAULT_COORDINATOR_COLOR } from "./dayOf.js";

/** "Marie Clarke" -> "MC". Two letters is all the avatar has room for. */
const initialsOf = (name) =>
    name
        .split(" ")
        .map((word) => word[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

/**
 * Who is signed in, and the way out — the header's left-hand side on every
 * dashboard.
 *
 * Signing out returns to whichever sign-in this account uses: the clerk has
 * her own username form, and sending her to the coordinators' email login
 * would be a dead end.
 */
export default function ProfilePill({ name, color = DEFAULT_COORDINATOR_COLOR }) {
    const [confirming, setConfirming] = useState(false);
    const navigate = useNavigate();

    // Falls back while /me is still in flight, so the pill doesn't flicker
    // in from an empty avatar on every load.
    const label = name || (isClerk() ? "Attendance" : "Coordinator");

    const signOut = () => {
        clearToken();
        navigate(isClerk() ? "/coordinators/attendance/sign-in" : "/coordinators");
    };

    return (
        <>
            <button
                className="profile-pill"
                onClick={() => setConfirming(true)}
                title="Sign out"
            >
                {/* Their own marker colour, the same one their selection
                    is drawn in, so the two are recognisably one person. */}
                <span
                    className="profile-avatar"
                    style={{ backgroundColor: color }}
                >
                    {initialsOf(label)}
                </span>
                <span className="profile-name">{label}</span>
            </button>

            {confirming && (
                <Modal title="Sign out" onClose={() => setConfirming(false)}
                    actions={
                        <>
                            <button
                                type="button"
                                className="modal-btn"
                                onClick={() => setConfirming(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="modal-btn primary"
                                onClick={signOut}
                            >
                                Sign out
                            </button>
                        </>
                    }
                >
                    <p>You'll need to sign in again to get back in.</p>
                </Modal>
            )}
        </>
    );
}
