/** Box with an arrow out of it: the link opens in a new tab. */
const ExternalLinkIcon = (
    <svg
        className="external-link-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d="M14 4h6v6" />
        <path d="M20 4 10 14" />
        <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
);

export default ExternalLinkIcon;
