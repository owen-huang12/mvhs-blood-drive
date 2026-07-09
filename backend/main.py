from fastapi import FastAPI
from pydantic import BaseModel
from passlib.context import CryptContext
import os
from dotenv import load_dotenv
import psycopg2

load_dotenv()
DATABASE_URL = os.environ["NEON_DATABASE"]

app = FastAPI()

def get_conn():
    return psycopg2.connect(DATABASE_URL)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class CoordinatorCreate(BaseModel):
    full_name: str
    email: str
    password: str

class CoordinatorPublic(BaseModel):
    full_name: str
    email: str

@app.get("/")
def read_root():
    return {"message" : "Welcome to owens super cool fastAPI"}

@app.post("/coordinator")
def create_coordinator(coordinator: CoordinatorCreate):
    hashed = pwd_context.hash(coordinator.password)
    hashed = pwd_context.hash(coordinator.password)
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO coordinators (full_name, email, password_hash) VALUES (%s, %s, %s)",
        (coordinator.full_name, coordinator.email, hashed)
    )
    conn.commit()
    cur.close()
    conn.close()
    return

@app.put("/coordinator")
def update_coordinator(coordinator: CoordinatorCreate):
    hashed = pwd_context.hash(coordinator.password)
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO coordinators (full_name, email, password_hash)
        VALUES (%s, %s, %s)
        ON CONFLICT (email)
        DO UPDATE
            full_name = EXCLUDED.full_name
            password_hash = EXCLUDED.password_hash
        """,
        (coordinator.full_name, coordinator.email, hashed)
    )
    conn.commit()
    cur.close()
    conn.close()
    return CoordinatorPublic(full_name=coordinator.full_name, email=coordinator.email)

@app.post("/coordinator")
def change_password():
    return
