import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError, signUpStudent } from "./api.js";

/** Donors under this age have to bring a signed parent consent form. */
const CONSENT_REQUIRED_UNDER = 18;

// TODO: point this at the real parent consent form once it exists.
const PARENT_CONSENT_FORM_URL = "#";

/**
 * Final step of the student sign-up: review, agree, confirm.
 *
 * The form page navigates here without saving anything — the POST happens on
 * Confirm below, so an under-18 donor has acknowledged the parent consent form
 * before a record exists.
 */
export default function CompletedStudentForm() {
    const signUp = useLocation().state?.signUp;
    const navigate = useNavigate();

    const [agreed, setAgreed] = useState(false);
    const [registered, setRegistered] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    // Reached without going through the form (direct URL, cleared history):
    // there is nothing to confirm, so send them back to sign up.
    if (!signUp) {
        return <Navigate to="/signup" replace />;
    }

    const needsConsentForm = signUp.age < CONSENT_REQUIRED_UNDER;
    const canConfirm = !submitting && (!needsConsentForm || agreed);

    async function handleConfirm() {
        setError("");
        setSubmitting(true);
        try {
            await signUpStudent(signUp);
            setRegistered(true);
        } catch (err) {
            setError(
                err instanceof ApiError
                    ? err.message
                    : "Something went wrong submitting your registration. Please try again."
            );
        } finally {
            setSubmitting(false);
        }
    }

    if (registered) {
        return (
            <main className="page">
                <section>
                    <h1 className="section-title">You're registered</h1>
                    <div className="section-body">
                        <p className="form-prompt">
                            Thanks for signing up for the Stanford Blood Drive.
                            We'll send your assigned donation time slot to{" "}
                            <strong>{signUp.email_address}</strong> by 8/12 at
                            2:30 PM.
                        </p>
                        <Link to="/" className="submit-btn">
                            Back to home
                        </Link>
                    </div>
                </section>
            </main>
        );
    }

    return (
        <main className="page">
            <section>
                <h1 className="section-title">Confirm your registration</h1>
                <div className="section-body">
                    <p className="form-prompt">
                        Once you confirm, we'll send your assigned donation time
                        slot to <strong>{signUp.email_address}</strong> by 8/12
                        at 2:30 PM.
                    </p>

                    {needsConsentForm && (
                        <div className="consent-block">
                            <p className="consent-prompt">
                                Please agree to the following:
                            </p>

                            <label className="consent-check">
                                <input
                                    type="checkbox"
                                    checked={agreed}
                                    onChange={(e) => setAgreed(e.target.checked)}
                                />
                                I will complete the parent consent form. I will
                                bring it to my scheduled appointment.
                            </label>

                            <a
                                className="consent-form-link"
                                href={PARENT_CONSENT_FORM_URL}
                                target="_blank"
                                rel="noreferrer"
                            >
                                Open the parent consent form
                            </a>
                        </div>
                    )}

                    {error && <p className="login-error">{error}</p>}

                    <div className="confirm-actions">
                        <button
                            type="button"
                            className="submit-btn"
                            onClick={handleConfirm}
                            disabled={!canConfirm}
                            title={
                                needsConsentForm && !agreed
                                    ? "Please agree to the parent consent form first"
                                    : undefined
                            }
                        >
                            {submitting ? "Confirming…" : "Confirm"}
                        </button>
                        <button
                            type="button"
                            className="login-link-btn"
                            onClick={() =>
                                navigate("/signup", { state: { signUp } })
                            }
                        >
                            Go back and edit
                        </button>
                    </div>
                </div>
            </section>
        </main>
    );
}
