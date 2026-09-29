import { useEffect, useRef } from "react";
import { animate } from "animejs";
import placeholder3 from "./assets/placeholder_3.jpg";

export default function HomeHero() {
    const imageRef = useRef(null);

    useEffect(() => {
        animate(imageRef.current, {
            scale: [1.06, 1],
            opacity: [0, 1],
            duration: 1000,
            ease: "outQuad",
        });
    }, []);

    return (
        <div className="home-hero">
            <img
                ref={imageRef}
                src={placeholder3}
                alt="MVHS Stanford Blood Drive"
                className="home-hero-image"
            />
        </div>
    );
}
