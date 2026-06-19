#!/usr/bin/env python3
"""Import a local AI model file directly into the CDSS backend.

This script bypasses the frontend upload flow by copying a local .pth/.pkl file
into the configured model storage directory, validating it, and registering it
in the database.

Usage:
  python import_model.py \
    --path /path/to/model.pkl \
    --name "DenseNet v1" \
    --version 1.0.0 \
    --classes Normal,Pneumonia,COVID-19,Tuberculosis \
    --description "Optional notes" \
    --activate
"""

import argparse
import asyncio
import json
import sys
import uuid
from pathlib import Path
from typing import List, Optional

from ai.loaders.model_loader import validate_densenet_model
from core.config.settings import get_settings
from database.connection import get_db_context
from database.models.models import AIModel
from repositories.assessment_repository import AssessmentRepository

settings = get_settings()
ALLOWED_EXTENSIONS = {'.pth', '.pkl'}


def parse_classes(value: str) -> List[str]:
    if not value:
        raise ValueError('Disease classes cannot be empty')

    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            classes = [str(item).strip() for item in parsed if str(item).strip()]
            if len(classes) < 2:
                raise ValueError
            return classes
    except (json.JSONDecodeError, ValueError):
        pass

    classes = [part.strip() for part in value.split(',') if part.strip()]
    if len(classes) < 2:
        raise ValueError('Provide at least two disease classes')
    return classes


def validate_args(args: argparse.Namespace) -> None:
    path = Path(args.path)
    if not path.exists() or not path.is_file():
        raise ValueError(f'Model file not found: {path}')

    if path.suffix.lower() not in ALLOWED_EXTENSIONS:
        raise ValueError(f'Unsupported file extension {path.suffix}. Allowed: {ALLOWED_EXTENSIONS}')

    try:
        args.classes = parse_classes(args.classes)
    except ValueError as exc:
        raise ValueError(f'Invalid disease_classes: {exc}')

    try:
        args.input_size = int(args.input_size)
        if args.input_size <= 0:
            raise ValueError
    except Exception:
        raise ValueError('input_size must be a positive integer')


async def import_model(args: argparse.Namespace) -> None:
    model_path = Path(args.path).expanduser().resolve()
    content = model_path.read_bytes()

    if settings.max_upload_bytes and len(content) > settings.max_upload_bytes:
        raise ValueError(
            f'File too large: {len(content)} bytes. Maximum allowed is {settings.MAX_UPLOAD_SIZE_MB} MB.'
        )

    stored_name = f'model_{uuid.uuid4().hex[:12]}{model_path.suffix.lower()}'
    destination = settings.MODELS_DIR / stored_name
    settings.MODELS_DIR.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)

    print(f'Copied model to {destination}')
    print('Validating model...')
    is_valid, validation_log = validate_densenet_model(destination, len(args.classes))
    print(f'Validation status: {is_valid} - {validation_log}')

    async with get_db_context() as db:
        repo = AssessmentRepository(db)
        if args.activate:
            existing_models = await repo.get_all_models()
            for model in existing_models:
                model.is_active = False

        ai_model = AIModel(
            name=args.name,
            version=args.version,
            description=args.description or None,
            architecture=args.architecture,
            file_path=str(destination),
            file_size_bytes=len(content),
            checksum_sha256=uuid.uuid5(uuid.NAMESPACE_URL, destination.name).hex,
            disease_classes=args.classes,
            input_size=args.input_size,
            is_active=bool(args.activate),
            is_validated=is_valid,
            validation_log=validation_log,
            uploaded_by=None,
        )
        db.add(ai_model)
        await db.flush()
        await db.commit()

        print(f'Model registered with ID: {ai_model.id}')
        if args.activate:
            print('Model has been marked active in the database.')
        if not is_valid:
            print('WARNING: Model did not pass validation. It is registered but invalid.')


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='Import an AI model into the CDSS backend directly.')
    parser.add_argument('--path', required=True, help='Local path to the .pth or .pkl model file')
    parser.add_argument('--name', required=True, help='Model name')
    parser.add_argument('--version', required=True, help='Model version')
    parser.add_argument('--description', default='', help='Optional model description')
    parser.add_argument('--architecture', default='DenseNet121', help='Model architecture')
    parser.add_argument('--classes', required=True, help='Disease classes as JSON or comma-separated list')
    parser.add_argument('--input-size', dest='input_size', default='224', help='Model input size in pixels')
    parser.add_argument('--activate', action='store_true', help='Mark the imported model active in the DB')
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        validate_args(args)
    except ValueError as exc:
        print(f'Error: {exc}', file=sys.stderr)
        return 1

    try:
        asyncio.run(import_model(args))
        return 0
    except Exception as exc:
        print(f'Import failed: {exc}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
