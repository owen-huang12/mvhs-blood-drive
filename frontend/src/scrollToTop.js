import { useLayoutEffect } from "react";

/**
 * Jump to the top of the page whenever `key` changes.
 *
 * The browser keeps the scroll position across client-side page changes, so
 * without this the next screen (the confirm page, "You're registered") opens
 * wherever the last one was left — often at the bottom, by the submit button,
 * which on a phone hides the new screen's heading. Runs before paint so the
 * old position never flashes.
 */
export function useScrollToTop(key) {
    useLayoutEffect(() => {
        window.scrollTo(0, 0);
    }, [key]);
}
