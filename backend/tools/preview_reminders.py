"""Print the two-day reminders without sending anything.

    python tools/preview_reminders.py            # one of each kind
    python tools/preview_reminders.py --all      # every recipient
    python tools/preview_reminders.py --html     # the HTML instead of text

Reads the live database but sends nothing and writes nothing, so it is safe
to run as often as you like before the real send.
"""

import argparse
import os
import sys

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
    parser.add_argument("--html", action="store_true", help="show the HTML body")
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
    for row in shown:
        subject, html_body, text_body = main._reminder_email(row, args.kind)
        print("=" * 72)
        print(f"To      : {row.full_name} <{row.email_address}>")
        print(f"Type    : {row.participant_type}   Slot: {row.time_slot}")
        print(f"Subject : {subject}")
        if row.participant_type == "student" and (row.age or 0) < main.CONSENT_REQUIRED_UNDER_AGE:
            print("Attached: parent consent forms (English + Spanish)")
        print("-" * 72)
        print(html_body if args.html else text_body)
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main_())
