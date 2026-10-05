import asyncio
import base64
from collections import deque
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import html
import json
import logging
import os
from pathlib import Path
import re
import secrets
import threading
import time
from typing import Annotated

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
import bcrypt
from pydantic import AfterValidator, BaseModel, EmailStr, Field, StringConstraints, field_validator
import psycopg2
import psycopg2.errors
import resend

load_dotenv()

DATABASE_URL = os.environ["NEON_DATABASE"]
JWT_SECRET = os.environ["JWT_SECRET"]
ACCESS_TOKEN_EXPIRE_HOURS = 12

# Shared secret handed to coordinators so they can register themselves.
# Read with .get rather than [] so a missing value fails registration closed
# (see _assert_invite_code) instead of taking the whole API down at boot.
COORDINATOR_INVITE_CODE = os.environ.get("COORDINATOR_INVITE_CODE")

MIN_PASSWORD_LENGTH = 8
# bcrypt only reads the first 72 bytes, and bcrypt 5 raises past that.
MAX_PASSWORD_BYTES = 72

# Password reset email, sent through Resend. The from address must be on the
# domain verified in the Resend dashboard. With no API key set, the reset link
# is logged instead of emailed (outside production only), so the flow can be
# tested locally without sending anything.
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
EMAIL_FROM = os.environ.get(
    "EMAIL_FROM", "MVHS Blood Drive <noreply@mvhsblooddrive.com>"
)
# The drive's shared inbox. Every email names it at the bottom and sets it as
# the reply-to, since Resend only sends: without it, a reply would go to the
# noreply address and bounce. Mirrored by CONTACT_EMAIL in
# frontend/src/contact.js.
CONTACT_EMAIL = os.environ.get("CONTACT_EMAIL", "mvhsblooddrive@gmail.com")
# Where the reset link in the email points. Defaults to the live site even when
# running locally: the email goes to a real inbox, and the database is shared,
# so the link works there. Set FRONTEND_URL=http://localhost:5173 to test the
# reset page against a local frontend instead.
FRONTEND_URL = os.environ.get(
    "FRONTEND_URL", "https://mvhs-blood-drive.vercel.app"
).rstrip("/")

RESET_TOKEN_EXPIRE_MINUTES = 30
# Per account, per hour. Stops the endpoint being used to flood someone's inbox.
MAX_RESET_REQUESTS_PER_HOUR = 3

logger = logging.getLogger("uvicorn.error")

# Day-of features (check-in times, deferral, attendance) stay closed until two
# days before the drive. The date is the real boundary, not just a hidden
# route: these endpoints 403 before it, so an early client cannot write
# operational data into a schedule that is still being rearranged.
#
# PHASE_TWO_OVERRIDE=1 opens them regardless, for local development and demos.
PHASE_TWO_START = datetime(2026, 10, 14, tzinfo=timezone.utc)


def _assert_phase_two_open() -> None:
    if os.environ.get("PHASE_TWO_OVERRIDE") == "1":
        return
    if datetime.now(timezone.utc) < PHASE_TWO_START:
        raise HTTPException(
            status_code=403,
            detail="Day-of features open on October 14.",
        )

# How long a stream sits idle before emitting a comment frame. Proxies (and
# Railway's router) drop connections that go quiet, so this keeps them open.
SSE_KEEPALIVE_SECONDS = 20

# Events buffered per connected dashboard. A client that falls this far behind
# is treated as desynced and told to refetch rather than served a partial view.
SSE_QUEUE_SIZE = 64


class EventBroker:
    """Fans out row changes to every connected dashboard.

    Writes happen in sync route handlers, which FastAPI runs in a worker
    thread, while subscribers live on the event loop — so `publish` is the
    thread-safe boundary between the two and everything past it is loop-only.

    State is per-process: with more than one server instance, clients only see
    writes that landed on the instance they are connected to. Moving to
    Postgres LISTEN/NOTIFY is the fix if this is ever scaled out.
    """

    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def publish(self, event_type: str, data: dict) -> None:
        """Queue an event for every subscriber. Safe to call from any thread."""
        # No loop bound means nothing can be listening yet (startup, or tests
        # importing the module), so there is nothing to deliver to.
        if self._loop is None:
            return
        self._loop.call_soon_threadsafe(self._fan_out, event_type, data)

    def _fan_out(self, event_type: str, data: dict) -> None:
        for queue in self._subscribers:
            try:
                queue.put_nowait((event_type, data))
            except asyncio.QueueFull:
                # Drop the backlog instead of blocking the writer, and leave a
                # marker so the client resyncs from scratch on the next read.
                _drain(queue)
                queue.put_nowait(("desync", {}))

    @asynccontextmanager
    async def subscribe(self):
        queue: asyncio.Queue = asyncio.Queue(maxsize=SSE_QUEUE_SIZE)
        self._subscribers.add(queue)
        try:
            yield queue
        finally:
            self._subscribers.discard(queue)


def _drain(queue: asyncio.Queue) -> None:
    while not queue.empty():
        queue.get_nowait()


broker = EventBroker()


@asynccontextmanager
async def lifespan(_: FastAPI):
    broker.bind(asyncio.get_running_loop())
    _ensure_slot_capacity_table()
    _ensure_participant_type_column()
    _ensure_day_of_columns()
    _ensure_student_agreement_columns()
    _ensure_choice_class_columns()
    _ensure_password_reset_table()
    _ensure_unique_constraints()
    yield


app = FastAPI(lifespan=lifespan)

# FRONTEND_ORIGIN lets the deployed frontend's URL be set per-environment
# (e.g. https://mvhs-blood-drive.vercel.app) without hardcoding it here.
_allowed_origins = ["https://mvhs-blood-drive.vercel.app"]
if frontend_origin := os.environ.get("FRONTEND_ORIGIN"):
    _allowed_origins.append(frontend_origin)

# Vite's dev server, so a local frontend can reach a local backend without
# every request failing CORS. Set APP_ENV=production on the deployed instance
# to leave these out of its allowlist.
if os.environ.get("APP_ENV") != "production":
    _allowed_origins += ["http://localhost:5173", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")


class RateLimiter:
    """Sliding-window request counts per client, held in memory.

    In-process, so it relies on the single worker the Procfile pins, and it
    resets on restart. That's fine: it exists to blunt scripted abuse of the
    public routes, not to account for anything.
    """

    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque] = {}
        self._lock = threading.Lock()

    def hit(self, key: tuple[str, str], limit: int, window: float) -> bool:
        """Record one request. False if it goes over `limit` per `window` seconds."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= now - window:
                hits.popleft()
            if len(hits) >= limit:
                return False
            hits.append(now)
            # Drop idle clients now and then so the map can't grow forever.
            if len(self._hits) > 10_000:
                self._hits = {k: v for k, v in self._hits.items() if v}
            return True


limiter = RateLimiter()


def _client_ip(request: Request) -> str:
    """The caller's IP. Behind Railway's proxy every request comes from the
    proxy, so the real client is the last address it added to
    X-Forwarded-For. The rightmost entry is used because everything to its
    left was sent by the client and can be made up.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(name: str, limit: int, window_seconds: int):
    """Route dependency: at most `limit` requests per IP per window."""
    def check(request: Request) -> None:
        if not limiter.hit((name, _client_ip(request)), limit, window_seconds):
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please wait a few minutes and try again.",
            )
    return Depends(check)


# Field names as the forms label them, for validation messages.
FIELD_LABELS = {
    "full_name": "Full legal name",
    "preferred_name": "Preferred name",
    "how_hear": "How you heard about the drive",
    "agreement_signature": "Signature",
    "email_address": "Email",
    "email": "Email",
    "student_id": "Student ID",
    "age": "Age",
    "grade": "Grade",
    "first_choice": "1st choice",
    "second_choice": "2nd choice",
    "third_choice": "3rd choice",
    "teacher": "Teacher",
    "room": "Room number",
    "password": "Password",
    "invite_code": "Admin code",
}


@app.exception_handler(RequestValidationError)
async def _validation_error(_: Request, exc: RequestValidationError):
    """Turn pydantic's error list into the one-line `detail` the pages show.

    FastAPI's default is a list of objects, which the frontend would render
    as "[object Object]".
    """
    error = exc.errors()[0]
    field = error["loc"][-1] if error["loc"] else ""
    label = FIELD_LABELS.get(field, str(field).replace("_", " ").capitalize())
    ctx = error.get("ctx") or {}
    kind = error["type"]
    if kind == "string_too_long":
        message = f"{label} must be at most {ctx['max_length']} characters."
    elif kind in ("string_too_short", "missing"):
        message = f"{label} is required."
    elif kind == "value_error" and field in ("email", "email_address"):
        message = "Enter a valid email address."
    elif kind == "value_error":
        # Our own validators word their errors to follow the label.
        message = f"{label} {error['msg'].removeprefix('Value error, ')}."
    elif kind == "less_than_equal":
        message = f"{label} must be {ctx['le']} or under."
    else:
        message = f"{label}: {error['msg'].removeprefix('Value error, ')}"
    return JSONResponse(status_code=422, content={"detail": message})

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    # bcrypt raises on anything longer, and no stored password can be.
    if len(password.encode()) > MAX_PASSWORD_BYTES:
        return False
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _assert_invite_code(code: str) -> None:
    """Gate coordinator self-registration behind the shared invite code.

    Without this, /coordinator is open to anyone who finds the endpoint and
    can mint accounts. compare_digest keeps the check constant-time so the
    endpoint can't be used to guess the code a character at a time.
    """
    if not COORDINATOR_INVITE_CODE:
        raise HTTPException(
            status_code=503,
            detail="Registration is closed. Ask an admin to set an invite code.",
        )
    # Stripped so a stray space or newline from copy-pasting the code doesn't
    # turn a correct code into a confusing 401.
    # Compared as bytes: compare_digest rejects non-ASCII str with a TypeError.
    if not secrets.compare_digest(code.strip().encode(), COORDINATOR_INVITE_CODE.encode()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That admin code isn't right.",
        )

@contextmanager
def db_cursor(commit: bool = False):
    """Yield a cursor, committing on success and always closing the connection.

    Without this the previous per-route boilerplate leaked a connection
    whenever a query raised.
    """
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            yield cur
        if commit:
            conn.commit()
    finally:
        conn.close()


def create_access_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def get_current_coordinator(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return email
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


# models

# Length limits match the database columns, so an over-long value is a clear
# 422 rather than a 500 from Postgres.
def _text(max_length: int):
    return Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=max_length)
    ]


def _max_chars(limit: int):
    def check(value: str) -> str:
        if len(value) > limit:
            raise ValueError(f"must be at most {limit} characters")
        return value
    return AfterValidator(check)


def _password_fits(value: str) -> str:
    if len(value.encode()) > MAX_PASSWORD_BYTES:
        raise ValueError(f"must be at most {MAX_PASSWORD_BYTES} characters")
    return value


Password = Annotated[str, AfterValidator(_password_fits)]


class CoordinatorCreate(BaseModel):
    full_name: _text(100)
    email: Annotated[EmailStr, _max_chars(200)]
    password: Password
    invite_code: Annotated[str, Field(max_length=100)]

class CoordinatorPublic(BaseModel):
    full_name: str
    email: str

class InviteCode(BaseModel):
    invite_code: Annotated[str, Field(max_length=100)]

class ForgotPassword(BaseModel):
    # Not EmailStr: the reply is the same for any input, so a malformed
    # address shouldn't get a different answer.
    email: Annotated[str, Field(max_length=200)]

class ResetPassword(BaseModel):
    token: Annotated[str, Field(max_length=100)]
    password: Password

class Token(BaseModel):
    access_token: str
    token_type: str

# Who a sign-up is. Students give a student ID, age and grade; teachers and
# community members give only a name, an email and their three choices.
PARTICIPANT_TYPES = ("student", "teacher", "community")

# Non-students have no student ID, age or grade to give. Those columns are NOT
# NULL, so their absence is stored as a blank/zero rather than by loosening the
# schema — `participant_type` is what says whether they are meaningful.
NO_STUDENT_ID = ""
NO_GRADE = ""
NO_AGE = 0

GRADES = ("9th", "10th", "11th", "12th")

# "How did you hear about the drive?" Mirrored by HOW_HEAR_OPTIONS in
# frontend/src/HowHearField.jsx.
HOW_HEAR_OPTIONS = (
    "Friends and family",
    "Mountain View advertisement",
    "Teacher or class announcement",
    "School email or newsletter",
    "Social media",
    "Participated in a previous blood drive",
    "Other",
)

def _full_name(value: str) -> str:
    # Wording matches the form's own message (frontend/src/fullName.js).
    if len(value.split()) < 2:
        raise ValueError("must include your first and last name")
    return value


def _check_how_hear(value: str) -> str:
    if value not in HOW_HEAR_OPTIONS:
        raise ValueError("is required")
    return value


HowHear = Annotated[str, AfterValidator(_check_how_hear)]

# Column sizes in sign_ups. Donor names and signatures must be a full name:
# first and last, at least.
Name = Annotated[_text(50), AfterValidator(_full_name)]
# Optional: blank is stored as NULL and emails fall back to the first name.
PreferredName = Annotated[str, StringConstraints(strip_whitespace=True, max_length=50)] | None
SignUpEmail = Annotated[EmailStr, _max_chars(100)]
Choice = Annotated[str, Field(max_length=50)]


class SignUpRow(BaseModel):
    id: int
    # Legal name, which is what the dashboards show.
    full_name: str
    # What to call them in emails. None if they didn't give one.
    preferred_name: str | None = None
    # From the end of the sign-up; None on rows from before they were asked.
    how_hear: str | None = None
    agreement_signature: str | None = None
    is_student: bool
    participant_type: str
    student_id: str
    age: int
    email_address: str
    grade: str
    confirmed: bool
    time_slot: str
    first_choice: str
    second_choice: str
    third_choice: str
    # The class a student would miss at each choice, as "<teacher>, Rm
    # <room>". None for adults and for rows from before they were asked.
    first_choice_class: str | None = None
    second_choice_class: str | None = None
    third_choice_class: str | None = None
    # Day-of state. Null timestamps mean that step hasn't happened yet, which
    # is the correct reading for every row until the drive itself.
    time_in: datetime | None = None
    time_canteen: datetime | None = None
    time_out: datetime | None = None
    deferred: bool = False
    # Owned by the attendance clerk, not the day-of station: whether this
    # student has been marked off in the school's own attendance system.
    attendance_cleared: bool = False


class DayOfStamp(BaseModel):
    """One day-of field being set.

    `value` is null to clear a mistakenly-stamped time, and omitted entirely
    to mean "stamp it now" — the one-tap path at the check-in desk.
    """
    field: str
    value: datetime | None = None

    @field_validator("field")
    @classmethod
    def _known_field(cls, value: str) -> str:
        if value not in DAY_OF_TIME_FIELDS:
            raise ValueError(f"field must be one of {sorted(DAY_OF_TIME_FIELDS)}")
        return value


class DeferredChange(BaseModel):
    deferred: bool


class AttendanceChange(BaseModel):
    attendance_cleared: bool


class ConfirmSignUp(BaseModel):
    time_slot: str


class CapacityChange(BaseModel):
    """One position added or removed. Constrained so the endpoint can only ever
    step a slot by one — a client cannot post an arbitrary new capacity."""
    delta: int

    @field_validator("delta")
    @classmethod
    def _one_step(cls, value: int) -> int:
        if value not in (-1, 1):
            raise ValueError("delta must be -1 or 1")
        return value


class SlotCapacityRow(BaseModel):
    time_slot: str
    capacity: int
    # What the slot started at, so the dashboard can grey out "−" at the floor
    # instead of finding out by way of a 409.
    base: int


def _capitalise_words(value: str) -> str:
    """Raise the first letter of each word, and after a hyphen or apostrophe
    ("o'brien" -> "O'Brien"). The rest is left alone, so "McKenzie" keeps its
    capital K."""
    return re.sub(r"(^|[\s\-'])(\w)", lambda m: m.group(1) + m.group(2).upper(), value)


class ChoiceClass(BaseModel):
    """The class a student would miss for one of their choices."""
    teacher: Annotated[_text(50), AfterValidator(_capitalise_words)]
    # Free text: some rooms have letters ("A301") or are names.
    room: _text(20)

    def as_text(self) -> str:
        """"Marie Clarke, Rm 301". A room typed as "Rm 301" or "Room 301"
        loses its own prefix, so it doesn't come out "Rm Rm 301"."""
        room = self.room
        for prefix in ("room", "rm.", "rm"):
            if room.lower().startswith(prefix):
                room = room[len(prefix):].strip() or room
                break
        return f"{self.teacher}, Rm {room}"


class StudentSignUp(BaseModel):
    full_name: Name
    preferred_name: PreferredName = None
    student_id: _text(10)
    # The 16 minimum is checked in the route, for its clearer message; this
    # bound just keeps nonsense (and integer overflow) out of the column.
    age: Annotated[int, Field(ge=0, le=25)]
    email_address: SignUpEmail
    grade: str
    first_choice: Choice
    second_choice: Choice
    third_choice: Choice
    # One per choice, in the same order.
    choice_classes: Annotated[list[ChoiceClass], Field(min_length=3, max_length=3)]
    how_hear: HowHear
    agreement_signature: Name
    is_student: bool = True
    confirmed: bool = False

    @field_validator("grade")
    @classmethod
    def _known_grade(cls, value: str) -> str:
        if value not in GRADES:
            raise ValueError("is required")
        return value


class AdultSignUp(BaseModel):
    """A teacher or community member: no student ID, age or grade.

    Age is not asked for because the 16-year-old minimum is a school-student
    concern; every adult signing up here clears it by definition.
    """
    full_name: Name
    preferred_name: PreferredName = None
    email_address: SignUpEmail
    first_choice: Choice
    second_choice: Choice
    third_choice: Choice
    participant_type: str
    how_hear: HowHear
    agreement_signature: Name

    @field_validator("participant_type")
    @classmethod
    def _adult_type(cls, value: str) -> str:
        if value not in ("teacher", "community"):
            raise ValueError("participant_type must be 'teacher' or 'community'")
        return value


# routes

@app.get("/")
def read_root():
    return {"message": "MVHS Blood Drive API"}



@app.post("/login", response_model=Token, dependencies=[rate_limit("login", 10, 600)])
def login(form: OAuth2PasswordRequestForm = Depends()):
    with db_cursor() as cur:
        # Matched case-insensitively, the same way registration checks for an
        # existing account, so capitalisation can't lock someone out.
        cur.execute(
            "SELECT password_hash, email FROM coordinators WHERE LOWER(email) = LOWER(%s)",
            (form.username.strip(),)
        )
        row = cur.fetchone()

    if row is None or not verify_password(form.password, row[0]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    # The subject is the stored email, not what was typed — /me looks the
    # coordinator up by exact match, so a differently-capitalised login would
    # otherwise mint a token that resolves to nobody.
    token = create_access_token({"sub": row[1]})
    return {"access_token": token, "token_type": "bearer"}


@app.get("/me", response_model=CoordinatorPublic)
def get_me(email: str = Depends(get_current_coordinator)):
    with db_cursor() as cur:
        cur.execute("SELECT full_name, email FROM coordinators WHERE email = %s", (email,))
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Coordinator not found")
    return CoordinatorPublic(full_name=row[0], email=row[1])


@app.post("/coordinator/verify-invite", dependencies=[rate_limit("invite", 10, 600)])
def verify_invite(body: InviteCode):
    """Check an invite code on its own, so the register page can gate its form.

    This is a convenience for the UI only — /coordinator re-checks the code on
    the real request, since nothing stops a caller from skipping this step.
    """
    _assert_invite_code(body.invite_code)
    return {"valid": True}


@app.post(
    "/coordinator",
    response_model=CoordinatorPublic,
    dependencies=[rate_limit("invite", 10, 600)],
)
def create_coordinator(coordinator: CoordinatorCreate):
    _assert_invite_code(coordinator.invite_code)

    if len(coordinator.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters.",
        )

    email = coordinator.email.strip()
    full_name = coordinator.full_name.strip()
    hashed = hash_password(coordinator.password)

    with db_cursor(commit=True) as cur:
        # The table has a unique constraint on email; checking first turns what
        # would be a 500 from the constraint into a message the page can show.
        # Case-insensitive so one person can't end up with Foo@ and foo@
        # accounts — /login matches the same way.
        cur.execute("SELECT 1 FROM coordinators WHERE LOWER(email) = LOWER(%s)", (email,))
        if cur.fetchone() is not None:
            raise HTTPException(
                status_code=409,
                detail="An account already exists for that email.",
            )

        try:
            cur.execute(
                "INSERT INTO coordinators (full_name, email, password_hash) VALUES (%s, %s, %s)",
                (full_name, email, hashed)
            )
        except psycopg2.errors.UniqueViolation:
            # Two registrations for one email racing past the check above.
            raise HTTPException(
                status_code=409,
                detail="An account already exists for that email.",
            )
    return CoordinatorPublic(full_name=full_name, email=email)


# ── Password reset ──────────────────────────────────────────────────────

def _ensure_password_reset_table() -> None:
    """Create the reset token table if it isn't there yet.

    Only a SHA-256 of each token is stored, so a leaked copy of the table
    can't be turned into working reset links.
    """
    with db_cursor(commit=True) as cur:
        cur.execute(
            """CREATE TABLE IF NOT EXISTS password_reset_tokens (
                   token_hash TEXT PRIMARY KEY,
                   email      TEXT NOT NULL,
                   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                   expires_at TIMESTAMPTZ NOT NULL,
                   used_at    TIMESTAMPTZ
               )"""
        )


def _ensure_unique_constraints() -> None:
    """Let the database, not just the routes, enforce the one-per-person rules.

    The routes check for duplicates first, for a friendly message, but two
    requests can both pass that check at once. These indexes make the second
    insert fail instead, and the routes turn that into the same 409.

    `sign_ups.id` also gets an identity default: it used to be MAX(id) + 1,
    which hands two simultaneous sign-ups the same id.
    """
    with db_cursor(commit=True) as cur:
        cur.execute(
            """SELECT is_identity FROM information_schema.columns
               WHERE table_schema = current_schema()
                 AND table_name = 'sign_ups' AND column_name = 'id'"""
        )
        if cur.fetchone()[0] == "NO":
            cur.execute(
                "ALTER TABLE sign_ups ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY"
            )
            # Start after the existing rows, which were numbered by hand.
            cur.execute(
                """SELECT setval(pg_get_serial_sequence('sign_ups', 'id'),
                                 COALESCE(MAX(id), 0) + 1, false)
                   FROM sign_ups"""
            )
        cur.execute(
            """CREATE UNIQUE INDEX IF NOT EXISTS sign_ups_email_key
               ON sign_ups (LOWER(email_address))"""
        )
        # Partial: teachers and community members all store a blank ID.
        cur.execute(
            """CREATE UNIQUE INDEX IF NOT EXISTS sign_ups_student_id_key
               ON sign_ups (student_id) WHERE student_id <> ''"""
        )
        cur.execute(
            """CREATE UNIQUE INDEX IF NOT EXISTS coordinators_email_key
               ON coordinators (LOWER(email))"""
        )


def _hash_reset_token(token: str) -> str:
    # A plain hash (not bcrypt) is enough here: the token is 256 random bits,
    # so there is nothing to brute-force, and it has to be looked up by value.
    return hashlib.sha256(token.encode()).hexdigest()


def _send_email(
    to: str,
    subject: str,
    html_body: str,
    text_body: str,
    attachments: list[dict] | None = None,
) -> None:
    """Send one email through Resend. Runs as a background task.

    Every email ends with how to reach the drive, added here so no email can
    leave it out. Failures are logged, not raised: by the time this runs the
    response has already gone out, so there is no one to report them to.
    """
    html_body += (
        '<p style="color:#6b6b6b;font-size:13px">Questions? Email '
        f'<a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>.</p>'
    )
    text_body += f"\nQuestions? Email {CONTACT_EMAIL}.\n"
    if not RESEND_API_KEY:
        if os.environ.get("APP_ENV") == "production":
            logger.error("RESEND_API_KEY is not set; no email sent to %s.", to)
        else:
            logger.warning(
                "RESEND_API_KEY is not set. Email to %s (%s):\n%s", to, subject, text_body
            )
        return

    params = {
        "from": EMAIL_FROM,
        "to": [to],
        "subject": subject,
        "html": html_body,
        "text": text_body,
        # A fresh ID per email stops Gmail threading it with earlier ones
        # that share the subject. Threaded, it hides whatever repeats an
        # earlier message (the choices, the consent-form steps) behind "…".
        "headers": {"X-Entity-Ref-ID": secrets.token_hex(16)},
    }
    if attachments:
        params["attachments"] = attachments
    if CONTACT_EMAIL:
        params["reply_to"] = CONTACT_EMAIL
    try:
        resend.api_key = RESEND_API_KEY
        resend.Emails.send(params)
    except Exception:
        logger.exception("Could not send %r to %s", subject, to)


def _first_name(name: str) -> str:
    """The first word of a name, capitalised, for a greeting.

    Only the first letter is raised; the rest is left alone so names like
    "DeShawn" keep their own capitals.
    """
    words = name.split()
    if not words:
        return "there"
    return words[0][0].upper() + words[0][1:]


def _send_reset_email(to: str, full_name: str, link: str) -> None:
    first_name = _first_name(full_name)
    _send_email(
        to,
        "Reset your MVHS Blood Drive password",
        (
            f"<p>Hi {html.escape(first_name)},</p>"
            "<p>Someone asked to reset the password for your MVHS Blood "
            "Drive coordinator account. Use the link below to choose a new "
            f"one. It expires in {RESET_TOKEN_EXPIRE_MINUTES} minutes.</p>"
            f'<p><a href="{html.escape(link)}">Reset your password</a></p>'
            "<p>If you didn't ask for this, you can ignore this email and "
            "your password will stay the same.</p>"
        ),
        (
            f"Hi {first_name},\n\n"
            "Someone asked to reset the password for your MVHS Blood Drive "
            "coordinator account. Use the link below to choose a new one. "
            f"It expires in {RESET_TOKEN_EXPIRE_MINUTES} minutes.\n\n"
            f"{link}\n\n"
            "If you didn't ask for this, you can ignore this email and your "
            "password will stay the same.\n"
        ),
    )


@app.post("/forgot-password", dependencies=[rate_limit("forgot-password", 5, 600)])
def forgot_password(body: ForgotPassword, background: BackgroundTasks):
    """Email a reset link, if an account exists for the address.

    The response is the same either way, and the email goes out in the
    background, so neither the reply nor its timing reveals which addresses
    have accounts.
    """
    with db_cursor(commit=True) as cur:
        cur.execute(
            "SELECT email, full_name FROM coordinators WHERE LOWER(email) = LOWER(%s)",
            (body.email.strip(),),
        )
        row = cur.fetchone()

        if row is not None:
            email, full_name = row
            cur.execute(
                """SELECT COUNT(*) FROM password_reset_tokens
                   WHERE email = %s AND created_at > NOW() - INTERVAL '1 hour'""",
                (email,),
            )
            if cur.fetchone()[0] < MAX_RESET_REQUESTS_PER_HOUR:
                token = secrets.token_urlsafe(32)
                cur.execute(
                    """INSERT INTO password_reset_tokens (token_hash, email, expires_at)
                       VALUES (%s, %s, NOW() + %s * INTERVAL '1 minute')""",
                    (_hash_reset_token(token), email, RESET_TOKEN_EXPIRE_MINUTES),
                )
                link = f"{FRONTEND_URL}/coordinators/reset-password?token={token}"
                background.add_task(_send_reset_email, email, full_name, link)

    return {"message": "If an account exists for that email, a reset link is on its way."}


@app.post("/reset-password", dependencies=[rate_limit("reset-password", 10, 600)])
def reset_password(body: ResetPassword):
    """Set a new password using a link from /forgot-password.

    A token works once. Using it also retires every other outstanding link for
    the account, so an older email left in an inbox can't be used afterwards.
    """
    if len(body.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters.",
        )

    with db_cursor(commit=True) as cur:
        # Locked so two submits of the same link can't both succeed.
        cur.execute(
            """SELECT email FROM password_reset_tokens
               WHERE token_hash = %s AND used_at IS NULL AND expires_at > NOW()
               FOR UPDATE""",
            (_hash_reset_token(body.token.strip()),),
        )
        row = cur.fetchone()
        if row is None:
            raise HTTPException(
                status_code=400,
                detail="This reset link is invalid or has expired. Request a new one.",
            )

        email = row[0]
        cur.execute(
            "UPDATE coordinators SET password_hash = %s WHERE email = %s",
            (hash_password(body.password), email),
        )
        cur.execute(
            """UPDATE password_reset_tokens SET used_at = NOW()
               WHERE email = %s AND used_at IS NULL""",
            (email,),
        )

    return {"message": "Your password has been reset."}


MIN_SIGN_UP_AGE = 16


def _insert_sign_up(
    *,
    full_name: str,
    preferred_name: str | None,
    email_address: str,
    participant_type: str,
    student_id: str,
    age: int,
    grade: str,
    first_choice: str,
    second_choice: str,
    third_choice: str,
    how_hear: str | None = None,
    agreement_signature: str | None = None,
    choice_classes: tuple[str | None, str | None, str | None] = (None, None, None),
) -> SignUpRow:
    """Store one sign-up of any participant type, rejecting duplicates.

    Shared by the student and adult routes so the duplicate rules and the
    column list live in one place.
    """
    email_address = email_address.strip()
    student_id = student_id.strip()

    # Checked here rather than on the models: this is the schedule, and a
    # sign-up for a time that doesn't exist can never be confirmed.
    choices = (first_choice, second_choice, third_choice)
    if any(choice not in VALID_TIME_SLOTS for choice in choices):
        raise HTTPException(status_code=400, detail="Choose three times from the schedule.")
    if participant_type == "student" and any(
        choice in ADULT_ONLY_TIME_SLOTS for choice in choices
    ):
        raise HTTPException(
            status_code=400,
            detail="That time is for teachers and community members only.",
        )
    if len(set(choices)) != len(choices):
        raise HTTPException(status_code=400, detail="Choose three different times.")

    with db_cursor(commit=True) as cur:
        # One sign-up per person: a repeat is nearly always a double submit or
        # someone refilling the form, not a second donor. Email is matched
        # case-insensitively since Foo@ and foo@ reach the same inbox.
        cur.execute(
            "SELECT 1 FROM sign_ups WHERE LOWER(email_address) = LOWER(%s)",
            (email_address,),
        )
        if cur.fetchone() is not None:
            raise HTTPException(
                status_code=409,
                detail="A sign-up already exists for that email address.",
            )

        # Student ID is checked too, so a second email can't get round the
        # rule above. Skipped when blank: teachers and community members have
        # no ID, and every one of them would otherwise collide on "".
        if student_id:
            cur.execute("SELECT 1 FROM sign_ups WHERE student_id = %s", (student_id,))
            if cur.fetchone() is not None:
                raise HTTPException(
                    status_code=409,
                    detail="A sign-up already exists for that student ID.",
                )

        try:
            cur.execute(
                f"""
                INSERT INTO sign_ups (
                    full_name, preferred_name, is_student, participant_type,
                    student_id, age, timestamp, email_address, grade, confirmed,
                    time_slot, first_choice, second_choice, third_choice,
                    how_hear, agreement_signature,
                    first_choice_class, second_choice_class, third_choice_class
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s)
                RETURNING {SIGN_UP_COLUMNS}
                """,
                (
                    # Preferred name is kept as typed: title-casing would
                    # mangle names like "DJ" or "McKenzie".
                    str.title(full_name), preferred_name or None,
                    participant_type == "student",
                    participant_type, student_id, age, datetime.now(timezone.utc),
                    email_address, grade, False,
                    # time_slot is seeded with the first choice rather than left
                    # blank; the row is unconfirmed, so the dashboard ignores it
                    # until a coordinator assigns one. Kept as-is to match the
                    # existing rows.
                    first_choice,
                    first_choice, second_choice, third_choice,
                    how_hear, agreement_signature,
                    *choice_classes,
                )
            )
        except psycopg2.errors.UniqueViolation as err:
            # Lost a race with an identical sign-up that passed the checks
            # above at the same moment.
            constraint = err.diag.constraint_name
            if constraint in ("sign_ups_email_key", "sign_ups_student_id_key"):
                what = "student ID" if constraint == "sign_ups_student_id_key" else "email address"
                raise HTTPException(
                    status_code=409,
                    detail=f"A sign-up already exists for that {what}.",
                )
            # An id collision: only possible if an older deploy still running
            # alongside this one numbered a row by hand. The failed insert
            # advanced the sequence, so trying again gets a fresh id.
            raise HTTPException(
                status_code=503,
                detail="Something went wrong saving your sign-up. Please try again.",
            )
        created = _row_to_sign_up(cur.fetchone())

    # Lets an open dashboard show the new pending sign-up without a refresh.
    broker.publish("sign_up.created", created.model_dump(mode="json"))
    # The stored row rather than the submitted one, so the response reflects
    # the name and email as actually saved (capitalised, trimmed).
    return created


# ── Sign-up confirmation email ─────────────────────────────────────────

# When donors are told their assigned time will arrive. Mirrored by
# SLOT_NOTICE_DEADLINE in frontend/src/timeSlots.js.
SLOT_NOTICE_DEADLINE = "10/14 at 8:00 AM"

# Students under this age must bring a signed parent consent form. Mirrors
# CONSENT_REQUIRED_UNDER in frontend/src/CompletedStudentForm.jsx.
CONSENT_REQUIRED_UNDER_AGE = 17

# Stanford Blood Center's consent form, attached to the confirmation email.
# Copies of the PDFs in frontend/public/: the backend is deployed on its own
# and can't reach those. Replace both copies together if SBC issues a new
# version, since they only accept the current one.
CONSENT_FORM_DIR = Path(__file__).parent / "attachments"
CONSENT_FORM_FILES = (
    "05-FX1-Consent-for-Minor-to-Donate-Blood-Eng.pdf",
    "05-FX1S-Consent-for-Minor-to-Donate-Blood-Sp.pdf",
)


# Each period's color, as on the dashboard. Mirrors PERIOD_COLORS in
# frontend/src/timeSlots.js; keep the two in step.
PERIOD_COLORS = {
    "Before school": "#CFD3D8",
    "Period 2": "#B8D8D8",
    "Period 2/Tutorial": "#C7DBDD",
    "Tutorial": "#EEF5DB",
    "Brunch/Period 4": "#DEDDF8",
    "Period 4": "#EFE4F1",
    "Period 4/Lunch": "#EDD3E2",
    "Lunch": "#DDEAD9",
    "Lunch/Period 6": "#FFFBE9",
    "Period 6": "#FFEEE9",
}


def _slot_highlight(slot: str) -> str:
    """The slot's period color half-way to white: the dashboard's time-column
    shade. Mixed here since email clients don't support CSS color-mix()."""
    period = slot.split(" - ", 1)[0]
    base = PERIOD_COLORS.get(period, "#ECECEC").lstrip("#")
    channels = (int(base[i : i + 2], 16) for i in (0, 2, 4))
    return "#" + "".join(f"{(c + 255) // 2:02X}" for c in channels)


def _consent_form_attachments() -> list[dict]:
    return [
        {
            "filename": name,
            "content": base64.b64encode((CONSENT_FORM_DIR / name).read_bytes()).decode(),
        }
        for name in CONSENT_FORM_FILES
    ]


def _send_sign_up_email(sign_up: SignUpRow) -> None:
    """Confirm a new sign-up, with the consent form attached for minors."""
    needs_consent = (
        sign_up.participant_type == "student"
        and sign_up.age < CONSENT_REQUIRED_UNDER_AGE
    )
    first_name = _first_name(sign_up.preferred_name or sign_up.full_name)
    choices = (sign_up.first_choice, sign_up.second_choice, sign_up.third_choice)
    labels = ("1st choice", "2nd choice", "3rd choice")

    html_body = (
        f"<p>Hi {html.escape(first_name)},</p>"
        "<p>Thanks for signing up for the MVHS Stanford Blood Drive. "
        "These are the times you asked for:</p>"
        "<ul>"
        + "".join(
            f'<li><span style="background-color:{_slot_highlight(choice)}">'
            f"<strong>{label}:</strong> {html.escape(choice)}</span></li>"
            for label, choice in zip(labels, choices)
        )
        + "</ul>"
        "<p>A coordinator will assign you one of these times, and "
        f"<strong>we'll email it to you by {SLOT_NOTICE_DEADLINE}</strong>.</p>"
    )
    text_body = (
        f"Hi {first_name},\n\n"
        "Thanks for signing up for the MVHS Stanford Blood Drive. "
        "These are the times you asked for:\n\n"
        + "".join(f"  {label}: {choice}\n" for label, choice in zip(labels, choices))
        + "\nA coordinator will assign you one of these times, and we'll email "
        f"it to you by {SLOT_NOTICE_DEADLINE}.\n"
    )

    if needs_consent:
        html_body += (
            '<p><strong style="background-color:#fcefb4">You must bring a '
            "signed parent consent form to your "
            "appointment, or you won't be allowed to donate.</strong> The form "
            "is attached in English and Spanish.</p>"
            "<ol>"
            "<li>Print the form.</li>"
            "<li>Have your parent or legal guardian fill out and sign Section 1.</li>"
            "<li>Fill out and sign Section 2 yourself.</li>"
            "<li>Bring the signed paper form with you to your appointment.</li>"
            "</ol>"
            "<p>Both signatures "
            '<strong style="background-color:#fcefb4">must be in blue or black '
            "ballpoint pen.</strong> "
            "Pencil, marker, other ink colors and correction fluid aren't "
            "accepted, and a form filled out that way won't count.</p>"
        )
        text_body += (
            "\nYOU MUST BRING A SIGNED PARENT CONSENT FORM TO YOUR APPOINTMENT, "
            "OR YOU WON'T BE ALLOWED TO DONATE. The form is attached in English "
            "and Spanish.\n\n"
            "  1. Print the form.\n"
            "  2. Have your parent or legal guardian fill out and sign Section 1.\n"
            "  3. Fill out and sign Section 2 yourself.\n"
            "  4. Bring the signed paper form with you to your appointment.\n\n"
            "Both signatures must be in blue or black ballpoint pen. Pencil, "
            "marker, other ink colors and correction fluid aren't accepted, and "
            "a form filled out that way won't count.\n"
        )

    html_body += (
        "<p>If you can't make your appointment, need to reschedule, or find "
        "out you can't donate, email "
        f'<a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>.</p>'
    )
    text_body += (
        "\nIf you can't make your appointment, need to reschedule, or find out "
        f"you can't donate, email {CONTACT_EMAIL}.\n"
    )

    html_body += "<p>See you at the drive,<br>MVHS Blood Drive</p>"
    text_body += "\nSee you at the drive,\nMVHS Blood Drive\n"

    _send_email(
        sign_up.email_address,
        "You're signed up for the MVHS Blood Drive",
        html_body,
        text_body,
        _consent_form_attachments() if needs_consent else None,
    )


@app.post('/student-sign-up', dependencies=[rate_limit("sign-up", 40, 600)])
def create_student_sign_up(sign_up: StudentSignUp, background: BackgroundTasks):
    if sign_up.age < MIN_SIGN_UP_AGE:
        raise HTTPException(
            status_code=400,
            detail=f"Must be at least {MIN_SIGN_UP_AGE} years old to sign up.",
        )

    created = _insert_sign_up(
        full_name=sign_up.full_name,
        preferred_name=sign_up.preferred_name,
        email_address=sign_up.email_address,
        participant_type="student",
        student_id=sign_up.student_id,
        age=sign_up.age,
        grade=sign_up.grade,
        first_choice=sign_up.first_choice,
        second_choice=sign_up.second_choice,
        third_choice=sign_up.third_choice,
        how_hear=sign_up.how_hear,
        agreement_signature=sign_up.agreement_signature,
        choice_classes=tuple(c.as_text() for c in sign_up.choice_classes),
    )
    background.add_task(_send_sign_up_email, created)
    return created


@app.post('/adult-sign-up', dependencies=[rate_limit("sign-up", 40, 600)])
def create_adult_sign_up(sign_up: AdultSignUp, background: BackgroundTasks):
    """Register a teacher or community member.

    They give only a name, an email and three choices; the student-only
    columns are stored blank (see NO_STUDENT_ID and friends).
    """
    created = _insert_sign_up(
        full_name=sign_up.full_name,
        preferred_name=sign_up.preferred_name,
        email_address=sign_up.email_address,
        participant_type=sign_up.participant_type,
        student_id=NO_STUDENT_ID,
        age=NO_AGE,
        grade=NO_GRADE,
        first_choice=sign_up.first_choice,
        second_choice=sign_up.second_choice,
        third_choice=sign_up.third_choice,
        how_hear=sign_up.how_hear,
        agreement_signature=sign_up.agreement_signature,
    )
    background.add_task(_send_sign_up_email, created)
    return created


SIGN_UP_COLUMNS = """
    id, full_name, is_student, student_id, age, email_address,
    grade, confirmed, time_slot, first_choice, second_choice, third_choice,
    participant_type, time_in, time_canteen, time_out, deferred,
    attendance_cleared, preferred_name, how_hear, agreement_signature,
    first_choice_class, second_choice_class, third_choice_class
"""


def _row_to_sign_up(row) -> SignUpRow:
    return SignUpRow(
        id=row[0], full_name=row[1], is_student=row[2], student_id=row[3],
        age=row[4], email_address=row[5], grade=row[6], confirmed=row[7],
        time_slot=row[8], first_choice=row[9], second_choice=row[10],
        third_choice=row[11],
        # Coalesced for safety: a row written between the ALTER and the
        # backfill would otherwise arrive as None and fail validation.
        participant_type=row[12] or ("student" if row[2] else "teacher"),
        time_in=row[13], time_canteen=row[14], time_out=row[15],
        # Defaulted rather than passed through: the columns are added NOT NULL
        # DEFAULT FALSE, but a row read mid-migration could still be None.
        deferred=bool(row[16]), attendance_cleared=bool(row[17]),
        preferred_name=row[18],
        how_hear=row[19], agreement_signature=row[20],
        first_choice_class=row[21], second_choice_class=row[22],
        third_choice_class=row[23],
    )


def _sse_frame(event_type: str, data: dict) -> str:
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


@app.get("/events")
async def stream_events(_: str = Depends(get_current_coordinator)):
    """Push sign-up changes to open dashboards as Server-Sent Events.

    Authenticated like every other coordinator route, which means the client
    has to read it with `fetch` — `EventSource` cannot set an Authorization
    header, and putting the JWT in the query string would log it.
    """

    async def stream():
        async with broker.subscribe() as queue:
            # Lets the client distinguish "connected" from "still dialling".
            yield _sse_frame("ready", {})
            while True:
                try:
                    event_type, data = await asyncio.wait_for(
                        queue.get(), timeout=SSE_KEEPALIVE_SECONDS
                    )
                except TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                yield _sse_frame(event_type, data)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Tells reverse proxies not to buffer, which would defeat streaming.
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/sign-ups", response_model=list[SignUpRow])
def list_sign_ups(_: str = Depends(get_current_coordinator)):
    """Every sign-up. The dashboard splits them into pending vs confirmed."""
    with db_cursor() as cur:
        cur.execute(f"SELECT {SIGN_UP_COLUMNS} FROM sign_ups ORDER BY id")
        rows = cur.fetchall()
    return [_row_to_sign_up(row) for row in rows]


# Positions available per slot. 8:15 AM (teachers and community members only)
# seats six, then it alternates 6, 4, 6, 4... from 8:30 AM, so every half hour
# from there seats ten. Mirrored by BASE_CAPACITY in frontend/src/timeSlots.js.
#
# Coordinators may add positions on top of these, but never remove below them:
# this is the floor the drive was planned around, so it is the lower bound
# enforced by /slot-capacity.
BASE_SLOT_CAPACITY = {
    "Before school - 8:15 AM": 6,
    "Period 2 - 8:30 AM": 6,
    "Period 2 - 8:45 AM": 4,
    "Period 2 - 9:00 AM": 6,
    "Period 2 - 9:15 AM": 4,
    "Period 2 - 9:30 AM": 6,
    "Period 2 - 9:45 AM": 4,
    "Period 2/Tutorial - 10:00 AM": 6,
    "Tutorial - 10:15 AM": 4,
    "Tutorial - 10:30 AM": 6,
    "Tutorial - 10:45 AM": 4,
    "Brunch/Period 4 - 11:00 AM": 6,
    "Period 4 - 11:15 AM": 4,
    "Period 4 - 11:30 AM": 6,
    "Period 4 - 11:45 AM": 4,
    "Period 4 - 12:00 PM": 6,
    "Period 4 - 12:15 PM": 4,
    "Period 4/Lunch - 12:30 PM": 6,
    "Lunch - 12:45 PM": 4,
    "Lunch - 1:00 PM": 6,
    "Lunch/Period 6 - 1:15 PM": 4,
    "Period 6 - 1:30 PM": 6,
    "Period 6 - 1:45 PM": 4,
    "Period 6 - 2:00 PM": 6,
    "Period 6 - 2:15 PM": 4,
}

DEFAULT_CAPACITY = 1

# A single slot can't grow without bound — an upper stop keeps a stuck "+" from
# turning one time into an unschedulable pile.
MAX_SLOT_CAPACITY = 20

# Canonical schedule, and the allow-list for coordinator reassignment. Derived
# from the capacity table above so the two can never drift apart.
VALID_TIME_SLOTS = frozenset(BASE_SLOT_CAPACITY)

# Slots students can't request: teachers and community members only. Still on
# the schedule, so coordinators see and assign them like any other. Mirrored
# by `adultsOnly` in frontend/src/timeSlots.js.
ADULT_ONLY_TIME_SLOTS = frozenset({"Before school - 8:15 AM"})


def _ensure_slot_capacity_table() -> None:
    """Create the capacity override table if it isn't there yet.

    Only slots a coordinator has actually changed get a row; everything else
    falls back to BASE_SLOT_CAPACITY, so an empty table is the correct
    starting state and no seeding step is needed.
    """
    with db_cursor(commit=True) as cur:
        cur.execute(
            """CREATE TABLE IF NOT EXISTS slot_capacity (
                   time_slot TEXT PRIMARY KEY,
                   capacity  INTEGER NOT NULL
               )"""
        )


def _ensure_participant_type_column() -> None:
    """Add `participant_type` to sign_ups, backfilling from `is_student`.

    `is_student` is a boolean and so cannot distinguish teachers from community
    members. It is kept in step on write rather than dropped, since existing
    rows and the old client both still read it.
    """
    with db_cursor(commit=True) as cur:
        cur.execute(
            """ALTER TABLE sign_ups
               ADD COLUMN IF NOT EXISTS participant_type VARCHAR(20)"""
        )
        # Only touches rows the column was just added for. Pre-existing rows
        # are all students, and anything already set is left alone.
        cur.execute(
            """UPDATE sign_ups
               SET participant_type = CASE WHEN is_student THEN 'student'
                                           ELSE 'teacher' END
               WHERE participant_type IS NULL"""
        )


# The timestamp columns, and the allow-list for /day-of so a client cannot
# name an arbitrary column.
#
# `time_canteen` is no longer stamped: time in the canteen is derived as
# time_out - time_in on the client. The column is kept rather than dropped —
# it holds no data, dropping it is the one destructive migration here, and
# leaving it costs nothing if a separate canteen stamp is ever wanted back.
DAY_OF_TIME_FIELDS = ("time_in", "time_canteen", "time_out")


def _ensure_day_of_columns() -> None:
    """Add the day-of operational columns to sign_ups.

    Additive and nullable, so this can land well before the drive: phase-1
    code ignores the new columns entirely and existing rows read as "nothing
    has happened yet", which is exactly right before the day.
    """
    with db_cursor(commit=True) as cur:
        for column in DAY_OF_TIME_FIELDS:
            # TIMESTAMPTZ, not TIMESTAMP: a time stamped on the gym tablet must
            # not be re-read as UTC on a coordinator's laptop.
            cur.execute(
                f"""ALTER TABLE sign_ups
                    ADD COLUMN IF NOT EXISTS {column} TIMESTAMPTZ"""
            )
        cur.execute(
            """ALTER TABLE sign_ups
               ADD COLUMN IF NOT EXISTS deferred BOOLEAN NOT NULL DEFAULT FALSE"""
        )
        cur.execute(
            """ALTER TABLE sign_ups
               ADD COLUMN IF NOT EXISTS attendance_cleared BOOLEAN
               NOT NULL DEFAULT FALSE"""
        )


def _ensure_student_agreement_columns() -> None:
    """Add the signature from the end of the sign-up forms.

    Nullable: rows from before it existed have none. (`how_hear`, the other
    answer there, was added to the database by hand.)
    """
    with db_cursor(commit=True) as cur:
        # The name they typed to agree to show up on time, tell their teacher,
        # and reply to their confirmation email if plans change.
        cur.execute(
            """ALTER TABLE sign_ups
               ADD COLUMN IF NOT EXISTS agreement_signature VARCHAR(50)"""
        )


def _ensure_choice_class_columns() -> None:
    """Add the class a student would miss at each of their three choices.

    Nullable: adults have none, and rows from before they were asked have
    none either. Safe alongside running the same ALTER by hand.
    """
    with db_cursor(commit=True) as cur:
        cur.execute(
            """ALTER TABLE sign_ups
               ADD COLUMN IF NOT EXISTS first_choice_class TEXT,
               ADD COLUMN IF NOT EXISTS second_choice_class TEXT,
               ADD COLUMN IF NOT EXISTS third_choice_class TEXT"""
        )


def _base_capacity(time_slot: str) -> int:
    return BASE_SLOT_CAPACITY.get(time_slot, DEFAULT_CAPACITY)


def _effective_capacity(time_slot: str, override: int | None) -> int:
    """A coordinator override, but never below the base.

    Overrides are stored as absolute numbers, so one saved before the base was
    raised would otherwise pull the slot back under its new floor.
    """
    base = _base_capacity(time_slot)
    return base if override is None else max(override, base)


def _capacity_overrides(cur) -> dict[str, int]:
    """Coordinator-set capacities, keyed by slot. Absent means "use the base"."""
    cur.execute("SELECT time_slot, capacity FROM slot_capacity")
    return {row[0]: row[1] for row in cur.fetchall()}


def _capacity_for(cur, time_slot: str) -> int:
    cur.execute(
        "SELECT capacity FROM slot_capacity WHERE time_slot = %s", (time_slot,)
    )
    row = cur.fetchone()
    return _effective_capacity(time_slot, row[0] if row is not None else None)


def _assert_slot_has_room(cur, time_slot: str, moving_id: int) -> None:
    """Reject the write if the destination slot has no room left.

    `moving_id` is excluded so re-confirming someone already in the slot
    does not count them against themselves.
    """
    capacity = _capacity_for(cur, time_slot)
    cur.execute(
        """SELECT COUNT(*) FROM sign_ups
           WHERE confirmed = TRUE AND time_slot = %s AND id <> %s""",
        (time_slot, moving_id),
    )
    if cur.fetchone()[0] >= capacity:
        plural = "appointment" if capacity == 1 else "appointments"
        raise HTTPException(
            status_code=409,
            detail=f"{time_slot} is full ({capacity} {plural} maximum).",
        )


@app.get("/slot-capacity", response_model=dict[str, int])
def list_slot_capacity(_: str = Depends(get_current_coordinator)):
    """Effective capacity for every slot: the base, plus any override."""
    with db_cursor() as cur:
        overrides = _capacity_overrides(cur)
    return {
        slot: _effective_capacity(slot, overrides.get(slot))
        for slot in VALID_TIME_SLOTS
    }


@app.patch("/slot-capacity/{time_slot:path}", response_model=SlotCapacityRow)
def set_slot_capacity(
    time_slot: str,
    change: CapacityChange,
    _: str = Depends(get_current_coordinator),
):
    """Add or remove a position on one slot.

    Two floors apply. Capacity never drops below what the drive was planned
    around (BASE_SLOT_CAPACITY), and never below the number of people already
    confirmed into the slot — removing a position out from under someone who
    holds it would silently orphan their appointment.
    """
    if time_slot not in VALID_TIME_SLOTS:
        raise HTTPException(status_code=404, detail="Unknown time slot")

    base = _base_capacity(time_slot)

    with db_cursor(commit=True) as cur:
        # Locked for the transaction so two coordinators clicking "+" at once
        # can't both read the same current value and each write base + 1.
        cur.execute(
            "SELECT capacity FROM slot_capacity WHERE time_slot = %s FOR UPDATE",
            (time_slot,),
        )
        row = cur.fetchone()
        current = _effective_capacity(time_slot, row[0] if row is not None else None)
        target = current + change.delta

        if target < base:
            plural = "position" if base == 1 else "positions"
            raise HTTPException(
                status_code=409,
                detail=(
                    f"{time_slot} started with {base} {plural}. "
                    "You can add positions, but not remove the original ones."
                ),
            )

        if target > MAX_SLOT_CAPACITY:
            raise HTTPException(
                status_code=409,
                detail=f"{time_slot} can hold at most {MAX_SLOT_CAPACITY} appointments.",
            )

        cur.execute(
            """SELECT COUNT(*) FROM sign_ups
               WHERE confirmed = TRUE AND time_slot = %s""",
            (time_slot,),
        )
        booked = cur.fetchone()[0]
        if target < booked:
            plural = "appointment is" if booked == 1 else "appointments are"
            raise HTTPException(
                status_code=409,
                detail=(
                    f"{booked} {plural} already booked into {time_slot}. "
                    "Move them elsewhere before removing the position."
                ),
            )

        cur.execute(
            """INSERT INTO slot_capacity (time_slot, capacity) VALUES (%s, %s)
               ON CONFLICT (time_slot) DO UPDATE SET capacity = EXCLUDED.capacity""",
            (time_slot, target),
        )

    updated = SlotCapacityRow(time_slot=time_slot, capacity=target, base=base)
    # Keeps other open dashboards' schedules in step, the same way row edits do.
    broker.publish("capacity.updated", updated.model_dump(mode="json"))
    return updated


@app.patch("/sign-ups/{sign_up_id}/confirm", response_model=SignUpRow)
def confirm_sign_up(
    sign_up_id: int,
    confirmation: ConfirmSignUp,
    _: str = Depends(get_current_coordinator),
):
    """Assign a time slot and mark the sign-up confirmed.

    The slot must be one the person actually requested, so a stale dashboard
    cannot book someone into a time they never picked.
    """
    with db_cursor(commit=True) as cur:
        cur.execute(
            "SELECT first_choice, second_choice, third_choice FROM sign_ups WHERE id = %s",
            (sign_up_id,),
        )
        choices = cur.fetchone()
        if choices is None:
            raise HTTPException(status_code=404, detail="Sign-up not found")

        if confirmation.time_slot not in choices:
            raise HTTPException(
                status_code=400,
                detail="Time slot must be one of the requested choices",
            )

        _assert_slot_has_room(cur, confirmation.time_slot, sign_up_id)

        cur.execute(
            f"""UPDATE sign_ups SET time_slot = %s, confirmed = TRUE
                WHERE id = %s RETURNING {SIGN_UP_COLUMNS}""",
            (confirmation.time_slot, sign_up_id),
        )
        updated = _row_to_sign_up(cur.fetchone())

    # Published outside the block: `db_cursor` commits on exit, so announcing
    # any earlier would advertise a row that could still roll back.
    broker.publish("sign_up.updated", updated.model_dump(mode="json"))
    return updated


@app.patch("/sign-ups/{sign_up_id}/unconfirm", response_model=SignUpRow)
def unconfirm_sign_up(sign_up_id: int, _: str = Depends(get_current_coordinator)):
    """Move a confirmed sign-up back to pending, so mistakes are reversible."""
    with db_cursor(commit=True) as cur:
        cur.execute(
            f"""UPDATE sign_ups SET confirmed = FALSE
                WHERE id = %s RETURNING {SIGN_UP_COLUMNS}""",
            (sign_up_id,),
        )
        row = cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Sign-up not found")
        updated = _row_to_sign_up(row)

    broker.publish("sign_up.updated", updated.model_dump(mode="json"))
    return updated


@app.get("/time-slots", response_model=list[str])
def list_time_slots():
    """The schedule the dashboard may assign into."""
    return sorted(VALID_TIME_SLOTS)


@app.patch("/sign-ups/{sign_up_id}/slot", response_model=SignUpRow)
def move_sign_up(
    sign_up_id: int,
    move: ConfirmSignUp,
    _: str = Depends(get_current_coordinator),
):
    """Reassign a confirmed sign-up to any slot on the schedule.

    Unlike /confirm this is not limited to the person's three choices — a
    coordinator rearranging the board is an intentional override — but the
    destination must still be a real slot.
    """
    if move.time_slot not in VALID_TIME_SLOTS:
        raise HTTPException(status_code=400, detail="Unknown time slot")

    with db_cursor(commit=True) as cur:
        _assert_slot_has_room(cur, move.time_slot, sign_up_id)

        cur.execute(
            f"""UPDATE sign_ups SET time_slot = %s, confirmed = TRUE
                WHERE id = %s RETURNING {SIGN_UP_COLUMNS}""",
            (move.time_slot, sign_up_id),
        )
        row = cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Sign-up not found")
        moved = _row_to_sign_up(row)

    broker.publish("sign_up.updated", moved.model_dump(mode="json"))
    return moved


def _update_day_of(sign_up_id: int, assignment: str, params: tuple) -> SignUpRow:
    """Write one day-of field and push the result to every open dashboard.

    The check-in desk and the clerk's worklist are different views of the same
    row, so a write from either has to reach the other live.
    """
    with db_cursor(commit=True) as cur:
        cur.execute(
            f"""UPDATE sign_ups SET {assignment}
                WHERE id = %s RETURNING {SIGN_UP_COLUMNS}""",
            params,
        )
        row = cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Sign-up not found")
        updated = _row_to_sign_up(row)

    broker.publish("sign_up.updated", updated.model_dump(mode="json"))
    return updated


@app.patch("/sign-ups/{sign_up_id}/day-of", response_model=SignUpRow)
def stamp_day_of(
    sign_up_id: int,
    stamp: DayOfStamp,
    _: str = Depends(get_current_coordinator),
):
    """Stamp — or correct — one of the three day-of times.

    Sending no value stamps the current time, which is the one-tap path at the
    desk. Sending an explicit value fixes a time that was missed or mistyped,
    since a volunteer will not always click at the right moment.
    """
    _assert_phase_two_open()
    # Server clock, not the tablet's: a desk device with a wrong clock would
    # otherwise write times that don't line up with the rest of the drive.
    value = stamp.value if "value" in stamp.model_fields_set else datetime.now(timezone.utc)
    return _update_day_of(
        sign_up_id, f"{stamp.field} = %s", (value, sign_up_id)
    )


@app.patch("/sign-ups/{sign_up_id}/deferred", response_model=SignUpRow)
def set_deferred(
    sign_up_id: int,
    change: DeferredChange,
    _: str = Depends(get_current_coordinator),
):
    """Mark someone as turned away.

    Deliberately a bare boolean. The reason for a deferral is health
    information, and the check-in station has no business holding it.
    """
    _assert_phase_two_open()
    return _update_day_of(
        sign_up_id, "deferred = %s", (change.deferred, sign_up_id)
    )


@app.patch("/sign-ups/{sign_up_id}/attendance", response_model=SignUpRow)
def set_attendance(
    sign_up_id: int,
    change: AttendanceChange,
    _: str = Depends(get_current_coordinator),
):
    """Record that the clerk has filed this student in the school's system.

    Separate from the timestamps on purpose: arriving and being marked off are
    different facts with different owners, and they are routinely out of step
    while the clerk works through the list.
    """
    _assert_phase_two_open()
    return _update_day_of(
        sign_up_id,
        "attendance_cleared = %s",
        (change.attendance_cleared, sign_up_id),
    )
