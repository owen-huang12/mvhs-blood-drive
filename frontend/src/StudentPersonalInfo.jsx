import { useState } from "react";
import CollapsibleSection from "./CollapsibleSection.jsx";

const TIME_SLOTS = [
    { period: "Period 2", time: "8:30 AM" },
    { period: "Period 2", time: "8:45 AM" },
    { period: "Period 2", time: "9:00 AM" },
    { period: "Period 2", time: "9:15 AM" },
    { period: "Period 2", time: "9:30 AM" },
    { period: "Period 2", time: "9:45 AM" },
    { period: "Period 2/Tutorial", time: "10:00 AM" },
    { period: "Tutorial", time: "10:15 AM" },
    { period: "Tutorial", time: "10:30 AM" },
    { period: "Tutorial", time: "10:45 AM" },
    { period: "Brunch/Period 4", time: "11:00 AM" },
    { period: "Period 4", time: "11:15 AM" },
    { period: "Period 4", time: "11:30 AM" },
    { period: "Period 4", time: "11:45 AM" },
    { period: "Period 4", time: "12:00 PM" },
    { period: "Period 4", time: "12:15 PM" },
    { period: "Period 4/Lunch", time: "12:30 PM" },
    { period: "Lunch", time: "12:45 PM" },
    { period: "Lunch", time: "1:00 PM" },
    { period: "Lunch/Period 6", time: "1:15 PM" },
    { period: "Period 6", time: "1:30 PM" },
    { period: "Period 6", time: "1:45 PM" },
    { period: "Period 6", time: "2:00 PM" },
    { period: "Period 6", time: "2:15 PM" },
];

const CHOICE_LABELS = ["1st choice", "2nd choice", "3rd choice"];

const PERIOD_COLORS = {
    "Period 2": { bg: "#FBE7E4", text: "#A85449" },
    "Period 2/Tutorial": { bg: "#FBEDE0", text: "#A16B3C" },
    "Tutorial": { bg: "#FAF3DD", text: "#8E7530" },
    "Brunch/Period 4": { bg: "#EAF3E3", text: "#5E8148" },
    "Period 4": { bg: "#E0F0EB", text: "#3F7F70" },
    "Period 4/Lunch": { bg: "#DFEEF5", text: "#3E7793" },
    "Lunch": { bg: "#E3E9F8", text: "#4C64A5" },
    "Lunch/Period 6": { bg: "#E9E4F6", text: "#68569F" },
    "Period 6": { bg: "#F3E4EF", text: "#8F5182" },
};

export default function StudentPersonalInfo({
    name,
    setName,
    studentId,
    setStudentId,
    age,
    setAge,
    email,
    setEmail,
    grade,
    setGrade,
    selectedSlots,
    toggleTimeSlot,
    handleSubmit,
    submitError,
    submitting,
}) {
    const [slotError, setSlotError] = useState("");

    const handleFormSubmit = (event) => {
        if (selectedSlots.length !== 3) {
            event.preventDefault();
            setSlotError("Please select exactly 3 preferred time slots.");
            return;
        }
        setSlotError("");
        handleSubmit(event);
    };
    return (
        <main className="page">
            <CollapsibleSection title="Overview of the Stanford Blood Drive">
                <div className="overview-text">
                    <p>
                        Lorem ipsum dolor sit amet consectetur adipiscing elit.
                        Quisque faucibus ex sapien vitae pellentesque sem
                        placerat. In id cursus mi pretium tellus duis convallis.
                        Tempus leo eu aenean sed diam urna tempor. Pulvinar
                        vivamus fringilla lacus nec metus bibendum egestas.
                        Iaculis massa nisl malesuada lacinia integer nunc
                        posuere.
                    </p>
                    <p>
                        Lorem ipsum dolor sit amet consectetur adipiscing elit.
                        Quisque faucibus ex sapien vitae pellentesque sem
                        placerat. In id cursus mi pretium tellus duis convallis.
                        Tempus leo eu aenean sed diam urna tempor.
                    </p>
                </div>
            </CollapsibleSection>

            <section className="form-section">
                <form className="signup-form" onSubmit={handleFormSubmit}>
                    <CollapsibleSection
                        as="div"
                        title="Personal & Contact information"
                    >
                        <p className="form-prompt">
                            Please fill out the form below with your
                            information to register for the blood drive. All
                            fields are required.
                        </p>
                        <div className="form-field">
                            <label htmlFor="name">
                                Full Name <span className="required">*</span>
                            </label>
                            <input
                                id="name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Please enter your full name"
                                required
                            />
                        </div>
                        <div className="form-field">
                            <label htmlFor="studentId">
                                Student ID <span className="required">*</span>
                            </label>
                            <input
                                id="studentId"
                                type="text"
                                value={studentId}
                                onChange={(e) => setStudentId(e.target.value)}
                                placeholder=""
                                required
                            />
                        </div>
                        <div className="form-field">
                            <label htmlFor="age">
                                Age <span className="required">*</span>
                            </label>
                            <input
                                id="age"
                                type="number"
                                min="1"
                                value={age}
                                onChange={(e) => setAge(e.target.value)}
                                placeholder=""
                                required
                            />
                        </div>
                        <div className="form-field">
                            <label htmlFor="email">
                                Email (preferred email){" "}
                                <span className="required">*</span>
                            </label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder=""
                                required
                            />
                        </div>
                        <div className="form-field">
                            <span className="form-field-label">
                                Grade <span className="required">*</span>
                            </span>
                            <div className="grade-options">
                                {["9th", "10th", "11th", "12th"].map((g) => (
                                    <label key={g} className="grade-radio">
                                        <input
                                            type="radio"
                                            name="grade"
                                            value={g}
                                            checked={grade === g}
                                            onChange={(e) =>
                                                setGrade(e.target.value)
                                            }
                                        />
                                        {g}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection as="div" title="Preferred time slot">
                        <p className="form-prompt">
                            Please select exactly 3 of your preferred time
                            slots, in order of preference. The order you click
                            them in sets your 1st, 2nd, and 3rd choice.
                            {/*figure out the schedule day and stuff and what day it is*/}
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
                                    const slotKey = `${slot.period}__${slot.time}`;
                                    const rank = selectedSlots.indexOf(slotKey);
                                    const isSelected = rank !== -1;
                                    const colors = PERIOD_COLORS[slot.period];
                                    return (
                                        <tr
                                            key={slotKey}
                                            className={
                                                isSelected
                                                    ? "timeslot-row selected"
                                                    : "timeslot-row"
                                            }
                                            role="button"
                                            aria-pressed={isSelected}
                                            tabIndex={0}
                                            onClick={() => toggleTimeSlot(slotKey)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    toggleTimeSlot(slotKey);
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

                        {slotError && <p className="login-error">{slotError}</p>}
                    </CollapsibleSection>

                    {submitError && <p className="login-error">{submitError}</p>}

                    <button type="submit" className="submit-btn" disabled={submitting}>
                        {submitting ? "Registering…" : "Register"}
                    </button>
                </form>
            </section>
        </main>
    );
}
