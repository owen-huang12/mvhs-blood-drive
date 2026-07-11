import { Link } from "react-router-dom";
import placeholder1 from "./assets/placeholder_1.png";
import placeholder2 from "./assets/placeholder_2.png";

export default function HomePage() {
    return (
        <div className="homepage">
            <div className="left-panel">
                <img src={placeholder1} alt="" className="photo-placeholder" />
                <img src={placeholder2} alt="" className="photo-placeholder" />
                <Link to="/signup" className="signup-cta">
                    <span className="cta-arrow">&#8594;</span>
                    <span>Sign up for the<br />8/12 blood drive</span>
                </Link>
            </div>

            <div className="right-panel">
                <section className="right-section">
                    <h2 className="section-title">
                        Why should I donate to the MVHS annual Stanford blood drive?
                    </h2>
                    <div className="right-content">
                        <p>
                            Lorem ipsum dolor sit amet consectetur adipiscing elit.
                            Quisque faucibus ex sapien vitae pellentesque sem placerat.
                            In id cursus mi pretium tellus duis convallis. Tempus leo eu
                            aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus
                            nec metus bibendum egestas. Iaculis massa nisl malesuada
                            lacinia integer nunc posuere.
                        </p>
                        <p>
                            Lorem ipsum dolor sit amet consectetur adipiscing elit.
                            Quisque faucibus ex sapien vitae pellentesque sem placerat.
                            In id cursus mi pretium tellus duis convallis. Tempus leo eu
                            aenean sed diam urna tempor.
                        </p>
                    </div>
                </section>

                <section className="right-section">
                    <h2 className="section-title">
                        Am I eligible to donate to the Stanford Blood Drive?
                    </h2>
                    <div className="right-content">
                        <p>
                            Lorem ipsum dolor sit amet consectetur adipiscing elit.
                            Quisque faucibus ex sapien vitae pellentesque sem placerat.
                            In id cursus mi pretium tellus duis convallis. Tempus leo eu
                            aenean sed diam urna tempor. Pulvinar vivamus fringilla lacus
                            nec metus bibendum egestas. Iaculis massa nisl malesuada
                            lacinia integer nunc posuere.
                        </p>
                    </div>
                </section>
            </div>
        </div>
    );
}
