import CollapsibleSection from "./CollapsibleSection.jsx";

/**
 * What each non-student role should know before filling out their form.
 *
 * Placeholder copy — the real wording is being written by the rest of the
 * team. Replace the strings; nothing else needs to change.
 */
const ROLE_NOTES = {
    teacher: `As a teacher, you will be given priority when assigned your MVHS Stanford Blood drive appointment time. We are so grateful for your support!`,
    community: `As a community member you will be given priority when assigned your MVHS Stanford Blood drive appointment time. Truly, we are so grateful for your support!`,
};

/**
 * The "what is this drive" blurb shown above every sign-up form, regardless
 * of participant type. Kept in one place so the three forms can't drift.
 *
 * `role` adds a note telling a teacher or community member how their form
 * differs from the student one; omitted (or "student") shows none.
 */
export default function BloodDriveOverview({ role }) {
    const note = ROLE_NOTES[role];

    return (
        <CollapsibleSection title="Overview of the Stanford Blood Drive">
            <div className="overview-text">
                <p>
                    When you arrive at the MVHS Stanford Blood Drive, you’ll first check in at the entrance 
                    and complete the necessary forms, including the medical background questionnaire and 
                    parental consent form (if needed). You’ll then be taken back for a health history 
                    screening, where Stanford Blood Center staff will review your information and determine 
                    whether you are eligible to donate. If you are eligible, you’ll be seated in a donor
                    chair, and your blood will be collected. After donating, you’ll rest for about 15 
                    minutes with refreshments and snacks to ensure you’re feeling well. 
                    Once you are cleared to go, you’ll check out and be on your way!
                </p>
                {note && <p className="overview-role-note">{note}</p>}
            </div>
        </CollapsibleSection>
    );
}
