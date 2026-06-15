"""
ai/model_registry/registry.py
--------------------------------
Singleton model registry.

Responsibilities:
- Hold the currently active InferenceEngine in memory
- Reload the engine when a new model is activated
- Provide a FastAPI dependency for routes to get the active engine

DESIGN: Implemented as a module-level singleton so the loaded model
persists across requests without reloading on every call.
"""
import asyncio
import logging
from pathlib import Path
from typing import Optional

from ai.inference.engine import DenseNet121Engine, InferenceEngine

logger = logging.getLogger(__name__)


class ModelRegistry:
    """
    Thread-safe (asyncio-safe) registry for the active inference engine.
    Only one model may be active at a time — enforced by activate().
    """

    def __init__(self):
        self._engine: Optional[InferenceEngine] = None
        self._model_id: Optional[str] = None
        self._lock = asyncio.Lock()

    @property
    def is_loaded(self) -> bool:
        return self._engine is not None

    @property
    def active_model_id(self) -> Optional[str]:
        return self._model_id

    def get_engine(self) -> InferenceEngine:
        """Return the active engine, or raise if none loaded."""
        if not self._engine:
            raise RuntimeError(
                "No AI model is currently active. "
                "Please activate a model via the Model Management dashboard."
            )
        return self._engine

    async def load_model(
        self,
        model_id: str,
        model_path: Path,
        disease_classes: list[str],
        architecture: str = "DenseNet121",
        input_size: int = 224,
    ) -> None:
        """
        Load a model into memory and make it the active engine.
        Replaces any previously loaded engine.
        """
        async with self._lock:
            logger.info(f"Loading model {model_id} from {model_path}")
            # Currently only DenseNet121 is supported.
            # Add more architectures here as an if/elif chain.
            if architecture == "DenseNet121":
                engine = DenseNet121Engine(
                    model_path=model_path,
                    disease_classes=disease_classes,
                    input_size=input_size,
                )
            else:
                raise ValueError(f"Unsupported architecture: {architecture}")

            self._engine = engine
            self._model_id = model_id
            logger.info(f"Model {model_id} loaded successfully. Classes: {disease_classes}")

    async def unload(self) -> None:
        """Remove the active model from memory."""
        async with self._lock:
            self._engine = None
            self._model_id = None
            logger.info("Model unloaded from registry")


# Module-level singleton — shared across the entire process
_registry = ModelRegistry()


def get_registry() -> ModelRegistry:
    """FastAPI dependency / importable accessor."""
    return _registry
