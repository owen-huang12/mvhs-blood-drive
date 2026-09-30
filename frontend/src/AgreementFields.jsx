import { CONTACT_EMAIL } from "./contact.js";
import { useFullNameCheck } from "./fullName.js";

/**
 * What a donor agrees to, and the signature that agrees to it.
 *
 * `student` adds the part about missing class, which doesn't apply to
 * teachers or community members.
 */
export default function AgreementFields({ student = false, signature, onSignatureChange }) {
    const signatureRef = useFullNameCheck(signature);

    return (
        <>
            {student && (
                <p className="form-prompt">
                    You are responsible for telling your teacher that you'll be
                    out of class for your donation appointment.{" "}
                    <strong>
                        Your appointment confirmation email is your official
                        permission slip to be excused from class.
                    </strong>
                </p>
            )}
            <p className="form-prompt agreement-intro">
                By signing your name, you agree to:
            </p>
            <ul className="eligibility-list">
                <li>Arrive at your appointment on time.</li>
                <li>
                    Tell us if you can't make your appointment or need to
                    reschedule, by emailing{" "}
                    <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
                </li>
            </ul>
            <div className="form-field">
                <label htmlFor="signature">
                    Sign your first and last name <span className="required">*</span>
                </label>
                <input
                    ref={signatureRef}
                    id="signature"
                    value={signature}
                    onChange={(e) => onSignatureChange(e.target.value)}
                    maxLength={50}
                    autoComplete="off"
                    required
                />
            </div>
        </>
    );
}
