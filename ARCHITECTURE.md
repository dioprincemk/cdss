# CDSS — Clinical Decision Support System
## System Architecture Documentation

---

## Overview

The CDSS is a full-stack web application combining deep learning chest X-ray analysis
with structured patient data to assist physicians in pulmonary disease assessment.

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER / CLIENT                      │
│         React + TypeScript + Vite + React Router         │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS / REST
┌────────────────────────▼────────────────────────────────┐
│                   FASTAPI BACKEND                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │   Auth   │ │ Patient  │ │   AI     │ │ Reports  │   │
│  │  Routes  │ │  Routes  │ │  Routes  │ │  Routes  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Service Layer                        │   │
│  │  PatientSvc | AssessmentSvc | AI_Svc | ReportSvc │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │              AI Module                            │   │
│  │  Loader | Preprocessor | Inference | GradCAM     │   │
│  │  ModelRegistry | LLMProvider                     │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │PostgreSQL│  │  Local   │  │  LLM     │
    │   DB     │  │FileStore │  │Provider  │
    └──────────┘  └──────────┘  └──────────┘
```

## Key Architectural Decisions

1. **Repository Pattern**: All DB access goes through repositories, never directly
   from routes. Enables easy testing and future DB migration.

2. **Service Layer**: Business logic lives in services, not controllers. Controllers
   only handle HTTP concerns (parsing, validation, response codes).

3. **AI Provider Abstraction**: The inference engine is decoupled via an abstract
   base class. Swapping DenseNet121 for a new model requires only implementing
   the interface — zero frontend changes.

4. **LLM Provider Abstraction**: OpenAI, local LLMs, or mock providers all implement
   the same interface. Configured via environment variable.

5. **Dynamic Disease Classes**: Frontend never hardcodes disease names. All class
   labels are returned from the backend model metadata endpoint.

6. **Role-Based Access Control**: JWT claims carry role. Middleware enforces per-route.

7. **Audit Logging**: Every significant clinical action is logged to AuditLogs table
   for compliance and traceability.
