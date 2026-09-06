import CollapsibleSection from "./CollapsibleSection.jsx";

/**
 * What each non-student role should know before filling out their form.
 *
 * Placeholder copy — the real wording is being written by the rest of the
 * team. Replace the strings; nothing else needs to change.
 */
const ROLE_NOTES = {
    teacher: `Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque
        faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi
        pretium tellus duis convallis. Tempus leo eu aenean sed diam urna
        tempor.`,
    community: `Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque
        faucibus ex sapien vitae pellentesque sem placerat. In id cursus mi
        pretium tellus duis convallis. Tempus leo eu aenean sed diam urna
        tempor.`,
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
                    Lorem ipsum dolor sit amet consectetur adipiscing elit.
                    Quisque faucibus ex sapien vitae pellentesque sem placerat.
                    In id cursus mi pretium tellus duis convallis. Tempus leo eu
                    aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus
                    nec metus bibendum egestas. Iaculis massa nisl malesuada
                    lacinia integer nunc posuere.
                </p>
                <p>
                    Lorem ipsum dolor sit amet consectetur adipiscing elit.
                    Quisque faucibus ex sapien vitae pellentesque sem placerat.
                    In id cursus mi pretium tellus duis convallis. Tempus leo eu
                    aenean sed diam urna tempor.
                </p>
                {note && <p className="overview-role-note">{note}</p>}
            </div>
        </CollapsibleSection>
    );
}
