import { useCallback, useEffect, useState } from "react";
import Header from "./Header.jsx";
import ProfilePill from "./ProfilePill.jsx";
import Modal from "./Modal.jsx";
import Spinner from "./Spinner.jsx";
import { participantOf } from "./participants.js";
import { parseSlot } from "./timeSlots.js";
import {
    getCurrentCoordinator,
    getEmailingStatus,
    sendReminders,
} from "./api.js";
import { DEFAULT_COORDINATOR_COLOR } from "./dayOf.js";

/** A sent time as a coordinator reads it. */
const formatSent = (value) =>
    value
        ? new Date(value).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
          })
        : "";

/** When a mailing opens, spelled out. */
const formatOpens = (value) =>
    new Date(value).toLocaleString([], {
        weekday: "short",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });

/**
 * One mailing: how far it has got, and the button that sends the rest.
 *
 * Laid out like the other sections on the dashboard — a heading with its
 * counts beside it — rather than as a card, since this page is read the
 * same way as the rest of them.
 */
function Mailing({ mailing, onSend, sending }) {
    const done = mailing.pending === 0;
    return (
        <div className="mailing">
            <h3 className="dash-heading">
                {mailing.label}:
                <span className="count-badge green">{mailing.sent} sent</span>
                {mailing.pending > 0 && (
                    <span className="count-badge grey">
                        {mailing.pending} to send
                    </span>
                )}
                {mailing.failed > 0 && (
                    <span className="count-badge amber">
                        {mailing.failed} failed
                    </span>
                )}
            </h3>

            <p className="mailing-note">
                {mailing.total} {mailing.students_only ? "students" : "donors"},{" "}
                {mailing.open_now ? "open since" : "opens"}{" "}
                {formatOpens(mailing.send_at)}.
            </p>

            <button
                type="button"
                className="emailing-send"
                disabled={!mailing.open_now || done || sending}
                onClick={() => onSend(mailing)}
            >
                {sending
                    ? "Sending…"
                    : done
                      ? "All sent"
                      : !mailing.open_now
                        ? "Not open yet"
                        : `Send ${mailing.pending}`}
            </button>
        </div>
    );
}

/** One mailing's cell in the table: when it went, or why it didn't. */
function SentCell({ sentAt, error, applies }) {
    if (!applies) {
        return (
            <td className="sent-cell">
                <span className="not-applicable" title="Not applicable" />
            </td>
        );
    }
    if (error) {
        return (
            <td className="sent-cell">
                <span className="emailing-error" title={error}>
                    failed
                </span>
            </td>
        );
    }
    return (
        <td className="sent-cell">
            {sentAt ? formatSent(sentAt) : <span className="sent-pending">—</span>}
        </td>
    );
}

/**
 * What the drive has emailed, and the controls that send the rest.
 *
 * Exists because "did the reminders actually go out?" should be answerable
 * without reading server logs. The table is the record: one row per
 * confirmed donor, when each mailing reached them, and why it failed if it
 * did — which is the list to chase by hand.
 *
 * The buttons run the same guarded path the scheduler does, so they can be
 * pressed freely: anyone already emailed is skipped rather than mailed
 * again.
 */
export default function EmailingPage() {
    const [status, setStatus] = useState(null);
    const [name, setName] = useState("");
    const [color, setColor] = useState(DEFAULT_COORDINATOR_COLOR);
    const [error, setError] = useState("");
    const [confirming, setConfirming] = useState(null);
    const [sending, setSending] = useState("");
    const [result, setResult] = useState(null);

    const load = useCallback(async () => {
        try {
            setStatus(await getEmailingStatus());
            setError("");
        } catch {
            setError("Could not load the emailing status.");
        }
    }, []);

    // Loaded once, then re-read on a timer: sends take a while, and a
    // coordinator elsewhere may have pressed a button.
    useEffect(() => {
        (async () => {
            await load();
        })();
        const timer = setInterval(load, 15000);
        return () => clearInterval(timer);
    }, [load]);

    // Only for the header pill; a failure leaves it on its fallback.
    useEffect(() => {
        let cancelled = false;
        getCurrentCoordinator()
            .then((me) => {
                if (cancelled) return;
                setName(me.full_name);
                if (me.color) setColor(me.color);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    const send = async (mailing) => {
        setSending(mailing.kind);
        try {
            const counts = await sendReminders(mailing.kind);
            setResult({ label: mailing.label, ...counts });
            setError("");
            await load();
        } catch (err) {
            setError(
                err.status === 409
                    ? err.message
                    : "Could not send that mailing. Please try again.",
            );
        } finally {
            setSending("");
            setConfirming(null);
        }
    };

    const dayOf = status?.mailings.find((m) => m.kind === "day_of");

    return (
        <div className="dashboard-page">
            <Header>
                <ProfilePill name={name} color={color} />
            </Header>

            <main className="dashboard-content">
                <h2 className="dashboard-section-title">Emailing</h2>

                <div className="dashboard-body">
                    {error && <p className="login-error">{error}</p>}

                    {!status ? (
                        <Spinner label="Loading emailing status…" />
                    ) : (
                        <section className="dash-section">
                            <p className="emailing-intro">
                                Mailings for the drive on{" "}
                                <strong>{status.drive_date}</strong>. Each one
                                sends itself at its hour; these buttons are only
                                needed if it hasn't.
                            </p>

                            <div className="mailings">
                                {status.mailings.map((mailing) => (
                                    <Mailing
                                        key={mailing.kind}
                                        mailing={mailing}
                                        sending={sending === mailing.kind}
                                        onSend={setConfirming}
                                    />
                                ))}
                            </div>

                            {result && (
                                <p className="emailing-result">
                                    {result.label}: sent {result.sent}
                                    {result.failed > 0 &&
                                        `, ${result.failed} failed`}
                                    .
                                </p>
                            )}

                            <div className="table-scroll">
                                <table className="appointment-table emailing-table">
                                    <thead>
                                        <tr>
                                            <th>Full Name</th>
                                            <th>Email</th>
                                            <th className="status-cell">Status</th>
                                            <th className="time-col">App. Time</th>
                                            <th className="sent-cell">
                                                Two-day sent
                                            </th>
                                            <th className="sent-cell">
                                                Day-of sent
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {status.rows.map((row) => {
                                            const person = participantOf(row);
                                            const slot = parseSlot(row.time_slot);
                                            const student =
                                                row.participant_type === "student";
                                            return (
                                                <tr
                                                    key={row.id}
                                                    className={
                                                        row.two_day_error ||
                                                        row.day_of_error
                                                            ? "row-needs-filing"
                                                            : ""
                                                    }
                                                >
                                                    <td className="name-cell">
                                                        {row.full_name}
                                                    </td>
                                                    <td
                                                        className="appointment-email"
                                                        title={row.email_address}
                                                    >
                                                        {row.email_address}
                                                    </td>
                                                    <td
                                                        className="status-cell"
                                                        style={{
                                                            backgroundColor:
                                                                person.bg,
                                                            color: person.text,
                                                        }}
                                                    >
                                                        {person.label}
                                                    </td>
                                                    <td className="appointment-time time-col">
                                                        {slot.time}
                                                    </td>
                                                    <SentCell
                                                        sentAt={row.two_day_sent_at}
                                                        error={row.two_day_error}
                                                        applies
                                                    />
                                                    {/* The day-of slip is a
                                                        student's excusal from
                                                        class, so adults have
                                                        none to receive. */}
                                                    <SentCell
                                                        sentAt={row.day_of_sent_at}
                                                        error={row.day_of_error}
                                                        applies={student}
                                                    />
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}
                </div>
            </main>

            {confirming && (
                <Modal
                    title={`Send the ${confirming.label.toLowerCase()}?`}
                    onClose={() => setConfirming(null)}
                    actions={
                        <>
                            <button
                                type="button"
                                className="modal-btn"
                                onClick={() => setConfirming(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="modal-btn primary"
                                onClick={() => send(confirming)}
                                disabled={Boolean(sending)}
                            >
                                Send {confirming.pending}
                            </button>
                        </>
                    }
                >
                    <p>
                        This emails {confirming.pending}{" "}
                        {confirming.students_only ? "students" : "donors"} who
                        have not had it yet. Nobody who has already been emailed
                        is sent another.
                    </p>
                    <p className="modal-note">
                        It cannot be unsent.
                        {confirming.kind === "day_of" &&
                            " This one is their excusal slip from class."}
                        {dayOf && confirming.kind === "two_day"
                            ? " Students under 17 also receive the parent consent form."
                            : ""}
                    </p>
                </Modal>
            )}
        </div>
    );
}
