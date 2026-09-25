import asyncio
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timedelta, timezone
import json
import os
import secrets

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
import bcrypt
from pydantic import BaseModel, field_validator
import psycopg2

load_dotenv()

DATABASE_URL = os.environ["NEON_DATABASE"]
JWT_SECRET = os.environ["JWT_SECRET"]
ACCESS_TOKEN_EXPIRE_HOURS = 12

# Shared secret handed to coordinators so they can register themselves.
# Read with .get rather than [] so a missing value fails registration closed
# (see _assert_invite_code) instead of taking the whole API down at boot.
COORDINATOR_INVITE_CODE = os.environ.get("COORDINATOR_INVITE_CODE")

MIN_PASSWORD_LENGTH = 8

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

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _assert_invite_code(code: str) -> None:
    """Gate coordinator self-registration behind the shared invite code.

    Without this, /coordinator is open to anyone who finds the endpoint — the
    POST mints accounts and the PUT overwrites an existing coordinator's
    password by email. compare_digest keeps the check constant-time so the
    endpoint can't be used to guess the code a character at a time.
    """
    if not COORDINATOR_INVITE_CODE:
        raise HTTPException(
            status_code=503,
            detail="Registration is closed. Ask an admin to set an invite code.",
        )
    # Stripped so a stray space or newline from copy-pasting the code doesn't
    # turn a correct code into a confusing 401.
    if not secrets.compare_digest(code.strip(), COORDINATOR_INVITE_CODE):
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

class CoordinatorCreate(BaseModel):
    full_name: str
    email: str
    password: str
    invite_code: str

class CoordinatorPublic(BaseModel):
    full_name: str
    email: str

class InviteCode(BaseModel):
    invite_code: str

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


class SignUpRow(BaseModel):
    id: int
    full_name: str
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


class StudentSignUp(BaseModel):
    full_name: str
    student_id: str
    age: int
    email_address: str
    grade: str
    first_choice: str
    second_choice: str
    third_choice: str
    is_student: bool = True
    confirmed: bool = False


class AdultSignUp(BaseModel):
    """A teacher or community member: no student ID, age or grade.

    Age is not asked for because the 16-year-old minimum is a school-student
    concern; every adult signing up here clears it by definition.
    """
    full_name: str
    email_address: str
    first_choice: str
    second_choice: str
    third_choice: str
    participant_type: str

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



@app.post("/login", response_model=Token)
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


@app.post("/coordinator/verify-invite")
def verify_invite(body: InviteCode):
    """Check an invite code on its own, so the register page can gate its form.

    This is a convenience for the UI only — /coordinator re-checks the code on
    the real request, since nothing stops a caller from skipping this step.
    """
    _assert_invite_code(body.invite_code)
    return {"valid": True}


@app.post("/coordinator", response_model=CoordinatorPublic)
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

        cur.execute(
            "INSERT INTO coordinators (full_name, email, password_hash) VALUES (%s, %s, %s)",
            (full_name, email, hashed)
        )
    return CoordinatorPublic(full_name=full_name, email=email)


@app.put("/coordinator", response_model=CoordinatorPublic)
def update_coordinator(coordinator: CoordinatorCreate):
    _assert_invite_code(coordinator.invite_code)
    hashed = hash_password(coordinator.password)
    with db_cursor(commit=True) as cur:
        cur.execute(
            """INSERT INTO coordinators (full_name, email, password_hash)
               VALUES (%s, %s, %s)
               ON CONFLICT (email) DO UPDATE
               SET full_name = EXCLUDED.full_name,
                   password_hash = EXCLUDED.password_hash
            """,
            (coordinator.full_name, coordinator.email, hashed)
        )
    return CoordinatorPublic(full_name=coordinator.full_name, email=coordinator.email)


MIN_SIGN_UP_AGE = 16


def _insert_sign_up(
    *,
    full_name: str,
    email_address: str,
    participant_type: str,
    student_id: str,
    age: int,
    grade: str,
    first_choice: str,
    second_choice: str,
    third_choice: str,
) -> SignUpRow:
    """Store one sign-up of any participant type, rejecting duplicates.

    Shared by the student and adult routes so the duplicate rules and the
    column list live in one place.
    """
    email_address = email_address.strip()
    student_id = student_id.strip()

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

        # NOTE: races with concurrent signups. Fix is an identity column on id.
        cur.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM sign_ups")
        new_id = cur.fetchone()[0]
        cur.execute(
            """
            INSERT INTO sign_ups (
                id, full_name, is_student, participant_type, student_id, age,
                timestamp, email_address, grade, confirmed, time_slot,
                first_choice, second_choice, third_choice
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                new_id, str.title(full_name), participant_type == "student",
                participant_type, student_id, age, datetime.now(timezone.utc),
                email_address, grade, False,
                # time_slot is seeded with the first choice rather than left
                # blank; the row is unconfirmed, so the dashboard ignores it
                # until a coordinator assigns one. Kept as-is to match the
                # existing rows.
                first_choice,
                first_choice, second_choice, third_choice,
            )
        )
        cur.execute(
            f"SELECT {SIGN_UP_COLUMNS} FROM sign_ups WHERE id = %s", (new_id,)
        )
        created = _row_to_sign_up(cur.fetchone())

    # Lets an open dashboard show the new pending sign-up without a refresh.
    broker.publish("sign_up.created", created.model_dump())
    # The stored row rather than the submitted one, so the response reflects
    # the name and email as actually saved (capitalised, trimmed).
    return created


@app.post('/student-sign-up')
def create_student_sign_up(sign_up: StudentSignUp):
    if sign_up.age < MIN_SIGN_UP_AGE:
        raise HTTPException(
            status_code=400,
            detail=f"Must be at least {MIN_SIGN_UP_AGE} years old to sign up.",
        )

    return _insert_sign_up(
        full_name=sign_up.full_name,
        email_address=sign_up.email_address,
        participant_type="student",
        student_id=sign_up.student_id,
        age=sign_up.age,
        grade=sign_up.grade,
        first_choice=sign_up.first_choice,
        second_choice=sign_up.second_choice,
        third_choice=sign_up.third_choice,
    )


@app.post('/adult-sign-up')
def create_adult_sign_up(sign_up: AdultSignUp):
    """Register a teacher or community member.

    They give only a name, an email and three choices; the student-only
    columns are stored blank (see NO_STUDENT_ID and friends).
    """
    return _insert_sign_up(
        full_name=sign_up.full_name,
        email_address=sign_up.email_address,
        participant_type=sign_up.participant_type,
        student_id=NO_STUDENT_ID,
        age=NO_AGE,
        grade=NO_GRADE,
        first_choice=sign_up.first_choice,
        second_choice=sign_up.second_choice,
        third_choice=sign_up.third_choice,
    )


SIGN_UP_COLUMNS = """
    id, full_name, is_student, student_id, age, email_address,
    grade, confirmed, time_slot, first_choice, second_choice, third_choice,
    participant_type, time_in, time_canteen, time_out, deferred,
    attendance_cleared
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


# Positions available per slot as originally set from the appointment
# spreadsheet's row counts. Capacity is not uniform. Mirrored by BASE_CAPACITY
# in frontend/src/timeSlots.js.
#
# Coordinators may add positions on top of these, but never remove below them:
# this is the floor the drive was planned around, so it is the lower bound
# enforced by /slot-capacity.
BASE_SLOT_CAPACITY = {
    "Period 2 - 8:30 AM": 3,
    "Period 2 - 8:45 AM": 2,
    "Period 2 - 9:00 AM": 2,
    "Period 2 - 9:15 AM": 1,
    "Period 2 - 9:30 AM": 1,
    "Period 2 - 9:45 AM": 1,
    "Period 2/Tutorial - 10:00 AM": 2,
    "Tutorial - 10:15 AM": 3,
    "Tutorial - 10:30 AM": 2,
    "Tutorial - 10:45 AM": 2,
    "Brunch/Period 4 - 11:00 AM": 2,
    "Period 4 - 11:15 AM": 2,
    "Period 4 - 11:30 AM": 1,
    "Period 4 - 11:45 AM": 1,
    "Period 4 - 12:00 PM": 1,
    "Period 4 - 12:15 PM": 1,
    "Period 4/Lunch - 12:30 PM": 2,
    "Lunch - 12:45 PM": 2,
    "Lunch - 1:00 PM": 2,
    "Lunch/Period 6 - 1:15 PM": 2,
    "Period 6 - 1:30 PM": 3,
    "Period 6 - 1:45 PM": 2,
    "Period 6 - 2:00 PM": 2,
    "Period 6 - 2:15 PM": 2,
}

DEFAULT_CAPACITY = 1

# A single slot can't grow without bound — an upper stop keeps a stuck "+" from
# turning one time into an unschedulable pile.
MAX_SLOT_CAPACITY = 20

# Canonical schedule, and the allow-list for coordinator reassignment. Derived
# from the capacity table above so the two can never drift apart.
VALID_TIME_SLOTS = frozenset(BASE_SLOT_CAPACITY)


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


def _base_capacity(time_slot: str) -> int:
    return BASE_SLOT_CAPACITY.get(time_slot, DEFAULT_CAPACITY)


def _capacity_overrides(cur) -> dict[str, int]:
    """Coordinator-set capacities, keyed by slot. Absent means "use the base"."""
    cur.execute("SELECT time_slot, capacity FROM slot_capacity")
    return {row[0]: row[1] for row in cur.fetchall()}


def _capacity_for(cur, time_slot: str) -> int:
    cur.execute(
        "SELECT capacity FROM slot_capacity WHERE time_slot = %s", (time_slot,)
    )
    row = cur.fetchone()
    return row[0] if row is not None else _base_capacity(time_slot)


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
        slot: overrides.get(slot, _base_capacity(slot))
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
        current = row[0] if row is not None else base
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
    broker.publish("capacity.updated", updated.model_dump())
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
    broker.publish("sign_up.updated", updated.model_dump())
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

    broker.publish("sign_up.updated", updated.model_dump())
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

    broker.publish("sign_up.updated", moved.model_dump())
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
