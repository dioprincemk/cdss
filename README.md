# CDSS — Clinical Decision Support System
### Pulmonary Disease Assessment Using Deep Learning & Chest X-Ray Imaging

---

## Overview

A production-quality, full-stack web application that combines **DenseNet121 deep learning**, **Grad-CAM explainability**, and an **LLM clinical reasoning engine** to assist physicians in pulmonary disease assessment.

**This system is intended to support — not replace — clinical judgment.**

---

## Architecture

```
Frontend (React + TS)  →  Backend (FastAPI)  →  PostgreSQL
                                ↓
                    AI Pipeline:
                    DenseNet121 Inference
                    Grad-CAM Heatmaps
                    LLM Explanation (OpenAI / Ollama / Mock)
                    PDF Report Generation (ReportLab)
```

---

## Disease Classes (Current Model)

| Class        | Description                          |
|--------------|--------------------------------------|
| Normal       | No significant pulmonary abnormality |
| Pneumonia    | Bacterial/viral pulmonary infection  |
| COVID-19     | COVID-19 pneumonia pattern           |
| Tuberculosis | Pulmonary TB (upper lobe infiltrates)|

> **Future-proof**: The frontend never hardcodes disease classes. All labels are fetched dynamically from the active model's metadata.

---

## Tech Stack

| Layer      | Technology                                    |
|------------|-----------------------------------------------|
| Frontend   | React 18, TypeScript, Vite, Zustand, Recharts |
| Backend    | FastAPI, Python 3.12, SQLAlchemy (async)       |
| Database   | PostgreSQL 15+                                |
| AI/ML      | PyTorch, DenseNet121, Grad-CAM, OpenCV        |
| Auth       | JWT (HS256), bcrypt, refresh token rotation   |
| Reports    | ReportLab PDF                                 |
| Deploy     | Localhost / Render.com                        |

---

## Quick Start (Localhost)

### Prerequisites

- Python 3.12+
- Node.js 18+
- PostgreSQL 15+
- (Optional) CUDA GPU for faster inference

### 1. Clone and setup

```bash
git clone https://github.com/your-repo/cdss.git
cd cdss
chmod +x start.sh setup_db.sh
```

### 2. Database setup

```bash

# 1. Update the package list
sudo apt-get update

# 2. Install both the postgres client AND the server manually
sudo apt-get install -y postgresql postgresql-client

# 3. Start the postgres service so your script can talk to it
sudo service postgresql start

# 2. Incase of Restart to apply any necessary change
sudo service postgresql restart

# Creates cdss_db, cdss_user, runs schema
./setup_db.sh
```

### 3. Backend configuration

```bash
cd backend
cp .env.example .env
# Edit .env — set your DATABASE_URL and SECRET_KEY at minimum
```

Key `.env` values:

| Variable       | Default       | Description                          |
|----------------|---------------|--------------------------------------|
| `DATABASE_URL` | (see example) | PostgreSQL async connection string   |
| `SECRET_KEY`   | CHANGE ME     | JWT signing key (min 32 chars)       |
| `LLM_PROVIDER` | `mock`        | `mock` \| `openai` \| `local`        |
| `OPENAI_API_KEY`| empty        | Required only if LLM_PROVIDER=openai |

### 4. One-command startup

```bash
cd ..
./start.sh
```

This starts:
- **Backend**: http://localhost:8000
- **Frontend**: http://localhost:5173
- **API Docs**: http://localhost:8000/api/docs

---

## Manual Startup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## First Login

1. Navigate to http://localhost:5173
2. Click **Create Account**
3. Register as **Administrator** to unlock Model Management
4. Upload a DenseNet121 `.pth` model file via **AI Models** → **Upload**
5. Activate the model
6. Start a **New Assessment**

---

## Clinical Workflow

```
Patient Demographics
      ↓
  Vital Signs  (auto-calculates BMI)
      ↓
 Clinical Info  (symptoms, medications, history)
      ↓
 Chest X-Ray Upload  (PNG/JPG, max 10MB)
      ↓
  AI Analysis  (DenseNet121 → Grad-CAM → LLM explanation)
      ↓
 Results Page  (prediction, confidence, heatmap, recommendations)
      ↓
 PDF Report Download
```

---

## User Roles

| Role    | Permissions                                             |
|---------|---------------------------------------------------------|
| Doctor  | Create/view patients, run assessments, view results     |
| Admin   | All doctor permissions + manage models, manage users    |

---

## AI Model Requirements

The system validates uploaded models against these criteria:

- Architecture: **DenseNet121** (torchvision)
- File format: `.pth` or `.pkl`
- Output classes: match the `disease_classes` list you provide
- Max weight mismatches: ≤ 20 keys (allows partial fine-tuned models)

Example training output classes (must be in correct order):
```json
["Normal", "Pneumonia", "COVID-19", "Tuberculosis"]
```

---

## LLM Provider Configuration

| Provider  | `LLM_PROVIDER` value | Requirements              |
|-----------|----------------------|---------------------------|
| Mock      | `mock`               | None — works out of the box|
| OpenAI    | `openai`             | `OPENAI_API_KEY` in .env  |
| Local LLM | `local`              | Ollama running on port 11434|

### Setting up Ollama (local LLM):

```bash
# Install Ollama: https://ollama.com
ollama pull llama3.2
ollama serve
# Set LOCAL_LLM_URL=http://localhost:11434 in .env
```

---

## Deploy to Render

1. Push your repo to GitHub
2. Connect repo to [render.com](https://render.com)
3. Render auto-detects `render.yaml`
4. Set environment variables in Render dashboard (especially `SECRET_KEY` and `OPENAI_API_KEY`)
5. Deploy

---

## Running Tests

```bash
cd backend
source venv/bin/activate
pytest tests/ -v
```

---

## Project Structure

```
cdss/
├── backend/
│   ├── ai/
│   │   ├── inference/       # DenseNet121 engine
│   │   ├── gradcam/         # Grad-CAM heatmap generation
│   │   ├── llm/             # LLM provider abstraction
│   │   ├── loaders/         # Model file loading utilities
│   │   ├── model_registry/  # Singleton active model registry
│   │   └── preprocessing/   # Image utilities
│   ├── api/routes/          # FastAPI route handlers
│   ├── auth/                # JWT dependencies
│   ├── core/                # Settings, security
│   ├── database/            # ORM models, migrations, schema
│   ├── middleware/          # Logging middleware
│   ├── repositories/        # DB access layer
│   ├── schemas/             # Pydantic request/response models
│   ├── services/            # Business logic
│   ├── tests/               # pytest test suite
│   ├── utils/               # Audit logging, helpers
│   ├── main.py              # FastAPI app factory
│   └── requirements.txt
│
├── frontend/
│   └── src/
│       ├── components/      # Reusable UI components
│       ├── hooks/           # Custom React hooks
│       ├── pages/           # Route-level page components
│       ├── services/        # Axios API client
│       ├── store/           # Zustand global state
│       ├── styles/          # Global CSS design system
│       ├── types/           # TypeScript interfaces
│       └── utils/           # Frontend helpers
│
├── start.sh                 # One-command startup
├── setup_db.sh              # Database initialisation
└── render.yaml              # Render.com deployment config
```

---

## Security Notes

- Passwords hashed with **bcrypt** (cost factor 12)
- JWTs use **HS256** with a configurable secret key
- Refresh tokens are **rotated on every use** and stored as SHA-256 hashes
- File uploads validated by extension, MIME type, and size
- All clinical actions logged to the `audit_logs` table
- Rate limiting: 60 requests/minute per IP (configurable)

---

## Academic Disclaimer

This system was developed as an undergraduate final year project in medical informatics. It demonstrates the integration of deep learning, explainable AI, and clinical decision support concepts. It has **not** been validated for clinical use and must not be used as a medical device.

---

*Built with FastAPI · React · PyTorch · PostgreSQL*
#   c d s s 
 
 