import ExternalLinkIcon from "./ExternalLinkIcon.jsx";

// Stanford Blood Center's eligibility page, which the lists below are taken
// from. Check it again if SBC changes its rules.
const ELIGIBILITY_URL =
    "https://stanfordbloodcenter.org/donate-blood/am-i-eligible-to-donate-blood/";

const SHARED_REQUIREMENTS = [
    "Be free of cold and flu symptoms (allergies and most medications are fine)",
    "Eat before donating and drink plenty of fluids",
    "Bring a physical photo ID",
];

const STUDENT_REQUIREMENTS = [
    "Be at least 17 years old, or 16 with a signed parent or guardian consent form (see below)",
    ...SHARED_REQUIREMENTS,
];

// Teachers and community members: SBC's rules for donors 19 and older. The
// age and consent rules and the 18-and-under weight chart don't apply; the
// adult weight rule is a flat minimum instead.
const ADULT_REQUIREMENTS = [
    "Weigh at least 110 pounds",
    ...SHARED_REQUIREMENTS,
];

/** Opens Stanford Blood Center's full eligibility page in a new tab. */
export function EligibilityLink() {
    return (
        <a
            className="consent-form-link"
            href={ELIGIBILITY_URL}
            target="_blank"
            rel="noreferrer"
        >
            Additional Eligibility Requirements
            {ExternalLinkIcon}
        </a>
    );
}

/**
 * Who can donate, from Stanford Blood Center's own requirements, ending in
 * the required "I am eligible" checkbox.
 *
 * `adult` swaps the student-specific rules (consent form, the weight chart
 * for donors 18 and younger) for the adult ones.
 */
export default function EligibilityRequirements({ adult = false, eligible, onEligibleChange }) {
    const requirements = adult ? ADULT_REQUIREMENTS : STUDENT_REQUIREMENTS;

    return (
        <div className="eligibility">
            <p className="form-prompt">
                Before you sign up, check that you meet Stanford Blood Center's
                requirements. To donate, you must:
            </p>
            <ul className="eligibility-list">
                {requirements.map((item) => (
                    <li key={item}>{item}</li>
                ))}
            </ul>

            {!adult && (
                <p className="form-prompt">
                    <strong>
                        Donors 18 and younger also need to meet a minimum weight
                        for their height (see Additional Eligibility Requirements).
                    </strong>
                </p>
            )}

            <EligibilityLink />

            <label className="consent-check eligibility-check">
                <input
                    type="checkbox"
                    checked={eligible}
                    onChange={(e) => onEligibleChange(e.target.checked)}
                    required
                />
                I am eligible for the blood drive.
            </label>
        </div>
    );
}
