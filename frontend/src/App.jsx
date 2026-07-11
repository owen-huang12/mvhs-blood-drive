import { useState } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

import "./index.css";
import HomePage from "./HomePage.jsx";
import StudentPersonalInfo from "./StudentPersonalInfo.jsx";
import CoordinatorsPage from "./CoordinatorsPage.jsx";
import CoordinatorDashboard from "./CoordinatorDashboard.jsx";
import RequireAuth from "./RequireAuth.jsx";
import icon from "./assets/icon.png";

function Layout() {
    const [name, setName] = useState("");
    const [studentId, setStudentId] = useState("");
    const [email, setEmail] = useState("");
    const [grade, setGrade] = useState("");

    const handleSubmit = (event) => {
        event.preventDefault();
    };

    const formProps = {
        name, setName,
        studentId, setStudentId,
        email, setEmail,
        grade, setGrade,
        handleSubmit,
    };

    return (
        <>
            <header className="header">
                <Link to="/" className="header-brand">
                    <img src={icon} alt="MVHS Blood Drive" className="header-icon" />
                    <span className="header-title">
                        Mountain View High School<br />Stanford Blood Drive
                    </span>
                </Link>
            </header>

            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/signup" element={<StudentPersonalInfo {...formProps} />} />
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
