import { useState } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";

import "./index.css";
import HomePage from "./HomePage.jsx";
import StudentPersonalInfo from "./StudentPersonalInfo.jsx";
import CoordinatorsPage from "./CoordinatorsPage.jsx";
import CoordinatorDashboard from "./CoordinatorDashboard.jsx";
import CompletedStudentForm from "./CompletedStudentForm.jsx";
import RequireAuth from "./RequireAuth.jsx";
import icon from "./assets/icon.png";

function Layout() {
    const [name, setName] = useState("");
    const [studentId, setStudentId] = useState("");
    const [age, setAge] = useState("");
    const [email, setEmail] = useState("");
    const [grade, setGrade] = useState("");
    const [selectedSlots, setSelectedSlots] = useState([]);
    const [submitError, setSubmitError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const navigate = useNavigate();

    const toggleTimeSlot = (slotKey) => {
        setSelectedSlots((prev) => {
            if (prev.includes(slotKey)) {
                return prev.filter((key) => key !== slotKey);
            }
            if (prev.length >= 3) {
                return prev;
            }
            return [...prev, slotKey];
        });
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSubmitError("");
        setSubmitting(true);

        const formatSlot = (slotKey) => slotKey.replace("__", " - ");
        const [first_choice, second_choice, third_choice] =
            selectedSlots.map(formatSlot);

        try {
            const res = await fetch("http://localhost:8000/student-sign-up", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    full_name: name,
                    student_id: studentId,
                    age: Number(age),
                    email_address: email,
                    grade,
                    first_choice,
                    second_choice,
                    third_choice,
                }),
            });

            if (!res.ok) {
                setSubmitError("Something went wrong submitting your registration. Please try again.");
                return;
            }

            navigate("/completed", { replace: true, state: { email } });
        } catch {
            setSubmitError("Could not reach the server. Try again.");
        } finally {
            setSubmitting(false);
        }
    };

    const formProps = {
        name, setName,
        studentId, setStudentId,
        age, setAge,
        email, setEmail,
        grade, setGrade,
        selectedSlots, toggleTimeSlot,
        handleSubmit,
        submitError,
        submitting,
    };

    return (
        <>
            <header className="header">
                <Link to="/" className="header-brand">
                    <img src={icon} alt="MVHS Blood Drive" className="header-icon" />
                    <span className="header-title">
                        MVHS<br />Stanford Blood Drive
                    </span>
                </Link>
            </header>

            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/signup" element={<StudentPersonalInfo {...formProps} />} />
                <Route path="/completed" element={<CompletedStudentForm />} />
            </Routes>
        </>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/coordinators" element={<CoordinatorsPage />} />
                <Route
                    path="/coordinators/dashboard"
                    element={
                        <RequireAuth>
                            <CoordinatorDashboard />
                        </RequireAuth>
                    }
                />
                <Route path="/*" element={<Layout />} />
            </Routes>
        </BrowserRouter>
    );
}
