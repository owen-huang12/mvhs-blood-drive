import { CONTACT_EMAIL } from "./contact.js";

/** "Can't make it?" line for the end of a sign-up, with the shared inbox. */
export default function ContactNote() {
    return (
        <p className="form-prompt">
            Can't make your appointment, need to reschedule, or found out you
            can't donate? Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
    );
}
