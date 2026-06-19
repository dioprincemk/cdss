"""
api/routes/auth_routes.py
--------------------------
HTTP endpoints for authentication: register, login, refresh, logout.
"""
from fastapi import APIRouter, Request

from auth.dependencies import CurrentUser, DBSession
from schemas.auth_schemas import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from services.auth_service import AuthService
from utils.audit import log_action

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(data: RegisterRequest, db: DBSession, request: Request):
    """Create a new user account."""
    svc = AuthService(db)
    user = await svc.register(data)
    await log_action(db, None, "auth.register", "user", user.id, request)
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=data.role,
        medical_license=user.medical_license,
        department=user.department,
        is_active=user.is_active,
        is_verified=user.is_verified,
        last_login=user.last_login,
        created_at=user.created_at,
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: DBSession, request: Request):
    """Authenticate and receive JWT tokens."""
    svc = AuthService(db)
    tokens = await svc.login(data)
    await log_action(db, None, "auth.login", "user", None, request, {"email": data.email})
    return tokens


@router.post("/refresh", response_model=TokenResponse)
async def refresh(data: RefreshRequest, db: DBSession):
    """Exchange a refresh token for a new access token."""
    svc = AuthService(db)
    return await svc.refresh(data.refresh_token)


@router.post("/logout", status_code=204)
async def logout(data: RefreshRequest, db: DBSession):
    """Revoke the refresh token."""
    svc = AuthService(db)
    await svc.logout(data.refresh_token)


@router.get("/me", response_model=UserResponse)
async def me(current_user: CurrentUser):
    """Return the currently authenticated user's profile."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role.name,
        medical_license=current_user.medical_license,
        department=current_user.department,
        is_active=current_user.is_active,
        is_verified=current_user.is_verified,
        last_login=current_user.last_login,
        created_at=current_user.created_at,
    )
