"""
repositories/assessment_repository.py
--------------------------------------
Database access for patients, vitals, assessments, images, predictions, models.
"""
from typing import List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database.models.models import (
    AIModel, ClinicalAssessment, Image, Patient,
    PatientVitals, Prediction,
)


class AssessmentRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Patients ──────────────────────────────────────────────────────────────
    async def get_patient_by_id(self, patient_id: UUID) -> Optional[Patient]:
        result = await self.db.execute(
            select(Patient).where(Patient.id == patient_id)
        )
        return result.scalar_one_or_none()

    async def get_patients(self, skip: int = 0, limit: int = 50) -> List[Patient]:
        result = await self.db.execute(
            select(Patient).offset(skip).limit(limit).order_by(Patient.created_at.desc())
        )
        return list(result.scalars().all())

    async def search_patients(self, query: str) -> List[Patient]:
        from sqlalchemy import or_, func
        result = await self.db.execute(
            select(Patient).where(
                or_(
                    func.lower(Patient.full_name).contains(query.lower()),
                    func.lower(Patient.patient_id).contains(query.lower()),
                )
            ).limit(20)
        )
        return list(result.scalars().all())

    # ── Vitals ────────────────────────────────────────────────────────────────
    async def get_latest_vitals(self, patient_id: UUID) -> Optional[PatientVitals]:
        result = await self.db.execute(
            select(PatientVitals)
            .where(PatientVitals.patient_id == patient_id)
            .order_by(PatientVitals.recorded_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    # ── Assessments ───────────────────────────────────────────────────────────
    async def get_by_id(self, assessment_id: UUID) -> Optional[ClinicalAssessment]:
        result = await self.db.execute(
            select(ClinicalAssessment)
            .options(
                selectinload(ClinicalAssessment.patient),
                selectinload(ClinicalAssessment.images),
                selectinload(ClinicalAssessment.predictions),
            )
            .where(ClinicalAssessment.id == assessment_id)
        )
        return result.scalar_one_or_none()

    async def get_assessments_for_patient(
        self, patient_id: UUID
    ) -> List[ClinicalAssessment]:
        result = await self.db.execute(
            select(ClinicalAssessment)
            .where(ClinicalAssessment.patient_id == patient_id)
            .order_by(ClinicalAssessment.created_at.desc())
        )
        return list(result.scalars().all())

    # ── Images ────────────────────────────────────────────────────────────────
    async def get_image(self, image_id: UUID) -> Optional[Image]:
        result = await self.db.execute(
            select(Image).where(Image.id == image_id)
        )
        return result.scalar_one_or_none()

    # ── Predictions ───────────────────────────────────────────────────────────
    async def get_prediction(self, prediction_id: UUID) -> Optional[Prediction]:
        result = await self.db.execute(
            select(Prediction)
            .options(selectinload(Prediction.explanation))
            .where(Prediction.id == prediction_id)
        )
        return result.scalar_one_or_none()

    async def get_recent_predictions(self, limit: int = 10) -> List[Prediction]:
        result = await self.db.execute(
            select(Prediction)
            .options(
                selectinload(Prediction.assessment).selectinload(ClinicalAssessment.patient)
            )
            .order_by(Prediction.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    # ── AI Models ─────────────────────────────────────────────────────────────
    async def get_active_model(self) -> Optional[AIModel]:
        result = await self.db.execute(
            select(AIModel).where(AIModel.is_active == True).limit(1)
        )
        return result.scalar_one_or_none()

    async def get_all_models(self) -> List[AIModel]:
        result = await self.db.execute(
            select(AIModel).order_by(AIModel.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_model_by_id(self, model_id: UUID) -> Optional[AIModel]:
        result = await self.db.execute(
            select(AIModel).where(AIModel.id == model_id)
        )
        return result.scalar_one_or_none()
