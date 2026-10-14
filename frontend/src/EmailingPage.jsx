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
    sendReminderToOne,
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
                {mailing.ran_at
                    ? `sent automatically ${formatOpens(mailing.ran_at)}`
                    : `${mailing.open_now ? "open since" : "opens"} ${formatOpens(mailing.send_at)}`}
                .
                {/* The automatic send happens once. Anyone due after it has
                    become due since — confirmed late, or moved to another
                    time, so the reminder they have is now wrong — and is
                    sent only when a coordinator chooses to. */}
                {mailing.ran_at && mailing.pending > 0 && (
                    <>
                        {" "}
                        <span className="mailing-waiting">
                            {mailing.pending}{" "}
                            {mailing.pending === 1 ? "person has" : "people have"}{" "}
                            changed since and{" "}
                            {mailing.pending === 1 ? "needs" : "need"} sending.
                        </span>
                    </>
                )}
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

/**
 * One mailing's cell for one person: when it went, or a way to send it.
 *
 * A row that has never had this mailing, or holds one for an appointment
 * time that has since changed, gets a button rather than a dash — the thing
 * to do about it is right there, instead of having to work out who is
 * covered by the bulk send.
 */
function SentCell({ row, mailing, onSend, sending }) {
    const applies = !mailing?.students_only || row.participant_type === "student";
    if (!applies) {
        return (
            <td className="sent-cell">
                <span className="not-applicable" title="Not applicable" />
            </td>
        );
    }

    const kind = mailing.kind;
    const sentAt = kind === "day_of" ? row.day_of_sent_at : row.two_day_sent_at;
    const error = kind === "day_of" ? row.day_of_error : row.two_day_error;

    if (error) {
        return (
            <td className="sent-cell">
                <button
                    type="button"
                    className="resend-btn is-failed"
                    title={`${error} — click to try again`}
                    disabled={sending}
                    onClick={() => onSend(row, mailing)}
                >
                    {sending ? "Sending…" : "Retry"}
                </button>
            </td>
        );
    }

    // Sent for the time they still hold: nothing to do.
    if (sentAt && row.time_slot === (kind === "day_of" ? row.day_of_slot : row.two_day_slot)) {
        return <td className="sent-cell">{formatSent(sentAt)}</td>;
    }

    // Sent, but for a time that has since changed — or never sent at all.
    return (
        <td className="sent-cell">
            <button
                type="button"
                className="resend-btn"
                disabled={!mailing.open_now || sending}
                title={
                    mailing.open_now
                        ? sentAt
                            ? "Their appointment time changed since this was sent"
                            : "Not sent yet"
                        : "This mailing has not opened yet"
                }
                onClick={() => onSend(row, mailing)}
            >
                {sending ? "Sending…" : sentAt ? "Resend" : "Send"}
            </button>
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
    // The one row being sent to, as "kind:id", so only its button waits.
    const [sendingRow, setSendingRow] = useState("");
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

    const sendOne = async ({ row, mailing }) => {
        const key = `${mailing.kind}:${row.id}`;
        setSendingRow(key);
        try {
            await sendReminderToOne(mailing.kind, row.id);
            setResult({ label: `${mailing.label} to ${row.full_name}`, sent: 1, failed: 0 });
            setError("");
            await load();
        } catch (err) {
            setError(
                err.status === 409 || err.status === 502
                    ? err.message
                    : "Could not send that email. Please try again.",
            );
        } finally {
            setSendingRow("");
            setConfirming(null);
        }
    };

    const dayOf = status?.mailings.find((m) => m.kind === "day_of");
    const twoDay = status?.mailings.find((m) => m.kind === "two_day");

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
                                                        row={row}
                                                        mailing={twoDay}
                                                        onSend={(r, m) =>
                                                            setConfirming({
                                                                row: r,
                                                                mailing: m,
                                                            })
                                                        }
                                                        sending={
                                                            sendingRow ===
                                                            `two_day:${row.id}`
                                                        }
                                                    />
                                                    {/* The day-of slip is a
                                                        student's excusal from
                                                        class, so adults have
                                                        none to receive. */}
                                                    <SentCell
                                                        row={row}
                                                        mailing={dayOf}
                                                        onSend={(r, m) =>
                                                            setConfirming({
                                                                row: r,
                                                                mailing: m,
                                                            })
                                                        }
                                                        sending={
                                                            sendingRow ===
                                                            `day_of:${row.id}`
                                                        }
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
                // Either a whole mailing or a single row, told apart by
                // whether a row came with it.
                <Modal
                    title={
                        confirming.row
                            ? `Send to ${confirming.row.full_name}?`
                            : `Send the ${confirming.label.toLowerCase()}?`
                    }
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
                                onClick={() =>
                                    confirming.row
                                        ? sendOne(confirming)
                                        : send(confirming)
                                }
                                disabled={Boolean(sending || sendingRow)}
                            >
                                {confirming.row
                                    ? "Send"
                                    : `Send ${confirming.pending}`}
                            </button>
                        </>
                    }
                >
                    {confirming.row ? (
                        <>
                            <p>
                                This emails the{" "}
                                {confirming.mailing.label.toLowerCase()} to{" "}
                                <strong>{confirming.row.full_name}</strong> at{" "}
                                {confirming.row.email_address}, for their
                                appointment at{" "}
                                <strong>
                                    {parseSlot(confirming.row.time_slot).time}
                                </strong>
                                .
                            </p>
                            <p className="modal-note">
                                {confirming.row.two_day_sent_at ||
                                confirming.row.day_of_sent_at
                                    ? "They were sent an earlier copy for a different time. "
                                    : ""}
                                It cannot be unsent.
                            </p>
                        </>
                    ) : (
                        <>
                            <p>
                                This emails {confirming.pending}{" "}
                                {confirming.students_only
                                    ? "students"
                                    : "donors"}{" "}
                                who have not had it yet. Nobody who has already
                                been emailed is sent another.
                            </p>
                            <p className="modal-note">
                                It cannot be unsent.
                                {confirming.kind === "day_of" &&
                                    " This one is their excusal slip from class."}
                                {dayOf && confirming.kind === "two_day"
                                    ? " Students under 17 also receive the parent consent form."
                                    : ""}
                            </p>
                        </>
                    )}
                </Modal>
            )}
        </div>
    );
}
