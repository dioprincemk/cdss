"""
api/routes/model_routes.py
---------------------------
Admin-only endpoints for AI model lifecycle management.
Upload → Validate → Activate → Deactivate
"""
import hashlib
import uuid
from pathlib import Path
from typing import List, Optional
from uuid import UUID

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import select

from ai.loaders.model_loader import validate_densenet_model
from ai.model_registry.registry import ModelRegistry, get_registry
from auth.dependencies import CurrentAdmin, DBSession
from core.config.settings import get_settings
from database.models.models import AIModel
from repositories.assessment_repository import AssessmentRepository
from utils.audit import log_action

settings = get_settings()
router = APIRouter(prefix="/models", tags=["Model Management"])

logger = logging.getLogger(__name__)

ALLOWED_MODEL_EXT = {".pth", ".pkl"}


@router.post("/upload", status_code=201)
async def upload_model(
    db: DBSession,
    current_user: CurrentAdmin,
    request: Request,
    registry: ModelRegistry = Depends(get_registry),
    name: str = Form(...),
    version: str = Form(...),
    description: Optional[str] = Form(default=None),
    architecture: str = Form(default="DenseNet121"),
    disease_classes: str = Form(...),  # JSON array string: '["Normal","Pneumonia",...]'
    input_size: str = Form(default="224"),
    file: UploadFile = File(...),
):
    """
    Upload a new AI model (.pth or .pkl).
    Validates architecture and class count before saving.
    """
    import json

    logger.info("Received model upload request: name=%s version=%s filename=%s", name, version, getattr(file, 'filename', None))

    # Parse disease classes. Accept either a JSON array string or a simple
    # comma-separated list for robustness (frontend may send either).
    try:
        classes: List[str] = json.loads(disease_classes)
        if not isinstance(classes, list) or len(classes) < 2:
            raise ValueError
    except (ValueError, json.JSONDecodeError):
        # Fallback: try comma-separated values
        try:
            classes = [s.strip() for s in disease_classes.split(',') if s.strip()]
            if len(classes) < 2:
                raise ValueError
        except Exception:
            raise HTTPException(
                status_code=400,
                detail=(
                    "disease_classes must be a valid JSON array with at least 2 classes,"
                    " or a comma-separated string like 'Normal,Pneumonia'"
                ),
            )

    # Validate file extension
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_MODEL_EXT:
        raise HTTPException(status_code=400, detail=f"Allowed model formats: {ALLOWED_MODEL_EXT}")

    # Ensure file is present and within size limits, then save
    if not file or not getattr(file, 'filename', None):
        raise HTTPException(status_code=400, detail="No model file provided")

    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read uploaded file: {e}")

    # Enforce max upload size
    if settings.max_upload_bytes and len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail=f"Uploaded file exceeds maximum size of {settings.MAX_UPLOAD_SIZE_MB} MB")
    # Parse and validate input_size (allow frontend to send empty string)
    try:
        input_size_int = int(str(input_size))
        if input_size_int <= 0:
            raise ValueError
    except Exception:
        raise HTTPException(status_code=400, detail="input_size must be a positive integer")
    checksum = hashlib.sha256(content).hexdigest()
    stored_name = f"model_{uuid.uuid4().hex[:12]}{suffix}"
    model_path = settings.MODELS_DIR / stored_name
    settings.MODELS_DIR.mkdir(parents=True, exist_ok=True)
    model_path.write_bytes(content)

    # Validate model
    is_valid, validation_log = _validate_densenet_model(model_path, len(classes))

    ai_model = AIModel(
        name=name,
        version=version,
        description=description,
        architecture=architecture,
        file_path=str(model_path),
        file_size_bytes=len(content),
        checksum_sha256=checksum,
        disease_classes=classes,
        input_size=input_size_int,
        is_active=False,
        is_validated=is_valid,
        validation_log=validation_log,
        uploaded_by=current_user.id,
    )
    db.add(ai_model)
    await db.flush()
    await db.commit()
    await log_action(db, current_user.id, "model.upload", "model", ai_model.id, request)

    return {
        "model_id": str(ai_model.id),
        "is_validated": is_valid,
        "validation_log": validation_log,
        "message": "Model uploaded. Activate it to use for inference." if is_valid else "Model uploaded but failed validation.",
    }


@router.post("/{model_id}/activate")
async def activate_model(
    model_id: UUID,
    db: DBSession,
    current_user: CurrentAdmin,
    request: Request,
    registry: ModelRegistry = Depends(get_registry),
):
    """Activate a validated model (deactivates all others)."""
    repo = AssessmentRepository(db)
    model = await repo.get_model_by_id(model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    if not model.is_validated:
        raise HTTPException(status_code=400, detail="Model has not passed validation")

    # Deactivate all models
    all_models = await repo.get_all_models()
    for m in all_models:
        m.is_active = False
    await db.flush()

    # Activate this one
    model.is_active = True
    await db.flush()
    await db.commit()

    # Load into registry
    await registry.load_model(
        model_id=str(model.id),
        model_path=Path(model.file_path),
        disease_classes=model.disease_classes,
        architecture=model.architecture,
        input_size=model.input_size,
    )
    await log_action(db, current_user.id, "model.activate", "model", model.id, request)

    return {"message": f"Model '{model.name} v{model.version}' is now active."}


@router.post("/{model_id}/deactivate")
async def deactivate_model(
    model_id: UUID,
    db: DBSession,
    current_user: CurrentAdmin,
    request: Request,
    registry: ModelRegistry = Depends(get_registry),
):
    repo = AssessmentRepository(db)
    model = await repo.get_model_by_id(model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    model.is_active = False
    await db.flush()
    await db.commit()
    await registry.unload()
    await log_action(db, current_user.id, "model.deactivate", "model", model.id, request)
    return {"message": "Model deactivated."}


@router.get("")
async def list_models(db: DBSession, current_user: CurrentAdmin):
    repo = AssessmentRepository(db)
    models = await repo.get_all_models()
    return [
        {
            "id": str(m.id),
            "name": m.name,
            "version": m.version,
            "architecture": m.architecture,
            "disease_classes": m.disease_classes,
            "is_active": m.is_active,
            "is_validated": m.is_validated,
            "file_size_bytes": m.file_size_bytes,
            "created_at": m.created_at.isoformat(),
        }
        for m in models
    ]
