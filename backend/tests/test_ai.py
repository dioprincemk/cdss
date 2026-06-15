"""
tests/test_ai.py
-----------------
Tests for AI module: mock provider, preprocessing, registry behaviour.
"""
import asyncio
import tempfile
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from ai.llm.provider import MockProvider
from ai.model_registry.registry import ModelRegistry
from ai.preprocessing.image_utils import (
    compute_sha256,
    get_image_dimensions,
    validate_image_bytes,
)


# ── Preprocessing ─────────────────────────────────────────────────────────────
def _make_test_image(width=224, height=224) -> bytes:
    """Create a synthetic chest-X-ray-like grayscale image."""
    arr = np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)
    img = Image.fromarray(arr)
    import io
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_validate_image_bytes_valid():
    content = _make_test_image()
    is_valid, msg, size = validate_image_bytes(content)
    assert is_valid
    assert msg == ""
    assert size == (224, 224)


def test_validate_image_bytes_invalid():
    is_valid, msg, size = validate_image_bytes(b"not an image at all")
    assert not is_valid
    assert msg != ""
    assert size is None


def test_compute_sha256_deterministic():
    data = b"test data"
    h1 = compute_sha256(data)
    h2 = compute_sha256(data)
    assert h1 == h2
    assert len(h1) == 64


def test_get_image_dimensions():
    content = _make_test_image(320, 256)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        f.write(content)
        tmp_path = Path(f.name)
    w, h = get_image_dimensions(tmp_path)
    assert w == 320
    assert h == 256
    tmp_path.unlink()


# ── Mock LLM Provider ─────────────────────────────────────────────────────────
@pytest.mark.asyncio
async def test_mock_provider_returns_all_fields():
    provider = MockProvider()
    for cls in ["Normal", "Pneumonia", "COVID-19", "Tuberculosis"]:
        result = await provider.generate_explanation({"predicted_class": cls})
        assert "explanation" in result
        assert "severity" in result
        assert "recommendations" in result
        assert isinstance(result["recommendations"], list)
        assert len(result["recommendations"]) > 0
        assert result["provider"] == "mock"


@pytest.mark.asyncio
async def test_mock_provider_unknown_class_falls_back():
    provider = MockProvider()
    result = await provider.generate_explanation({"predicted_class": "UnknownDisease"})
    assert result["severity"] == "Low"   # Falls back to Normal defaults


# ── Model Registry ────────────────────────────────────────────────────────────
def test_registry_not_loaded_initially():
    registry = ModelRegistry()
    assert not registry.is_loaded
    assert registry.active_model_id is None


def test_registry_raises_when_no_model():
    registry = ModelRegistry()
    with pytest.raises(RuntimeError, match="No AI model is currently active"):
        registry.get_engine()


@pytest.mark.asyncio
async def test_registry_unload():
    """After unload, registry should report not loaded."""
    registry = ModelRegistry()
    # Manually inject a fake engine to test unload behaviour
    registry._engine = object()
    registry._model_id = "fake-id"
    assert registry.is_loaded
    await registry.unload()
    assert not registry.is_loaded
    assert registry.active_model_id is None
