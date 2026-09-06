/**
 * The three kinds of person who can sign up, and how each is labelled and
 * coloured wherever they appear on the dashboard.
 *
 * Mirrors PARTICIPANT_TYPES in backend/main.py.
 */

const STUDENT = {
    label: "Student",
    bg: "#E3F0FA",
    text: "#3E7793",
};

const TEACHER = {
    label: "Teacher",
    bg: "#DDEAD9",
    text: "#42703C",
};

const COMMUNITY = {
    label: "Community Member",
    bg: "#F3E8FA",
    text: "#7B5AA6",
};

export const PARTICIPANTS = {
    student: STUDENT,
    teacher: TEACHER,
    community: COMMUNITY,
};

/**
 * Presentation for a sign-up's participant type.
 *
 * Falls back to `is_student` for any row written before participant_type
 * existed, so an un-migrated row still renders with a sensible label.
 */
export function participantOf(signUp) {
    const type =
        signUp.participant_type ?? (signUp.is_student ? "student" : "teacher");
    return PARTICIPANTS[type] ?? TEACHER;
}

/** Only students carry a student ID, an age and a grade. */
export const isStudent = (signUp) =>
    (signUp.participant_type ?? (signUp.is_student ? "student" : "teacher")) ===
    "student";
