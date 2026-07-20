import { useId, useLayoutEffect, useRef, useState } from "react";
import { animate } from "animejs";

export default function CollapsibleSection({
    title,
    defaultOpen = true,
    as: Wrapper = "section",
    wrapperClassName = "",
    children,
}) {
    const [open, setOpen] = useState(defaultOpen);
    const contentRef = useRef(null);
    const innerRef = useRef(null);
    const animationRef = useRef(null);
    const isFirstRender = useRef(true);
    const panelId = useId();

    useLayoutEffect(() => {
        const content = contentRef.current;
        const inner = innerRef.current;
        if (!content || !inner) return;

        if (isFirstRender.current) {
            isFirstRender.current = false;
            content.style.height = open ? "auto" : "0px";
            content.style.opacity = open ? "1" : "0";
            return;
        }

        if (animationRef.current) {
            animationRef.current.pause();
        }

        content.style.height = `${content.offsetHeight}px`;
        const targetHeight = open ? inner.offsetHeight : 0;

        animationRef.current = animate(content, {
            height: targetHeight,
            opacity: open ? [0, 1] : [1, 0],
            duration: 400,
            ease: "inOutQuad",
            onComplete: () => {
                if (open) content.style.height = "auto";
            },
        });
    }, [open]);

    return (
        <Wrapper className={wrapperClassName}>
            <h2
                className="section-title collapsible-trigger"
                role="button"
                tabIndex={0}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={(e) => {
                    e.currentTarget.blur();
                    setOpen((prev) => !prev);
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpen((prev) => !prev);
                    }
                }}
            >
                <span>{title}</span>
                <span
                    className={`collapse-chevron${open ? " open" : ""}`}
                    aria-hidden="true"
                />
            </h2>
            <div id={panelId} className="collapsible-content" ref={contentRef}>
                <div ref={innerRef} className="collapsible-inner">
                    {children}
                </div>
            </div>
        </Wrapper>
    );
}
