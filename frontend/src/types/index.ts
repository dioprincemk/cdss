// types/index.ts — Shared TypeScript types for CDSS frontend

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'doctor';
  medical_license?: string;
  department?: string;
  is_active: boolean;
  is_verified: boolean;
  last_login?: string;
  created_at: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface Patient {
  id: string;
  patient_id: string;
  full_name: string;
  date_of_birth: string;
  sex: 'male' | 'female' | 'other';
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  emergency_contact?: string;
  created_at?: string;
}

export interface Vitals {
  id: string;
  patient_id: string;
  temperature?: number;
  pulse_rate?: number;
  respiratory_rate?: number;
  spo2?: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  weight_kg?: number;
  height_cm?: number;
  bmi?: number;
  recorded_at: string;
}

export interface Assessment {
  id: string;
  patient_id: string;
  vitals_id?: string;
  assessed_by?: string;
  chief_complaint: string;
  symptoms: string[];
  symptom_duration?: string;
  medical_conditions: string[];
  current_medications: string[];
  clinical_notes?: string;
  status: 'in_progress' | 'completed' | 'archived';
  created_at: string;
  patient?: Patient;
  images?: XRayImage[];
  predictions?: Prediction[];
}

export interface XRayImage {
  id: string;
  assessment_id: string;
  original_filename: string;
  stored_filename: string;
  file_path: string;
  file_size_bytes?: number;
  image_width?: number;
  image_height?: number;
  upload_status: string;
  created_at: string;
}

export interface Prediction {
  id: string;
  assessment_id: string;
  image_id: string;
  model_id: string;
  predicted_class: string;
  confidence_scores: Record<string, number>;
  top_prediction: string;
  top_confidence: number;
  gradcam_path?: string;
  gradcam_overlay_path?: string;
  inference_time_ms?: number;
  created_at: string;
  explanation?: LLMExplanation;
}

export interface LLMExplanation {
  id: string;
  prediction_id: string;
  provider: string;
  model_name?: string;
  explanation: string;
  severity: 'Low' | 'Moderate' | 'High' | 'Critical';
  recommendations?: string[];
  generated_at: string;
}

export interface AIModel {
  id: string;
  name: string;
  version: string;
  description?: string;
  architecture: string;
  disease_classes: string[];
  is_active: boolean;
  is_validated: boolean;
  file_size_bytes?: number;
  created_at: string;
}

export interface PredictionResult {
  prediction_id: string;
  predicted_class: string;
  confidence_scores: Record<string, number>;
  top_confidence: number;
  inference_time_ms: number;
  class_labels: string[];
  gradcam_heatmap_path?: string;
  gradcam_overlay_path?: string;
  explanation: string;
  severity: string;
  clinical_reasoning: string;
  recommendations: string[];
}

export interface DashboardStats {
  total_patients: number;
  total_assessments: number;
  total_predictions: number;
  model_active: boolean;
  recent_predictions: Prediction[];
}

// Workflow steps
export type WorkflowStep =
  | 'demographics'
  | 'vitals'
  | 'clinical'
  | 'xray'
  | 'analysis'
  | 'results';

export interface WorkflowState {
  currentStep: WorkflowStep;
  patient?: Patient;
  vitals?: Partial<Vitals>;
  assessment?: Partial<Assessment>;
  imageId?: string;
  assessmentId?: string;
  predictionResult?: PredictionResult;
}
