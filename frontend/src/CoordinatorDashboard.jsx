import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearToken, getToken } from "./auth.js";
import icon from "./assets/icon.png";

export default function CoordinatorDashboard() {
    const [name, setName] = useState("");
    const navigate = useNavigate();

    useEffect(() => {
        fetch("http://localhost:8000/me", {
            headers: { Authorization: `Bearer ${getToken()}` },
        })
            .then((r) => r.json())
            .then((data) => setName(data.full_name))
            .catch(() => {});
    }, []);

    function handleSignOut() {
        clearToken();
        navigate("/coordinators");
    }

    const initials = name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

    return (
        <div className="dashboard-page">
            <header className="header">
                <button className="profile-pill" onClick={handleSignOut} title="Sign out">
                    <span className="profile-avatar">{initials}</span>
                    <span className="profile-name">{name}</span>
                </button>
                <div className="header-brand">
                    <img src={icon} alt="MVHS Blood Drive" className="header-icon" />
                    <span className="header-title">
                        MVHS<br />Stanford Blood Drive
                    </span>
                </div>
            </header>

            <main className="dashboard-content">
                <h2 className="dashboard-section-title">Coordinator Dashboard</h2>
                <div className="dashboard-body">
                    Dashboard coming soon.
                </div>
            </main>
        </div>
    );
}
