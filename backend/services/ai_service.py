"""
services/ai_service.py
-----------------------
Orchestrates the full AI pipeline:
  1. Run inference on uploaded chest X-ray
  2. Generate Grad-CAM heatmap
  3. Request LLM clinical explanation
  4. Persist results to database
"""
import logging
from pathlib import Path
from typing import Dict, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from ai.gradcam.gradcam import generate_gradcam
from ai.inference.engine import DenseNet121Engine
from ai.llm.provider import get_llm_provider
from ai.model_registry.registry import ModelRegistry
from database.models.models import (
    ClinicalAssessment, Image, LLMExplanation, Patient,
    PatientVitals, Prediction,
)
from repositories.assessment_repository import AssessmentRepository

logger = logging.getLogger(__name__)


class AIService:
    def __init__(self, db: AsyncSession, registry: ModelRegistry):
        self.db = db
        self.registry = registry
        self.assessment_repo = AssessmentRepository(db)

    async def run_full_pipeline(
        self,
        assessment_id: UUID,
        image_id: UUID,
        user_id: UUID,
    ) -> Dict:
        """
        Execute the full AI analysis pipeline for a given assessment.

        Steps:
          1. Load assessment, patient, vitals from DB
          2. Get active model engine
          3. Run inference
          4. Generate Grad-CAM
          5. Generate LLM explanation
          6. Persist Prediction + LLMExplanation
          7. Return structured result

        Returns:
            Dict with prediction, confidence_scores, gradcam_paths, explanation
        """
        # ── Load data ─────────────────────────────────────────────────────────
        assessment = await self.assessment_repo.get_by_id(assessment_id)
        if not assessment:
            raise ValueError(f"Assessment {assessment_id} not found")

        image = await self.assessment_repo.get_image(image_id)
        if not image:
            raise ValueError(f"Image {image_id} not found")

        patient = assessment.patient
        vitals = await self.assessment_repo.get_latest_vitals(assessment.patient_id)

        # ── Inference ─────────────────────────────────────────────────────────
        engine = self.registry.get_engine()
        image_path = Path(image.file_path)

        logger.info(f"Running inference on {image_path}")
        pred_result = engine.predict(image_path)

        # ── Grad-CAM ──────────────────────────────────────────────────────────
        heatmap_path = None
        overlay_path = None
        try:
            if isinstance(engine, DenseNet121Engine):
                heatmap_path, overlay_path = generate_gradcam(engine, image_path)
                logger.info(f"Grad-CAM generated: {overlay_path}")
        except Exception as e:
            logger.warning(f"Grad-CAM generation failed (non-critical): {e}")

        # ── Get active model record ────────────────────────────────────────────
        active_model = await self.assessment_repo.get_active_model()

        # ── Persist Prediction ─────────────────────────────────────────────────
        prediction = Prediction(
            assessment_id=assessment_id,
            image_id=image_id,
            model_id=active_model.id,
            predicted_class=pred_result["predicted_class"],
            confidence_scores=pred_result["confidence_scores"],
            top_prediction=pred_result["top_prediction"],
            top_confidence=pred_result["top_confidence"],
            gradcam_path=str(heatmap_path) if heatmap_path else None,
            gradcam_overlay_path=str(overlay_path) if overlay_path else None,
            inference_time_ms=pred_result["inference_time_ms"],
        )
        self.db.add(prediction)
        await self.db.flush()

        # ── LLM Explanation ───────────────────────────────────────────────────
        llm_result = await self._generate_llm_explanation(
            patient=patient,
            vitals=vitals,
            assessment=assessment,
            pred_result=pred_result,
        )

        explanation = LLMExplanation(
            prediction_id=prediction.id,
            provider=llm_result["provider"],
            model_name=llm_result["model_name"],
            explanation=llm_result["explanation"],
            severity=llm_result["severity"],
            recommendations=llm_result["recommendations"],
            raw_response=llm_result.get("raw_response"),
            tokens_used=llm_result.get("tokens_used"),
        )
        self.db.add(explanation)
        await self.db.flush()

        return {
            "prediction_id": str(prediction.id),
            "predicted_class": pred_result["predicted_class"],
            "confidence_scores": pred_result["confidence_scores"],
            "top_confidence": pred_result["top_confidence"],
            "inference_time_ms": pred_result["inference_time_ms"],
            "class_labels": engine.class_labels,
            "gradcam_heatmap_path": str(heatmap_path) if heatmap_path else None,
            "gradcam_overlay_path": str(overlay_path) if overlay_path else None,
            "explanation": llm_result["explanation"],
            "severity": llm_result["severity"],
            "clinical_reasoning": llm_result.get("clinical_reasoning", ""),
            "recommendations": llm_result["recommendations"],
        }

    async def _generate_llm_explanation(
        self,
        patient: Patient,
        vitals: Optional[PatientVitals],
        assessment: ClinicalAssessment,
        pred_result: Dict,
    ) -> Dict:
        """Build the LLM prompt context and call the provider."""
        from datetime import date

        # Calculate age from date_of_birth
        today = date.today()
        dob = patient.date_of_birth.date() if hasattr(patient.date_of_birth, 'date') else patient.date_of_birth
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

        prompt_data = {
            "age": age,
            "sex": patient.sex,
            "chief_complaint": assessment.chief_complaint or "Not specified",
            "symptoms": ", ".join(assessment.symptoms or []) or "Not specified",
            "symptom_duration": assessment.symptom_duration or "Not specified",
            "conditions": ", ".join(assessment.medical_conditions or []) or "None",
            "medications": ", ".join(assessment.current_medications or []) or "None",
            "temperature": getattr(vitals, "temperature", "N/A") if vitals else "N/A",
            "spo2": getattr(vitals, "spo2", "N/A") if vitals else "N/A",
            "rr": getattr(vitals, "respiratory_rate", "N/A") if vitals else "N/A",
            "pulse": getattr(vitals, "pulse_rate", "N/A") if vitals else "N/A",
            "bp_sys": getattr(vitals, "systolic_bp", "N/A") if vitals else "N/A",
            "bp_dia": getattr(vitals, "diastolic_bp", "N/A") if vitals else "N/A",
            "bmi": getattr(vitals, "bmi", "N/A") if vitals else "N/A",
            "predicted_class": pred_result["predicted_class"],
            "top_confidence": pred_result["top_confidence"],
            "confidence_scores": str(pred_result["confidence_scores"]),
        }

        provider = get_llm_provider()
        return await provider.generate_explanation(prompt_data)
