import ExternalLinkIcon from "./ExternalLinkIcon.jsx";

// Stanford Blood Center's form, served from frontend/public/.
const CONSENT_FORMS = [
    { label: "Parent Consent Form (English)", href: "/05-FX1-Consent-for-Minor-to-Donate-Blood-Eng.pdf", className: "is-english" },
    { label: "Formulario de consentimiento (Español)", href: "/05-FX1S-Consent-for-Minor-to-Donate-Blood-Sp.pdf", className: "is-spanish" },
];

/** The English and Spanish consent form PDFs, side by side. */
export default function ConsentFormLinks() {
    return (
        <div className="consent-form-links">
            {CONSENT_FORMS.map(({ label, href, className }) => (
                <a
                    key={href}
                    className={`consent-form-link${className ? ` ${className}` : ""}`}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                >
                    {label}
                    {ExternalLinkIcon}
                </a>
            ))}
        </div>
    );
}
