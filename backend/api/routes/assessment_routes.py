"""
api/routes/assessment_routes.py
--------------------------------
Endpoints: clinical assessments, X-ray upload.
"""
import hashlib
import uuid
from pathlib import Path
from typing import List, Optional
from uuid import UUID as PyUUID

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field

from auth.dependencies import CurrentDoctor, DBSession
from core.config.settings import get_settings
from database.models.models import ClinicalAssessment, Image
from repositories.assessment_repository import AssessmentRepository
from utils.audit import log_action

settings = get_settings()
router = APIRouter(prefix="/assessments", tags=["Assessments"])

ALLOWED_MIME = {"image/png", "image/jpeg", "image/jpg"}
ALLOWED_EXT  = {".png", ".jpg", ".jpeg"}


class AssessmentCreate(BaseModel):
    patient_id: PyUUID
    chief_complaint: str = Field(min_length=5)
    symptoms: Optional[List[str]] = []
    symptom_duration: Optional[str] = None
    medical_conditions: Optional[List[str]] = []
    current_medications: Optional[List[str]] = []
    clinical_notes: Optional[str] = None
    vitals_id: Optional[PyUUID] = None


@router.post("", status_code=201)
async def create_assessment(
    data: AssessmentCreate,
    db: DBSession,
    current_user: CurrentDoctor,
    request: Request,
):
    repo = AssessmentRepository(db)
    patient = await repo.get_patient_by_id(data.patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    assessment = ClinicalAssessment(
        patient_id=data.patient_id,
        vitals_id=data.vitals_id,
        assessed_by=current_user.id,
        chief_complaint=data.chief_complaint,
        symptoms=data.symptoms,
        symptom_duration=data.symptom_duration,
        medical_conditions=data.medical_conditions,
        current_medications=data.current_medications,
        clinical_notes=data.clinical_notes,
    )
    db.add(assessment)
    await db.flush()
    await log_action(db, current_user.id, "assessment.create", "assessment", assessment.id, request)
    return {"assessment_id": str(assessment.id)}


@router.post("/{assessment_id}/upload-xray", status_code=201)
async def upload_xray(
    assessment_id: PyUUID,
    db: DBSession,
    current_user: CurrentDoctor,
    request: Request,
    file: UploadFile = File(...),
):
    """Upload and validate a chest X-ray image for an assessment."""
    repo = AssessmentRepository(db)
    assessment = await repo.get_by_id(assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Validate extension
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXT:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {ALLOWED_EXT}",
        )

    # Read and validate size
    content = await file.read()
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum: {settings.MAX_UPLOAD_SIZE_MB}MB",
        )

    # Compute SHA256 checksum
    checksum = hashlib.sha256(content).hexdigest()

    # Save file
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    dest_path = settings.UPLOAD_DIR / stored_name
    settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dest_path.write_bytes(content)

    # Get image dimensions
    from PIL import Image as PILImage
    import io
    try:
        pil_img = PILImage.open(io.BytesIO(content))
        width, height = pil_img.size
    except Exception:
        width, height = None, None

    image_record = Image(
        assessment_id=assessment_id,
        patient_id=assessment.patient_id,
        uploaded_by=current_user.id,
        original_filename=file.filename,
        stored_filename=stored_name,
        file_path=str(dest_path),
        file_size_bytes=len(content),
        mime_type=file.content_type,
        image_width=width,
        image_height=height,
        checksum_sha256=checksum,
    )
    db.add(image_record)
    await db.flush()
    await log_action(db, current_user.id, "xray.upload", "image", image_record.id, request)

    return {
        "image_id": str(image_record.id),
        "filename": stored_name,
        "size_bytes": len(content),
        "message": "X-ray uploaded successfully",
    }


@router.get("/{assessment_id}")
async def get_assessment(
    assessment_id: PyUUID,
    db: DBSession,
    current_user: CurrentDoctor,
):
    repo = AssessmentRepository(db)
    assessment = await repo.get_by_id(assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return assessment


@router.get("/patient/{patient_id}")
async def get_patient_assessments(
    patient_id: PyUUID,
    db: DBSession,
    current_user: CurrentDoctor,
):
    repo = AssessmentRepository(db)
    return await repo.get_assessments_for_patient(patient_id)
