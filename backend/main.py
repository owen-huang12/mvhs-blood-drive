from curses import KEY_A1
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def get_conn():
    return psycopg2.connect(DATABASE_URL)


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

class StudentSignUp(BaseModel):
    full_name: str
    student_id: str
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


@app.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends()):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT password_hash FROM coordinators WHERE email = %s",
        (form.username)
    )
    row = cur.fetchone()
    cur.close()
    conn.close()

    if row is None or not verify_password(form.password, row[0]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    token = create_access_token({"sub": form.username})
    return {"access_token": token, "token_type": "bearer"}


@app.get("/me", response_model=CoordinatorPublic)
def get_me(email: str = Depends(get_current_coordinator)):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT full_name, email FROM coordinators WHERE email = %s", (email,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    if row is None:
        raise HTTPException(status_code=404, detail="Coordinator not found")
    return CoordinatorPublic(full_name=row[0], email=row[1])


@app.post("/coordinator", response_model=CoordinatorPublic)
def create_coordinator(coordinator: CoordinatorCreate):
    hashed = hash_password(coordinator.password)
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO coordinators (full_name, email, password_hash) VALUES (%s, %s, %s)",
        (coordinator.full_name, coordinator.email, hashed)
    )
    conn.commit()
    cur.close()
    conn.close()
    return CoordinatorPublic(full_name=coordinator.full_name, email=coordinator.email)


@app.put("/coordinator", response_model=CoordinatorPublic)
def update_coordinator(coordinator: CoordinatorCreate):
    hashed = hash_password(coordinator.password)
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO coordinators (full_name, email, password_hash)
           VALUES (%s, %s, %s)
           ON CONFLICT (email) DO UPDATE
           SET full_name = EXCLUDED.full_name,
               password_hash = EXCLUDED.password_hash
        """,
        (coordinator.full_name, coordinator.email, hashed)
    )
    conn.commit()
    cur.close()
    conn.close()
    return CoordinatorPublic(full_name=coordinator.full_name, email=coordinator.email)


@app.post('/student-sign-up')
def create_student_sign_up(sign_up: StudentSignUp):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO sign_ups (full_name, is_student, student_id, email_address, grade, confirmed, first_choice, second_choice, third_choice)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            sign_up.full_name, sign_up.is_student, sign_up.student_id,
            sign_up.email_address, sign_up.grade, sign_up.confirmed,
            sign_up.first_choice, sign_up.second_choice, sign_up.third_choice
        )
    )
    new_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return {"id": new_id, **sign_up.model_dump()}
