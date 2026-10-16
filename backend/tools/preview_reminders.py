"""Preview the reminder emails without sending them.

    python tools/preview_reminders.py                   # one of each kind
    python tools/preview_reminders.py --kind day_of     # the day-of slip
    python tools/preview_reminders.py --all             # every recipient
    python tools/preview_reminders.py --html            # the HTML source
    python tools/preview_reminders.py --open            # open in a browser

`--open` writes each email to a file and opens it, which is the only way to
see what it actually looks like — the map at the foot, the bolding, the
links — short of sending one. It also lists what would be attached.

Reads the live database but sends nothing and writes nothing to it, so it
is safe to run as often as you like.
"""

import argparse
import os
import sys
import tempfile
import webbrowser

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import main  # noqa: E402  (path has to be set first)


def main_() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--all", action="store_true", help="every recipient")
    parser.add_argument(
        "--kind",
        default=main.REMINDER_TWO_DAY,
        choices=list(main.REMINDER_SCHEDULE),
        help="which mailing to preview",
    )
    parser.add_argument("--html", action="store_true", help="show the HTML source")
    parser.add_argument(
        "--open", action="store_true", help="render in a browser instead"
    )
    args = parser.parse_args()

    recipients = main._reminder_recipients(args.kind)
    if not recipients:
        print("Nobody is due a reminder — all already sent.")
        return 0

    if args.all:
        shown = recipients
    else:
        # One of each kind, which is what there is to proofread.
        seen = {}
        for row in recipients:
            seen.setdefault(row.participant_type, row)
        shown = list(seen.values())

    print(f"{main.REMINDER_SCHEDULE[args.kind]['label']}: "
          f"{len(recipients)} due; showing {len(shown)}.\n")

    pages = []
    for row in shown:
        subject, html_body, text_body = main._reminder_email(row, args.kind)

        # Exactly what send_reminders would attach to this person's email.
        attachments = [main._map_attachment()["filename"]]
        if row.participant_type == "student" and (
            (row.age or 0) < main.CONSENT_REQUIRED_UNDER_AGE
        ):
            attachments += list(main.CONSENT_FORM_FILES)

        if args.open:
            # Wrapped so the browser shows it the way a mail client would:
            # a plain readable column, not full-bleed across the window.
            page = (
                "<!doctype html><meta charset='utf-8'>"
                f"<title>{subject}</title>"
                "<div style=\"font:15px/1.5 -apple-system,Segoe UI,sans-serif;"
                "max-width:620px;margin:32px auto;padding:0 16px;color:#1a1a1a\">"
                "<div style=\"background:#faf9f8;border:1px solid #e4e0dd;"
                "border-radius:8px;padding:12px 16px;margin-bottom:24px;"
                "font-size:13px;color:#5f5a56\">"
                f"<div><strong>To:</strong> {row.full_name} &lt;{row.email_address}&gt;</div>"
                f"<div><strong>Subject:</strong> {subject}</div>"
                f"<div><strong>Attached:</strong> {', '.join(attachments)}</div>"
                "</div>"
                f"{html_body}</div>"
            )
            handle = tempfile.NamedTemporaryFile(
                "w", suffix=f"-{row.participant_type}.html", delete=False,
                encoding="utf-8",
            )
            handle.write(page)
            handle.close()
            pages.append(handle.name)
            print(f"  {row.participant_type:10} {row.full_name[:24]:26} -> {handle.name}")
            continue

        print("=" * 72)
        print(f"To      : {row.full_name} <{row.email_address}>")
        print(f"Type    : {row.participant_type}   Slot: {row.time_slot}")
        print(f"Subject : {subject}")
        print(f"Attached: {', '.join(attachments)}")
        print("-" * 72)
        print(html_body if args.html else text_body)
        print()

    for path in pages:
        webbrowser.open(f"file://{path}")
    if pages:
        print(f"\nOpened {len(pages)} in your browser. The map loads from "
              f"{main.FRONTEND_URL}, so it only shows once that is deployed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main_())
