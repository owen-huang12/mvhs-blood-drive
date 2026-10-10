import {
    CHOICE_LABELS,
    colorsForPeriod,
    isFreePeriodSlot,
    parseSlot,
} from "./timeSlots.js";

const EMPTY_CLASS = { teacher: "", room: "" };

/**
 * The class a student would miss at each time they picked: one card per
 * chosen slot, in choice order, with the teacher and room number. Shown under
 * the time-slot table once at least one slot is chosen.
 *
 * A slot that is entirely brunch or lunch misses no class, so it is shown
 * without inputs at all. Any other slot can be marked as a free period, which
 * hides its inputs the same way. Both store FREE_PERIOD_CLASS on submit, so
 * every choice still carries a teacher and room the way the backend expects.
 *
 * `classes` maps slot key to `{ teacher, room, free? }`, so the answers stay
 * with the slot when the choices are reordered or one is deselected.
 */
export default function ChoiceClassFields({ selected, classes, onChange }) {
    if (selected.length === 0) return null;

    const update = (slotKey, field, value) =>
        onChange({
            ...classes,
            [slotKey]: { ...(classes[slotKey] ?? EMPTY_CLASS), [field]: value },
        });

    // Checking the box keeps whatever was typed, so unchecking it by mistake
    // doesn't cost the student their answer.
    const setFree = (slotKey, free) =>
        onChange({
            ...classes,
            [slotKey]: { ...(classes[slotKey] ?? EMPTY_CLASS), free },
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
                    const alwaysFree = isFreePeriodSlot(slotKey);
                    const free = alwaysFree || Boolean(value.free);

                    // Sits beside "Teacher" while the inputs are shown and
                    // stands alone once they are hidden, so it holds its place
                    // as the row switches between the two.
                    const freeToggle = alwaysFree ? null : (
                        <label
                            className="choice-class-free-toggle"
                            htmlFor={`${id}-free`}
                        >
                            <input
                                id={`${id}-free`}
                                type="checkbox"
                                checked={free}
                                onChange={(e) =>
                                    setFree(slotKey, e.target.checked)
                                }
                            />
                            <span>I have a free period</span>
                        </label>
                    );

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
                                {/* With no inputs below, the toggle moves up
                                    onto this line rather than sitting alone
                                    under an otherwise empty row. */}
                                {free && freeToggle}
                            </div>

                            {free ? null : (
                                <div className="choice-class-inputs">
                                    <div className="form-field">
                                        {/* The toggle rides on this label's
                                            line, so it reads as an answer to
                                            "Teacher" rather than a new
                                            question below the inputs. */}
                                        <div className="choice-class-head">
                                            <label htmlFor={`${id}-teacher`}>
                                                Teacher{" "}
                                                <span className="required">
                                                    *
                                                </span>
                                            </label>
                                            {freeToggle}
                                        </div>
                                        <input
                                            id={`${id}-teacher`}
                                            value={value.teacher}
                                            onChange={(e) =>
                                                update(
                                                    slotKey,
                                                    "teacher",
                                                    e.target.value
                                                )
                                            }
                                            maxLength={50}
                                            required
                                        />
                                    </div>
                                    <div className="form-field">
                                        <label htmlFor={`${id}-room`}>
                                            Room number{" "}
                                            <span className="required">*</span>
                                        </label>
                                        <input
                                            id={`${id}-room`}
                                            value={value.room}
                                            onChange={(e) =>
                                                update(
                                                    slotKey,
                                                    "room",
                                                    e.target.value
                                                )
                                            }
                                            maxLength={20}
                                            required
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
