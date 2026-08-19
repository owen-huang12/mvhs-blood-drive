import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "./Header.jsx";
import Modal from "./Modal.jsx";
import Spinner from "./Spinner.jsx";
import PendingSignUps from "./PendingSignUps.jsx";
import AppointmentTable from "./AppointmentTable.jsx";
import { clearToken } from "./auth.js";
import { capacityFor, firstOpenSlot, isSlotFull } from "./timeSlots.js";
import {
    confirmSignUp,
    getCurrentCoordinator,
    listSignUps,
    moveSignUp,
    unconfirmSignUp,
} from "./api.js";

/** How long the "slot is full" popup stays up before dismissing itself. */
const SLOT_FULL_POPUP_MS = 400;

const initialsOf = (name) =>
    name
        .split(" ")
        .map((word) => word[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

export default function CoordinatorDashboard() {
    const [name, setName] = useState("");
    const [signUps, setSignUps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState(null);
    const [slotFullMessage, setSlotFullMessage] = useState("");
    const [confirmingSignOut, setConfirmingSignOut] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const [coordinator, rows] = await Promise.allSettled([
                getCurrentCoordinator(),
                listSignUps(),
            ]);
            if (cancelled) return;

            if (coordinator.status === "fulfilled") {
                setName(coordinator.value.full_name);
            }
            if (rows.status === "fulfilled") {
                setSignUps(rows.value);
            } else {
                setError(
                    "Could not load sign-ups. Check that the server is running.",
                );
            }
            setLoading(false);
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    /** Swap the updated row in place so the table doesn't refetch and jump. */
    const applyUpdate = (updated) =>
        setSignUps((prev) =>
            prev.map((signUp) => (signUp.id === updated.id ? updated : signUp)),
        );

    /**
     * Only performs the request. The row animates itself out and then calls
     * `applyUpdate`, so committing here would delete it mid-animation.
     */
    const handleConfirm = async (id, timeSlot) => {
        try {
            const updated = await confirmSignUp(id, timeSlot);
            setError("");
            return updated;
        } catch (err) {
            // A full slot is a conflict, not a failure — show it as a popup
            // and leave the row in place so another slot can be picked.
            if (err.status === 409) {
                setError("");
                setSlotFullMessage(err.message);
            } else {
                setError("Could not confirm that sign-up. Please try again.");
            }
            throw err;
        }
    };

    const handleOverride = async (id, timeSlot) => {
        try {
            const updated = await moveSignUp(id, timeSlot);
            setError("");
            return updated;
        } catch (err) {
            if (err.status === 409) {
                setError("");
                setSlotFullMessage(err.message);
            } else {
                setError("Could not assign that time slot. Please try again.");
            }
            throw err;
        }
    };

    /** Optimistic: the row follows the cursor immediately, reverting on failure. */
    const handleMove = async (id, timeSlot) => {
        const previous = signUps;
        setSignUps((rows) =>
            rows.map((row) =>
                row.id === id ? { ...row, time_slot: timeSlot } : row,
            ),
        );

        try {
            applyUpdate(await moveSignUp(id, timeSlot));
            setError("");
        } catch (err) {
            setSignUps(previous);
            // 409 means the server rejected it as full — show that as a dialog
            // rather than an inline error, since the drag visibly snaps back.
            if (err.status === 409) setSlotFullMessage(err.message);
            else setError("Could not move that appointment. Please try again.");
        }
    };

    const handleUnconfirm = async (id) => {
        setBusyId(id);
        try {
            applyUpdate(await unconfirmSignUp(id));
            setError("");
        } catch {
            setError("Could not move that sign-up back to pending.");
        } finally {
            setBusyId(null);
        }
    };

    const handleSignOut = () => {
        clearToken();
        navigate("/coordinators");
    };

    const handleSlotFull = (slotKey) => {
        const capacity = capacityFor(slotKey);
        setSlotFullMessage(
            `${slotKey} is full (${capacity} ${
                capacity === 1 ? "appointment" : "appointments"
            } maximum).`,
        );
    };

    const pending = signUps.filter((signUp) => !signUp.confirmed);
    const confirmed = signUps.filter((signUp) => signUp.confirmed);

    return (
        <div className="dashboard-page">
            <Header>
                <button
                    className="profile-pill"
                    onClick={() => setConfirmingSignOut(true)}
                    title="Sign out"
                >
                    <span className="profile-avatar">{initialsOf(name)}</span>
                    <span className="profile-name">{name}</span>
                </button>
            </Header>

            <main className="dashboard-content">
                <h2 className="dashboard-section-title">
                    Coordinator Dashboard
                </h2>

                <div className="dashboard-body">
                    {error && <p className="login-error">{error}</p>}

                    {loading ? (
                        <Spinner label="Loading sign-ups…" />
                    ) : (
                        <>
                            <PendingSignUps
                                signUps={pending}
                                onConfirm={handleConfirm}
                                onOverride={handleOverride}
                                onCommit={applyUpdate}
                                isSlotFull={(key) => isSlotFull(confirmed, key)}
                                earliestOpen={firstOpenSlot(confirmed)}
                            />
                            <AppointmentTable
                                signUps={confirmed}
                                onUnconfirm={handleUnconfirm}
                                onMove={handleMove}
                                onSlotFull={handleSlotFull}
                                busyId={busyId}
                            />
                        </>
                    )}
                </div>
            </main>

            {slotFullMessage && (
                <Modal
                    title="Slot is full"
                    onClose={() => setSlotFullMessage("")}
                    autoCloseMs={SLOT_FULL_POPUP_MS}
                >
                    <p>{slotFullMessage}</p>
                </Modal>
            )}

            {confirmingSignOut && (
                <Modal
                    title="Sign out"
                    onClose={() => setConfirmingSignOut(false)}
                    actions={
                        <>
                            <button
                                type="button"
                                className="modal-btn"
                                onClick={() => setConfirmingSignOut(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="modal-btn primary"
                                onClick={handleSignOut}
                            >
                                Sign out
                            </button>
                        </>
                    }
                >
                    <p>Sign out of the coordinator dashboard?</p>
                    <p className="modal-note">
                        You'll need to sign in again to manage appointments.
                    </p>
                </Modal>
            )}
        </div>
    );
}
