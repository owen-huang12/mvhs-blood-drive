import { CHOICE_LABELS, colorsForPeriod, parseSlot } from "./timeSlots.js";

const EMPTY_CLASS = { teacher: "", room: "" };

/**
 * The class a student would miss at each time they picked: one card per
 * chosen slot, in choice order, with the teacher and room number. Shown under
 * the time-slot table once at least one slot is chosen.
 *
 * `classes` maps slot key to `{ teacher, room }`, so the answers stay with the
 * slot when the choices are reordered or one is deselected.
 */
export default function ChoiceClassFields({ selected, classes, onChange }) {
    if (selected.length === 0) return null;

    const update = (slotKey, field, value) =>
        onChange({
            ...classes,
            [slotKey]: { ...(classes[slotKey] ?? EMPTY_CLASS), [field]: value },
        });

    return (
        <div className="choice-classes">
            <p className="form-prompt">
                For each time you picked, enter the teacher and room number of
                the class you'd be missing.
                <br />
                <strong>(Example: Marie Clarke, 301)</strong>
            </p>

            <div className="choice-class-card">
                {selected.map((slotKey, rank) => {
                    const { period, time } = parseSlot(slotKey);
                    const colors = colorsForPeriod(period);
                    const value = classes[slotKey] ?? EMPTY_CLASS;
                    const id = `choice-class-${rank}`;

                    return (
                        <div className="choice-class-row" key={slotKey}>
                            <div className="choice-class-slot">
                                <span className="timeslot-rank">
                                    {CHOICE_LABELS[rank]}
                                </span>
                                <span
                                    className="timeslot-period"
                                    style={{
                                        backgroundColor: colors.bg,
                                        color: colors.text,
                                    }}
                                >
                                    {period}
                                </span>
                                <span className="timeslot-time">{time}</span>
                            </div>

                            <div className="choice-class-inputs">
                                <div className="form-field">
                                    <label htmlFor={`${id}-teacher`}>
                                        Teacher <span className="required">*</span>
                                    </label>
                                    <input
                                        id={`${id}-teacher`}
                                        value={value.teacher}
                                        onChange={(e) =>
                                            update(slotKey, "teacher", e.target.value)
                                        }
                                        maxLength={50}
                                        required
                                    />
                                </div>
                                <div className="form-field">
                                    <label htmlFor={`${id}-room`}>
                                        Room number <span className="required">*</span>
                                    </label>
                                    <input
                                        id={`${id}-room`}
                                        value={value.room}
                                        onChange={(e) =>
                                            update(slotKey, "room", e.target.value)
                                        }
                                        maxLength={20}
                                        required
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
