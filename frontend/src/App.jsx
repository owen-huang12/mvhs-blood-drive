import { useState, useRef } from "react";
import "./index.css";
import StudentPersonalInfo from "./StudentPersonalInfo.jsx";
import icon from "./assets/icon.png";

function App() {
    const [name, setName] = useState("");
    const [studentId, setStudentId] = useState("");
    const [email, setEmail] = useState("");
    const [grade, setGrade] = useState("");

    const handleSubmit = (event) => {
        event.preventDefault();
    };

    const formProps = {
        name,
        setName,
        studentId,
        setStudentId,
        email,
        setEmail,
        grade,
        setGrade,
        handleSubmit,
    };

    return (
        <>
            <header className="header">
                <span className="header-title">
                    Mountain View High School Stanford Blood Drive
                </span>
                <img
                    src={icon}
                    alt="MVHS Blood Drive"
                    className="header-icon"
                />
            </header>

            <StudentPersonalInfo {...formProps} />
        </>
    );
}

export default App;
