from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from backend.config import settings

# Legacy single-user SQLite database (pre-Supabase endpoints). The user-owned
# Postgres schema lives in backend/db/.
engine = create_engine(
    settings.legacy_database_url,
    connect_args={"check_same_thread": False},  # SQLite only
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
