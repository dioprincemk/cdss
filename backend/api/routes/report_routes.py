"""
api/routes/report_routes.py
----------------------------
Generate and download PDF clinical reports.
"""
from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path

from auth.dependencies import CurrentDoctor, DBSession
from repositories.assessment_repository import AssessmentRepository
from services.report_service import generate_report

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.post("/generate")
async def generate_clinical_report(
    assessment_id: UUID,
    prediction_id: UUID,
    db: DBSession,
    current_user: CurrentDoctor,
):
    repo = AssessmentRepository(db)
    assessment = await repo.get_by_id(assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    prediction = await repo.get_prediction(prediction_id)
    if not prediction:
        raise HTTPException(status_code=404, detail="Prediction not found")

    vitals = await repo.get_latest_vitals(assessment.patient_id)
    explanation = prediction.explanation if prediction else None

    report_path = await generate_report(
        assessment=assessment,
        patient=assessment.patient,
        vitals=vitals,
        prediction=prediction,
        explanation=explanation,
        doctor=current_user,
        db=db,
    )
    return {"report_path": str(report_path), "message": "Report generated successfully"}


@router.get("/download/{report_filename}")
async def download_report(report_filename: str, current_user: CurrentDoctor):
    from core.config.settings import get_settings
    settings = get_settings()
    report_path = settings.REPORTS_DIR / report_filename
    if not report_path.exists():
        raise HTTPException(status_code=404, detail="Report file not found")
    return FileResponse(
        path=str(report_path),
        media_type="application/pdf",
        filename=report_filename,
    )
