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
    "Period 2": "#E28277",
    "Period 2/Tutorial": "#D6746A",
    "Tutorial": "#CA675E",
    "Brunch/Period 4": "#BE5B51",
    "Period 4": "#B14F45",
    "Period 4/Lunch": "#A5443B",
    "Lunch": "#983A31",
    "Lunch/Period 6": "#8B3129",
    "Period 6": "#7E2A22",
};

export default function StudentPersonalInfo({
    name,
    setName,
    studentId,
    setStudentId,
    email,
    setEmail,
    grade,
    setGrade,
    selectedSlots,
    toggleTimeSlot,
    handleSubmit,
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

                        <table className="signups-table timeslot-table">
                            <thead>
                                <tr>
                                    <th>Period</th>
                                    <th>Time slot</th>
                                    <th>Your choice</th>
                                </tr>
                            </thead>
                            <tbody>
                                {TIME_SLOTS.map((slot) => {
                                    const slotKey = `${slot.period}__${slot.time}`;
                                    const rank = selectedSlots.indexOf(slotKey);
                                    const isSelected = rank !== -1;
                                    return (
                                        <tr
                                            key={slotKey}
                                            className={
                                                isSelected
                                                    ? "timeslot-row selected"
                                                    : "timeslot-row"
                                            }
                                            tabIndex={0}
                                            onClick={() => toggleTimeSlot(slotKey)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    toggleTimeSlot(slotKey);
                                                }
                                            }}
                                        >
                                            <td
                                                style={{
                                                    backgroundColor:
                                                        PERIOD_COLORS[slot.period],
                                                    color: "#fff",
                                                }}
                                            >
                                                {slot.period}
                                            </td>
                                            <td>{slot.time}</td>
                                            <td className="timeslot-choice">
                                                {isSelected ? CHOICE_LABELS[rank] : ""}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {slotError && <p className="login-error">{slotError}</p>}
                    </CollapsibleSection>

                    <button type="submit" className="submit-btn">
                        Register
                    </button>
                </form>
            </section>
        </main>
    );
}
