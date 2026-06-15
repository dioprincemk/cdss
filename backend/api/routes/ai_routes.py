"""
api/routes/ai_routes.py
------------------------
Endpoints: run inference, get prediction results, class labels.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request

from ai.model_registry.registry import ModelRegistry, get_registry
from auth.dependencies import CurrentDoctor, DBSession
from repositories.assessment_repository import AssessmentRepository
from services.ai_service import AIService
from utils.audit import log_action

router = APIRouter(prefix="/ai", tags=["AI Inference"])


@router.post("/predict")
async def run_prediction(
    assessment_id: UUID,
    image_id: UUID,
    db: DBSession,
    current_user: CurrentDoctor,
    request: Request,
    registry: ModelRegistry = Depends(get_registry),
):
    """
    Run the full AI pipeline:
    1. Inference (DenseNet121)
    2. Grad-CAM heatmap
    3. LLM clinical explanation

    Returns structured prediction result with dynamically-fetched class labels.
    """
    if not registry.is_loaded:
        raise HTTPException(
            status_code=503,
            detail="No AI model is currently active. Please activate a model first.",
        )
    svc = AIService(db, registry)
    result = await svc.run_full_pipeline(assessment_id, image_id, current_user.id)
    await log_action(
        db, current_user.id, "ai.predict", "assessment", assessment_id, request,
        {"predicted_class": result["predicted_class"]},
    )
    return result


@router.get("/model/active")
async def get_active_model_info(
    registry: ModelRegistry = Depends(get_registry),
):
    """Return metadata for the currently loaded model, including class labels."""
    if not registry.is_loaded:
        return {"is_loaded": False, "class_labels": [], "architecture": None}
    engine = registry.get_engine()
    return {
        "is_loaded": True,
        "model_id": registry.active_model_id,
        "class_labels": engine.class_labels,
        "architecture": engine.architecture,
    }


@router.get("/predictions/{prediction_id}")
async def get_prediction(
    prediction_id: UUID,
    db: DBSession,
    current_user: CurrentDoctor,
):
    repo = AssessmentRepository(db)
    prediction = await repo.get_prediction(prediction_id)
    if not prediction:
        raise HTTPException(status_code=404, detail="Prediction not found")
    return prediction


@router.get("/predictions/recent/list")
async def get_recent_predictions(
    db: DBSession,
    current_user: CurrentDoctor,
    limit: int = 10,
):
    repo = AssessmentRepository(db)
    return await repo.get_recent_predictions(limit=limit)
