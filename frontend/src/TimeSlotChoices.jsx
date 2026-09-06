import {
    CHOICE_LABELS,
    REQUIRED_CHOICES,
    TIME_SLOTS,
    colorsForPeriod,
    formatSlot,
} from "./timeSlots.js";

/**
 * The ranked time-slot table shared by every sign-up form.
 *
 * `selected` is an ordered list of slot keys: click order is preference order,
 * so the first click is the 1st choice. Clicking a chosen slot again removes
 * it, and clicks past REQUIRED_CHOICES are ignored rather than replacing an
 * earlier pick — silently dropping someone's 1st choice would be worse than
 * making them deselect first.
 */
export default function TimeSlotChoices({ selected, onChange }) {
    const toggle = (slotKey) => {
        if (selected.includes(slotKey)) {
            onChange(selected.filter((k) => k !== slotKey));
            return;
        }
        if (selected.length >= REQUIRED_CHOICES) return;
        onChange([...selected, slotKey]);
    };

    return (
        <>
            <p className="form-prompt">
                Please select exactly {REQUIRED_CHOICES} of your preferred time
                slots, in order of preference. The order you click them in sets
                your 1st, 2nd, and 3rd choice.
            </p>

            <table className="timeslot-table">
                <thead>
                    <tr>
                        <th>Period</th>
                        <th>Time slot</th>
                        <th className="timeslot-choice-col">Your choice</th>
                    </tr>
                </thead>
                <tbody>
                    {TIME_SLOTS.map((slot) => {
                        const slotKey = formatSlot(slot);
                        const rank = selected.indexOf(slotKey);
                        const isSelected = rank !== -1;
                        const colors = colorsForPeriod(slot.period);
                        const select = () => toggle(slotKey);

                        return (
                            <tr
                                key={slotKey}
                                className={`timeslot-row${isSelected ? " selected" : ""}`}
                                role="button"
                                aria-pressed={isSelected}
                                tabIndex={0}
                                onClick={select}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        select();
                                    }
                                }}
                            >
                                <td>
                                    <span
                                        className="timeslot-period"
                                        style={{
                                            backgroundColor: colors.bg,
                                            color: colors.text,
                                        }}
                                    >
                                        {slot.period}
                                    </span>
                                </td>
                                <td className="timeslot-time">{slot.time}</td>
                                <td className="timeslot-choice-col">
                                    {isSelected && (
                                        <span className="timeslot-rank">
                                            {CHOICE_LABELS[rank]}
                                        </span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </>
    );
}
