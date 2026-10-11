"""Print a bcrypt hash for a password, to paste into the environment.

Used for the attendance clerk's account, whose credentials live in the
environment rather than the coordinators table:

    python tools/hash_password.py
    ATTENDANCE_PASSWORD_HASH=$2b$12$...

The password is read from a prompt, not an argument, so it does not end up in
the shell history or the process list.
"""

import getpass
import sys

import bcrypt

# Matches MAX_PASSWORD_BYTES in main.py: bcrypt reads only the first 72 bytes
# and bcrypt 5 raises past that.
MAX_PASSWORD_BYTES = 72


def main() -> int:
    password = getpass.getpass("Password: ")
    if not password:
        print("No password given.", file=sys.stderr)
        return 1
    if password != getpass.getpass("Again: "):
        print("The two entries did not match.", file=sys.stderr)
        return 1
    if len(password.encode()) > MAX_PASSWORD_BYTES:
        print(f"Too long: bcrypt reads only {MAX_PASSWORD_BYTES} bytes.", file=sys.stderr)
        return 1

    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    print(f"\nATTENDANCE_PASSWORD_HASH={hashed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
