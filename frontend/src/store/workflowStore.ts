// store/workflowStore.ts — multi-step clinical assessment workflow state

import { create } from 'zustand';
import type { Patient, Vitals, PredictionResult, WorkflowStep } from '@/types';

interface WorkflowStore {
  currentStep: WorkflowStep;
  patient: Patient | null;
  vitalsId: string | null;
  assessmentId: string | null;
  imageId: string | null;
  predictionResult: PredictionResult | null;

  setStep: (step: WorkflowStep) => void;
  setPatient: (p: Patient) => void;
  setVitalsId: (id: string) => void;
  setAssessmentId: (id: string) => void;
  setImageId: (id: string) => void;
  setPredictionResult: (r: PredictionResult) => void;
  reset: () => void;
}

const INITIAL: Omit<WorkflowStore, 'setStep' | 'setPatient' | 'setVitalsId' | 'setAssessmentId' | 'setImageId' | 'setPredictionResult' | 'reset'> = {
  currentStep: 'demographics',
  patient: null,
  vitalsId: null,
  assessmentId: null,
  imageId: null,
  predictionResult: null,
};

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  ...INITIAL,
  setStep: (step) => set({ currentStep: step }),
  setPatient: (patient) => set({ patient }),
  setVitalsId: (vitalsId) => set({ vitalsId }),
  setAssessmentId: (assessmentId) => set({ assessmentId }),
  setImageId: (imageId) => set({ imageId }),
  setPredictionResult: (predictionResult) => set({ predictionResult }),
  reset: () => set({ ...INITIAL }),
}));
