"""
services/auth_service.py
-------------------------
Business logic for authentication: registration, login, token refresh.
Services orchestrate repositories and don't know about HTTP.
"""
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.config.settings import get_settings
from core.security.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from database.models.models import RefreshToken, User
from repositories.user_repository import UserRepository
from schemas.auth_schemas import LoginRequest, RegisterRequest, TokenResponse

settings = get_settings()


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repo = UserRepository(db)

    async def register(self, data: RegisterRequest) -> User:
        """Register a new user. Raises 409 if email already exists."""
        existing = await self.user_repo.get_by_email(data.email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists",
            )
        role = await self.user_repo.get_role_by_name(data.role)
        if not role:
            raise HTTPException(status_code=400, detail="Invalid role")

        user = User(
            email=data.email.lower(),
            hashed_password=hash_password(data.password),
            full_name=data.full_name,
            role=role,
            medical_license=data.medical_license,
            department=data.department,
            is_verified=True,  # Auto-verify for academic demo; add email flow for production
        )
        return await self.user_repo.create(user)

    async def login(self, data: LoginRequest) -> TokenResponse:
        """Authenticate user and return access + refresh tokens."""
        user = await self.user_repo.get_by_email(data.email)
        if not user or not verify_password(data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
            )
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is deactivated. Contact administrator.",
            )

        # Update last login
        user.last_login = datetime.now(timezone.utc)
        await self.user_repo.update(user)

        access_token = create_access_token(
            subject=str(user.id),
            role=user.role.name,
        )
        raw_refresh, refresh_hash = create_refresh_token()

        # Store refresh token hash
        db_refresh = RefreshToken(
            user_id=user.id,
            token_hash=refresh_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
        self.db.add(db_refresh)
        await self.db.flush()

        return TokenResponse(
            access_token=access_token,
            refresh_token=raw_refresh,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    async def refresh(self, raw_token: str) -> TokenResponse:
        """Issue a new access token given a valid refresh token."""
        token_hash = hash_token(raw_token)
        from sqlalchemy import select
        result = await self.db.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == token_hash,
                RefreshToken.revoked == False,
                RefreshToken.expires_at > datetime.now(timezone.utc),
            )
        )
        db_refresh = result.scalar_one_or_none()
        if not db_refresh:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token",
            )
        user = await self.user_repo.get_by_id(db_refresh.user_id)
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="User not found or inactive")

        # Rotate: revoke old, issue new
        db_refresh.revoked = True
        access_token = create_access_token(subject=str(user.id), role=user.role.name)
        raw_new, new_hash = create_refresh_token()
        new_refresh = RefreshToken(
            user_id=user.id,
            token_hash=new_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
        self.db.add(new_refresh)
        await self.db.flush()

        return TokenResponse(
            access_token=access_token,
            refresh_token=raw_new,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    async def logout(self, raw_token: str) -> None:
        """Revoke a refresh token (logout)."""
        token_hash = hash_token(raw_token)
        from sqlalchemy import select
        result = await self.db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        db_token = result.scalar_one_or_none()
        if db_token:
            db_token.revoked = True
            await self.db.flush()
