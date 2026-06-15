"""
api/routes/user_routes.py
--------------------------
Admin endpoints for user management.
"""
from typing import List
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request

from auth.dependencies import CurrentAdmin, DBSession
from repositories.user_repository import UserRepository
from schemas.auth_schemas import UserResponse, UserUpdateRequest
from utils.audit import log_action

router = APIRouter(prefix="/users", tags=["User Management"])


@router.get("", response_model=List[UserResponse])
async def list_users(db: DBSession, current_user: CurrentAdmin):
    repo = UserRepository(db)
    users = await repo.get_all()
    return [
        UserResponse(
            id=u.id, email=u.email, full_name=u.full_name,
            role=u.role.name, medical_license=u.medical_license,
            department=u.department, is_active=u.is_active,
            is_verified=u.is_verified, last_login=u.last_login,
            created_at=u.created_at,
        )
        for u in users
    ]


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    data: UserUpdateRequest,
    db: DBSession,
    current_user: CurrentAdmin,
    request: Request,
):
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    await repo.update(user)
    await log_action(db, current_user.id, "user.update", "user", user_id, request)
    return UserResponse(
        id=user.id, email=user.email, full_name=user.full_name,
        role=user.role.name, medical_license=user.medical_license,
        department=user.department, is_active=user.is_active,
        is_verified=user.is_verified, last_login=user.last_login,
        created_at=user.created_at,
    )


@router.delete("/{user_id}", status_code=204)
async def deactivate_user(
    user_id: UUID,
    db: DBSession,
    current_user: CurrentAdmin,
    request: Request,
):
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    user.is_active = False
    await repo.update(user)
    await log_action(db, current_user.id, "user.deactivate", "user", user_id, request)
