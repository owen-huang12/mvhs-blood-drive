/** Mirrored by HOW_HEAR_OPTIONS in backend/main.py. */
const HOW_HEAR_OPTIONS = [
    "Friends and family",
    "Mountain View advertisement",
    "Teacher or class announcement",
    "School email or newsletter",
    "Social media",
    "Participated in a previous blood drive",
    "Other",
];

/** "How did you hear about the blood drive?", as a required dropdown. */
export default function HowHearField({ value, onChange }) {
    return (
        <div className="form-field">
            <label htmlFor="howHear">
                How did you hear about the blood drive?{" "}
                <span className="required">*</span>
            </label>
            <select
                id="howHear"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                required
            >
                <option value="" disabled>
                    Choose one
                </option>
                {HOW_HEAR_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
        </div>
    );
}
