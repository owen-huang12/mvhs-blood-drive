export default function StudentPersonalInfo({
    name,
    setName,
    studentId,
    setStudentId,
    email,
    setEmail,
    grade,
    setGrade,
    handleSubmit,
}) {
    return (
        <main className="page">
            <section>
                <h2 className="section-title">
                    Overview of the Stanford Blood Drive
                </h2>
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
            </section>

            <hr className="divider" />

            <section className="form-section">
                <h2 className="section-title">Sign Up</h2>
                <p className="form-prompt">
                    Please fill out the form below with your information to
                    register for the blood drive. All fields are required.
                </p>
                <form className="signup-form" onSubmit={handleSubmit}>
                    <div className="form-field">
                        <label htmlFor="name">Full Name</label>
                        <input
                            id="name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Jane Smith"
                        />
                    </div>
                    <div className="form-field">
                        <label htmlFor="studentId">Student ID</label>
                        <input
                            id="studentId"
                            type="text"
                            value={studentId}
                            onChange={(e) => setStudentId(e.target.value)}
                            placeholder="1000XXXXX"
                        />
                    </div>
                    <div className="form-field">
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="e.g. jsmith@mvla.net"
                        />
                    </div>
                    <div className="form-field">
                        <label htmlFor="grade">Grade</label>
                        <input
                            id="grade"
                            type="text"
                            value={grade}
                            onChange={(e) => setGrade(e.target.value)}
                            placeholder="e.g. 11"
                        />
                    </div>
                    <button type="submit" className="submit-btn">
                        Register
                    </button>
                </form>
            </section>
        </main>
    );
}
