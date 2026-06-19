"""
tests/test_auth.py
-------------------
Unit and integration tests for authentication endpoints.
Run with: pytest tests/ -v --asyncio-mode=auto
"""
import pytest
from httpx import AsyncClient, ASGITransport

from main import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# ── Registration ──────────────────────────────────────────────────────────────
@pytest.mark.anyio
async def test_register_success(client: AsyncClient):
    payload = {
        "email": "testdoctor@hospital.com",
        "password": "SecurePass1",
        "full_name": "Dr. Test User",
        "role": "doctor",
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == payload["email"]
    assert data["role"] == "doctor"
    assert "id" in data


@pytest.mark.anyio
async def test_register_duplicate_email(client: AsyncClient):
    payload = {
        "email": "dup@hospital.com",
        "password": "SecurePass1",
        "full_name": "Dr. Dup",
        "role": "doctor",
    }
    await client.post("/api/v1/auth/register", json=payload)
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 409


@pytest.mark.anyio
async def test_register_weak_password(client: AsyncClient):
    payload = {
        "email": "weak@hospital.com",
        "password": "password",     # no uppercase, no digit
        "full_name": "Weak",
        "role": "doctor",
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422   # Pydantic validation error


@pytest.mark.anyio
async def test_register_admin_success(client: AsyncClient):
    payload = {
        "email": "adminuser@hospital.com",
        "password": "SecurePass1",
        "full_name": "Admin User",
        "role": "admin",
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == payload["email"]
    assert data["role"] == "admin"
    assert "id" in data


# ── Login ─────────────────────────────────────────────────────────────────────
@pytest.mark.anyio
async def test_login_success(client: AsyncClient):
    # Register first
    await client.post("/api/v1/auth/register", json={
        "email": "logintest@hospital.com",
        "password": "SecurePass1",
        "full_name": "Login Test",
        "role": "doctor",
    })
    response = await client.post("/api/v1/auth/login", json={
        "email": "logintest@hospital.com",
        "password": "SecurePass1",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.anyio
async def test_login_wrong_password(client: AsyncClient):
    response = await client.post("/api/v1/auth/login", json={
        "email": "logintest@hospital.com",
        "password": "WrongPass9",
    })
    assert response.status_code == 401


@pytest.mark.anyio
async def test_me_requires_auth(client: AsyncClient):
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 403


@pytest.mark.anyio
async def test_me_with_valid_token(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "email": "metest@hospital.com",
        "password": "SecurePass1",
        "full_name": "Me Test",
        "role": "doctor",
    })
    login = await client.post("/api/v1/auth/login", json={
        "email": "metest@hospital.com",
        "password": "SecurePass1",
    })
    token = login.json()["access_token"]
    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["email"] == "metest@hospital.com"


# ── Token Refresh ──────────────────────────────────────────────────────────────
@pytest.mark.anyio
async def test_token_refresh(client: AsyncClient):
    await client.post("/api/v1/auth/register", json={
        "email": "refresh@hospital.com",
        "password": "SecurePass1",
        "full_name": "Refresh Test",
        "role": "doctor",
    })
    login = await client.post("/api/v1/auth/login", json={
        "email": "refresh@hospital.com",
        "password": "SecurePass1",
    })
    refresh_token = login.json()["refresh_token"]
    response = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert response.status_code == 200
    assert "access_token" in response.json()


# ── Health Check ──────────────────────────────────────────────────────────────
@pytest.mark.anyio
async def test_health_check(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "version" in data
    assert "model_loaded" in data
