"""
api/routes/patient_routes.py
-----------------------------
CRUD endpoints for patient demographics and vitals.
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from datetime import date

from auth.dependencies import CurrentDoctor, DBSession
from database.models.models import Patient, PatientVitals
from repositories.assessment_repository import AssessmentRepository
from utils.audit import log_action

router = APIRouter(prefix="/patients", tags=["Patients"])


# ── Schemas ───────────────────────────────────────────────────────────────────
class PatientCreate(BaseModel):
    patient_id: str = Field(min_length=3, max_length=50)
    full_name: str = Field(min_length=2, max_length=255)
    date_of_birth: date
    sex: str = Field(pattern="^(male|female|other)$")
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None


class VitalsCreate(BaseModel):
    temperature: Optional[float] = Field(default=None, ge=30.0, le=45.0)
    pulse_rate: Optional[int] = Field(default=None, ge=20, le=300)
    respiratory_rate: Optional[int] = Field(default=None, ge=5, le=80)
    spo2: Optional[float] = Field(default=None, ge=50.0, le=100.0)
    systolic_bp: Optional[int] = Field(default=None, ge=50, le=300)
    diastolic_bp: Optional[int] = Field(default=None, ge=30, le=200)
    weight_kg: Optional[float] = Field(default=None, ge=1.0, le=500.0)
    height_cm: Optional[float] = Field(default=None, ge=30.0, le=300.0)


class PatientResponse(BaseModel):
    id: UUID
    patient_id: str
    full_name: str
    date_of_birth: date
    sex: str
    contact_phone: Optional[str]
    contact_email: Optional[str]
    address: Optional[str]
    emergency_contact: Optional[str]

    model_config = {"from_attributes": True}


# ── Endpoints ─────────────────────────────────────────────────────────────────
@router.post("", response_model=PatientResponse, status_code=201)
async def create_patient(
    data: PatientCreate,
    db: DBSession,
    current_user: CurrentDoctor,
    request: Request,
):
    repo = AssessmentRepository(db)
    from sqlalchemy import select
    from database.connection import AsyncSession

    # Check for duplicate patient_id
    from sqlalchemy import select as sa_select
    result = await db.execute(
        sa_select(Patient).where(Patient.patient_id == data.patient_id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Patient ID '{data.patient_id}' already exists",
        )

    from datetime import datetime
    patient = Patient(
        patient_id=data.patient_id,
        full_name=data.full_name,
        date_of_birth=datetime.combine(data.date_of_birth, datetime.min.time()),
        sex=data.sex,
        contact_phone=data.contact_phone,
        contact_email=data.contact_email,
        address=data.address,
        emergency_contact=data.emergency_contact,
        created_by=current_user.id,
    )
    db.add(patient)
    await db.flush()
    await log_action(db, current_user.id, "patient.create", "patient", patient.id, request)
    return patient


@router.get("", response_model=List[PatientResponse])
async def list_patients(
    db: DBSession,
    current_user: CurrentDoctor,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None),
):
    repo = AssessmentRepository(db)
    if search:
        return await repo.search_patients(search)
    return await repo.get_patients(skip=skip, limit=limit)


@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient(patient_id: UUID, db: DBSession, current_user: CurrentDoctor):
    repo = AssessmentRepository(db)
    patient = await repo.get_patient_by_id(patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.post("/{patient_id}/vitals", status_code=201)
async def record_vitals(
    patient_id: UUID,
    data: VitalsCreate,
    db: DBSession,
    current_user: CurrentDoctor,
    request: Request,
):
    repo = AssessmentRepository(db)
    patient = await repo.get_patient_by_id(patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    bmi = None
    if data.weight_kg and data.height_cm and data.height_cm > 0:
        bmi = round(data.weight_kg / ((data.height_cm / 100) ** 2), 2)

    vitals = PatientVitals(
        patient_id=patient_id,
        recorded_by=current_user.id,
        temperature=data.temperature,
        pulse_rate=data.pulse_rate,
        respiratory_rate=data.respiratory_rate,
        spo2=data.spo2,
        systolic_bp=data.systolic_bp,
        diastolic_bp=data.diastolic_bp,
        weight_kg=data.weight_kg,
        height_cm=data.height_cm,
        bmi=bmi,
    )
    db.add(vitals)
    await db.flush()
    await log_action(db, current_user.id, "vitals.record", "patient", patient_id, request)
    return {"id": str(vitals.id), "bmi": bmi, "message": "Vitals recorded"}
