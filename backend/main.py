from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
import bcrypt
from pydantic import BaseModel
import psycopg2

load_dotenv()

DATABASE_URL = os.environ["NEON_DATABASE"]
JWT_SECRET = os.environ["JWT_SECRET"]
ACCESS_TOKEN_EXPIRE_HOURS = 12

app = FastAPI()

# FRONTEND_ORIGIN lets the deployed frontend's URL be set per-environment
# (e.g. https://mvhs-blood-drive.vercel.app) without hardcoding it here.
_allowed_origins = [""]
if frontend_origin := os.environ.get("FRONTEND_ORIGIN"):
    _allowed_origins.append(frontend_origin)

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

class CoordinatorPublic(BaseModel):
    full_name: str
    email: str

class Token(BaseModel):
    access_token: str
    token_type: str

class SignUpRow(BaseModel):
    id: int
    full_name: str
    is_student: bool
    student_id: str
    age: int
    email_address: str
    grade: str
    confirmed: bool
    time_slot: str
    first_choice: str
    second_choice: str
    third_choice: str


class ConfirmSignUp(BaseModel):
    time_slot: str


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


# routes

@app.get("/")
def read_root():
    return {"message": "MVHS Blood Drive API"}


# TEMPORARY — diagnosing a CORS config issue in production, remove once fixed.
@app.get("/debug/cors")
def debug_cors():
    return {
        "FRONTEND_ORIGIN_raw": os.environ.get("FRONTEND_ORIGIN"),
        "allowed_origins": _allowed_origins,
    }


@app.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends()):
    with db_cursor() as cur:
        cur.execute(
            "SELECT password_hash FROM coordinators WHERE email = %s",
            (form.username,)
        )
        row = cur.fetchone()

    if row is None or not verify_password(form.password, row[0]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    token = create_access_token({"sub": form.username})
    return {"access_token": token, "token_type": "bearer"}


@app.get("/me", response_model=CoordinatorPublic)
def get_me(email: str = Depends(get_current_coordinator)):
    with db_cursor() as cur:
        cur.execute("SELECT full_name, email FROM coordinators WHERE email = %s", (email,))
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Coordinator not found")
    return CoordinatorPublic(full_name=row[0], email=row[1])


@app.post("/coordinator", response_model=CoordinatorPublic)
def create_coordinator(coordinator: CoordinatorCreate):
    hashed = hash_password(coordinator.password)
    with db_cursor(commit=True) as cur:
        cur.execute(
            "INSERT INTO coordinators (full_name, email, password_hash) VALUES (%s, %s, %s)",
            (coordinator.full_name, coordinator.email, hashed)
        )
    return CoordinatorPublic(full_name=coordinator.full_name, email=coordinator.email)


@app.put("/coordinator", response_model=CoordinatorPublic)
def update_coordinator(coordinator: CoordinatorCreate):
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


@app.post('/student-sign-up')
def create_student_sign_up(sign_up: StudentSignUp):
    with db_cursor(commit=True) as cur:
        # NOTE: races with concurrent signups. Fix is an identity column on id.
        cur.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM sign_ups")
        new_id = cur.fetchone()[0]
        cur.execute(
            """
            INSERT INTO sign_ups (
                id, full_name, is_student, student_id, age, timestamp,
                email_address, grade, confirmed, time_slot,
                first_choice, second_choice, third_choice
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                new_id, sign_up.full_name, sign_up.is_student, sign_up.student_id,
                sign_up.age, datetime.now(timezone.utc), sign_up.email_address,
                sign_up.grade, sign_up.confirmed, sign_up.first_choice,
                sign_up.first_choice, sign_up.second_choice, sign_up.third_choice
            )
        )
    return {"id": new_id, **sign_up.model_dump()}


SIGN_UP_COLUMNS = """
    id, full_name, is_student, student_id, age, email_address,
    grade, confirmed, time_slot, first_choice, second_choice, third_choice
"""


def _row_to_sign_up(row) -> SignUpRow:
    return SignUpRow(
        id=row[0], full_name=row[1], is_student=row[2], student_id=row[3],
        age=row[4], email_address=row[5], grade=row[6], confirmed=row[7],
        time_slot=row[8], first_choice=row[9], second_choice=row[10],
        third_choice=row[11],
    )


@app.get("/sign-ups", response_model=list[SignUpRow])
def list_sign_ups(_: str = Depends(get_current_coordinator)):
    """Every sign-up. The dashboard splits them into pending vs confirmed."""
    with db_cursor() as cur:
        cur.execute(f"SELECT {SIGN_UP_COLUMNS} FROM sign_ups ORDER BY id")
        rows = cur.fetchall()
    return [_row_to_sign_up(row) for row in rows]


# Positions available per slot, from the appointment spreadsheet's row counts.
# Capacity is not uniform. Mirrored by SLOT_CAPACITY in frontend/src/timeSlots.js.
SLOT_CAPACITY = {
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


def _assert_slot_has_room(cur, time_slot: str, moving_id: int) -> None:
    """Reject the write if the destination slot has no room left.

    `moving_id` is excluded so re-confirming someone already in the slot
    does not count them against themselves.
    """
    capacity = SLOT_CAPACITY.get(time_slot, DEFAULT_CAPACITY)
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
        return _row_to_sign_up(cur.fetchone())


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
        return _row_to_sign_up(row)


# Canonical schedule. Mirrors frontend/src/timeSlots.js — keep the two in sync;
# it is the allow-list for coordinator drag-and-drop reassignment.
VALID_TIME_SLOTS = frozenset({
    "Period 2 - 8:30 AM", "Period 2 - 8:45 AM", "Period 2 - 9:00 AM",
    "Period 2 - 9:15 AM", "Period 2 - 9:30 AM", "Period 2 - 9:45 AM",
    "Period 2/Tutorial - 10:00 AM",
    "Tutorial - 10:15 AM", "Tutorial - 10:30 AM", "Tutorial - 10:45 AM",
    "Brunch/Period 4 - 11:00 AM",
    "Period 4 - 11:15 AM", "Period 4 - 11:30 AM", "Period 4 - 11:45 AM",
    "Period 4 - 12:00 PM", "Period 4 - 12:15 PM",
    "Period 4/Lunch - 12:30 PM",
    "Lunch - 12:45 PM", "Lunch - 1:00 PM",
    "Lunch/Period 6 - 1:15 PM",
    "Period 6 - 1:30 PM", "Period 6 - 1:45 PM", "Period 6 - 2:00 PM",
    "Period 6 - 2:15 PM",
})


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
        return _row_to_sign_up(row)
