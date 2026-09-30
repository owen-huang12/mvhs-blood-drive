import ExternalLinkIcon from "./ExternalLinkIcon.jsx";

// Stanford Blood Center's eligibility page, which the lists below are taken
// from. Check it again if SBC changes its rules.
const ELIGIBILITY_URL =
    "https://stanfordbloodcenter.org/donate-blood/am-i-eligible-to-donate-blood/";

const GENERAL_REQUIREMENTS = [
    "Be at least 17 years old, or 16 with a signed parent or guardian consent form",
    "Be free of cold and flu symptoms (allergies and most medications are fine)",
    "Eat before donating and drink plenty of fluids",
    "Bring a photo ID",
    "Complete a medical history questionnaire with Stanford Blood Center staff",
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

/** Who can donate, from Stanford Blood Center's own requirements. */
export default function EligibilityRequirements() {
    return (
        <div className="eligibility">
            <p className="form-prompt">
                Before you sign up, check that you meet Stanford Blood Center's
                requirements. To donate, you must:
            </p>
            <ul className="eligibility-list">
                {GENERAL_REQUIREMENTS.map((item) => (
                    <li key={item}>{item}</li>
                ))}
            </ul>

            <p className="form-prompt">
                <strong>
                    Donors 18 and younger also need to meet a minimum weight
                    for their height (see Additional Eligibility Requirements).
                </strong>
            </p>

            <EligibilityLink />
        </div>
    );
}
