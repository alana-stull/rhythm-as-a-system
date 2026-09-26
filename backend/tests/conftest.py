"""
Shared fixtures. Tests never touch rhythm.db or call external APIs:
the app's DB dependency is overridden with an in-memory SQLite database,
and integration credentials are blanked before the backend is imported.
"""
import os

# Env vars take priority over .env files in pydantic-settings, so these
# must be set before anything imports backend.config.
os.environ["DATABASE_URL"] = "sqlite://"
for _key in ("OPENAI_API_KEY", "OURA_CLIENT_ID", "OURA_CLIENT_SECRET", "GCAL_CLIENT_ID", "GCAL_CLIENT_SECRET"):
    os.environ[_key] = ""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base, get_db
from backend.main import app


@pytest.fixture
def engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # one shared in-memory DB for every session
    )
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def session_factory(engine):
    return sessionmaker(bind=engine, autocommit=False, autoflush=False)


@pytest.fixture
def db(session_factory):
    session = session_factory()
    yield session
    session.close()


@pytest.fixture
def client(session_factory):
    def _get_test_db():
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _get_test_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
