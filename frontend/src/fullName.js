import { useEffect, useRef } from "react";

export const FULL_NAME_MESSAGE = "Requires full legal name.";

/** The message for a one-word name, or "" if it's fine (or still empty). */
export function fullNameError(value) {
    const words = value.trim().split(/\s+/).filter(Boolean);
    return words.length === 1 ? FULL_NAME_MESSAGE : "";
}

/**
 * Ref for a name input that blocks a one-word name at submit, with the
 * browser's own validation bubble, the same way `required` blocks an empty
 * one. Empty is left to `required`, so its usual message still shows.
 *
 * Checked on every value change rather than in an onChange handler, so a
 * value restored by "Go back and edit" is checked too.
 */
export function useFullNameCheck(value) {
    const ref = useRef(null);
    useEffect(() => {
        ref.current?.setCustomValidity(fullNameError(value));
    }, [value]);
    return ref;
}
