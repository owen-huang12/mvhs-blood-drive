const DOTS = 8;

/** Rotating ring of dots, used while dashboard data loads. */
export default function Spinner({ label = "Loading…" }) {
    return (
        <div className="spinner-wrap" role="status" aria-live="polite">
            <div className="spinner" aria-hidden="true">
                {Array.from({ length: DOTS }, (_, i) => (
                    <span
                        key={i}
                        className="spinner-dot"
                        style={{ "--i": i, "--total": DOTS }}
                    />
                ))}
            </div>
            <p className="spinner-label">{label}</p>
        </div>
    );
}
