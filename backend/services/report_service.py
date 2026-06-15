"""
services/report_service.py
---------------------------
Generates professional PDF clinical reports using ReportLab.

Report sections:
  1. Hospital header + logo area
  2. Patient demographics
  3. Vital signs
  4. Clinical notes
  5. X-Ray image (thumbnail)
  6. AI prediction + confidence scores
  7. Grad-CAM overlay image
  8. LLM clinical explanation
  9. Recommendations
  10. Timestamp, doctor signature, disclaimer
"""
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import UUID

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    HRFlowable, Image as RLImage, Paragraph,
    SimpleDocTemplate, Spacer, Table, TableStyle,
)

from core.config.settings import get_settings
from database.models.models import (
    ClinicalAssessment, LLMExplanation, Patient,
    PatientVitals, Prediction, Report, User,
)

settings = get_settings()

# ── Colour palette (medical professional) ─────────────────────────────────────
MEDICAL_BLUE = colors.HexColor("#1A73E8")
DARK_TEXT    = colors.HexColor("#1A1A2E")
MID_GRAY     = colors.HexColor("#6B7280")
LIGHT_GRAY   = colors.HexColor("#F3F4F6")
DANGER_RED   = colors.HexColor("#DC2626")
WARN_ORANGE  = colors.HexColor("#F59E0B")
SUCCESS_GREEN= colors.HexColor("#16A34A")

SEVERITY_COLORS = {
    "Low":      SUCCESS_GREEN,
    "Moderate": WARN_ORANGE,
    "High":     DANGER_RED,
    "Critical": DANGER_RED,
}


def _severity_color(severity: str) -> colors.Color:
    return SEVERITY_COLORS.get(severity, DANGER_RED)


async def generate_report(
    assessment: ClinicalAssessment,
    patient: Patient,
    vitals: Optional[PatientVitals],
    prediction: Prediction,
    explanation: Optional[LLMExplanation],
    doctor: User,
    db,
) -> Path:
    """
    Build and save a PDF clinical report.

    Returns:
        Path to the saved PDF file
    """
    uid = uuid.uuid4().hex[:10]
    report_path = settings.REPORTS_DIR / f"report_{uid}.pdf"
    settings.REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(report_path),
        pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )
    styles = getSampleStyleSheet()
    story = []

    # ── Custom styles ──────────────────────────────────────────────────────────
    h1 = ParagraphStyle("H1", parent=styles["Heading1"],
                        fontSize=18, textColor=MEDICAL_BLUE, spaceAfter=4)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"],
                        fontSize=13, textColor=DARK_TEXT, spaceAfter=4, spaceBefore=10)
    body = ParagraphStyle("Body", parent=styles["Normal"],
                          fontSize=10, textColor=DARK_TEXT, leading=14)
    small = ParagraphStyle("Small", parent=styles["Normal"],
                           fontSize=8, textColor=MID_GRAY)
    disclaimer_style = ParagraphStyle(
        "Disclaimer", parent=styles["Normal"],
        fontSize=8, textColor=MID_GRAY,
        borderColor=WARN_ORANGE, borderWidth=1, borderPadding=6,
        leading=12,
    )

    # ── Header ─────────────────────────────────────────────────────────────────
    story.append(Paragraph(settings.HOSPITAL_NAME, h1))
    story.append(Paragraph(settings.HOSPITAL_ADDRESS, small))
    story.append(Paragraph(f"Tel: {settings.HOSPITAL_PHONE}", small))
    story.append(HRFlowable(width="100%", color=MEDICAL_BLUE, thickness=2))
    story.append(Spacer(1, 6))
    story.append(Paragraph("CLINICAL RADIOLOGY REPORT", ParagraphStyle(
        "Title", parent=h2, fontSize=15, textColor=MEDICAL_BLUE, alignment=1,
    )))
    story.append(Paragraph(
        f"Report generated: {datetime.now(timezone.utc).strftime('%d %B %Y at %H:%M UTC')}",
        small,
    ))
    story.append(Spacer(1, 8))

    # ── Patient Demographics ───────────────────────────────────────────────────
    story.append(Paragraph("1. Patient Demographics", h2))
    from datetime import date
    dob = patient.date_of_birth.date() if hasattr(patient.date_of_birth, 'date') else patient.date_of_birth
    today = date.today()
    age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

    demo_data = [
        ["Patient ID", patient.patient_id, "Full Name", patient.full_name],
        ["Age", f"{age} years", "Sex", patient.sex.capitalize()],
        ["Date of Birth", str(dob), "Contact", patient.contact_phone or "N/A"],
    ]
    story.append(_make_table(demo_data))
    story.append(Spacer(1, 6))

    # ── Vital Signs ────────────────────────────────────────────────────────────
    if vitals:
        story.append(Paragraph("2. Vital Signs", h2))
        vitals_data = [
            ["Temperature", f"{vitals.temperature}°C" if vitals.temperature else "N/A",
             "SpO2", f"{vitals.spo2}%" if vitals.spo2 else "N/A"],
            ["Pulse Rate", f"{vitals.pulse_rate} bpm" if vitals.pulse_rate else "N/A",
             "Respiratory Rate", f"{vitals.respiratory_rate}/min" if vitals.respiratory_rate else "N/A"],
            ["Blood Pressure", f"{vitals.systolic_bp}/{vitals.diastolic_bp} mmHg" if vitals.systolic_bp else "N/A",
             "BMI", f"{vitals.bmi:.1f}" if vitals.bmi else "N/A"],
        ]
        story.append(_make_table(vitals_data))
        story.append(Spacer(1, 6))

    # ── Clinical Notes ─────────────────────────────────────────────────────────
    story.append(Paragraph("3. Clinical Information", h2))
    story.append(Paragraph(f"<b>Chief Complaint:</b> {assessment.chief_complaint}", body))
    if assessment.symptoms:
        story.append(Paragraph(f"<b>Symptoms:</b> {', '.join(assessment.symptoms)}", body))
    if assessment.symptom_duration:
        story.append(Paragraph(f"<b>Duration:</b> {assessment.symptom_duration}", body))
    if assessment.clinical_notes:
        story.append(Paragraph(f"<b>Clinical Notes:</b> {assessment.clinical_notes}", body))
    story.append(Spacer(1, 6))

    # ── X-Ray Image ───────────────────────────────────────────────────────────
    if assessment.images:
        story.append(Paragraph("4. Chest X-Ray", h2))
        xray_path = Path(assessment.images[0].file_path)
        if xray_path.exists():
            story.append(RLImage(str(xray_path), width=8*cm, height=8*cm, kind='proportional'))
        story.append(Spacer(1, 6))

    # ── AI Prediction ─────────────────────────────────────────────────────────
    story.append(Paragraph("5. AI Prediction Results", h2))
    pred_color = _severity_color(explanation.severity if explanation else "High")
    story.append(Paragraph(
        f"<b>Predicted Diagnosis:</b> <font color='#{pred_color.hexval()[2:]}'>"
        f"{prediction.top_prediction}</font>  "
        f"(Confidence: {prediction.top_confidence:.1%})",
        body,
    ))
    story.append(Spacer(1, 4))

    # Confidence breakdown table
    conf_scores = prediction.confidence_scores
    conf_rows = [[k, f"{v:.1%}"] for k, v in conf_scores.items()]
    conf_table = Table([["Disease Class", "Confidence"]] + conf_rows,
                       colWidths=[8*cm, 4*cm])
    conf_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), MEDICAL_BLUE),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID",       (0, 0), (-1, -1), 0.5, MID_GRAY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
        ("FONTSIZE",   (0, 0), (-1, -1), 9),
    ]))
    story.append(conf_table)
    story.append(Spacer(1, 6))

    # ── Grad-CAM ──────────────────────────────────────────────────────────────
    if prediction.gradcam_overlay_path:
        overlay_path = Path(prediction.gradcam_overlay_path)
        if overlay_path.exists():
            story.append(Paragraph("6. Grad-CAM Explainability Map", h2))
            story.append(Paragraph(
                "The following visualisation highlights the regions of the chest X-ray "
                "that most influenced the AI prediction (Gradient-weighted Class Activation Mapping).",
                small,
            ))
            story.append(RLImage(str(overlay_path), width=8*cm, height=8*cm, kind='proportional'))
            story.append(Spacer(1, 6))

    # ── LLM Explanation ───────────────────────────────────────────────────────
    if explanation:
        story.append(Paragraph("7. Clinical AI Explanation", h2))
        sev_col = _severity_color(explanation.severity or "Moderate")
        story.append(Paragraph(
            f"<b>Severity Assessment:</b> "
            f"<font color='#{sev_col.hexval()[2:]}'>{explanation.severity}</font>",
            body,
        ))
        story.append(Spacer(1, 4))
        story.append(Paragraph(f"<b>Diagnostic Explanation:</b>", body))
        story.append(Paragraph(explanation.explanation, body))
        story.append(Spacer(1, 4))

        if explanation.recommendations:
            story.append(Paragraph("<b>Recommended Next Steps:</b>", body))
            for i, rec in enumerate(explanation.recommendations, 1):
                story.append(Paragraph(f"{i}. {rec}", body))
        story.append(Spacer(1, 6))

    # ── Doctor & Disclaimer ───────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", color=MID_GRAY, thickness=0.5))
    story.append(Spacer(1, 4))
    story.append(Paragraph(f"<b>Reporting Clinician:</b> Dr. {doctor.full_name}", body))
    if doctor.medical_license:
        story.append(Paragraph(f"<b>Medical License:</b> {doctor.medical_license}", body))
    if doctor.department:
        story.append(Paragraph(f"<b>Department:</b> {doctor.department}", body))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "⚕️ DISCLAIMER: This report was generated with the assistance of an AI-based Clinical "
        "Decision Support System. The AI analysis is intended to support — not replace — the "
        "professional judgment of a qualified healthcare provider. All clinical decisions must "
        "be made by a licensed physician. This system is not FDA/CE approved as a diagnostic device.",
        disclaimer_style,
    ))

    doc.build(story)

    # Persist report record
    report = Report(
        assessment_id=assessment.id,
        prediction_id=prediction.id,
        explanation_id=explanation.id if explanation else None,
        generated_by=doctor.id,
        report_path=str(report_path),
    )
    db.add(report)
    await db.flush()

    return report_path


def _make_table(data: list) -> Table:
    """Helper: build a styled 4-column key-value table."""
    table = Table(data, colWidths=[4*cm, 5*cm, 4*cm, 4*cm])
    table.setStyle(TableStyle([
        ("FONTNAME",     (0, 0), (-1, -1), "Helvetica"),
        ("FONTNAME",     (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME",     (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, -1), 9),
        ("GRID",         (0, 0), (-1, -1), 0.3, colors.HexColor("#E5E7EB")),
        ("ROWBACKGROUNDS",(0, 0), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
    ]))
    return table
