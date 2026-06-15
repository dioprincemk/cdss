"""
ai/loaders/model_loader.py
---------------------------
Handles loading model files (.pth / .pkl) safely from disk.

Responsibilities:
  - Detect file format (.pth vs .pkl)
  - Load with appropriate deserialiser
  - Return raw state_dict or model object
  - Log loading errors clearly

Used by:
  - DenseNet121Engine.__init__
  - Model validation endpoint (for architecture check without full engine init)
"""
import logging
import pickle
from pathlib import Path
from typing import Any, Dict, Union

import torch

logger = logging.getLogger(__name__)


def load_model_file(model_path: Path) -> Any:
    """
    Load a model checkpoint from a .pth or .pkl file.

    Supports:
      - PyTorch .pth files (state_dict or full model)
      - Pickle .pkl files

    Returns:
        The raw checkpoint object (dict with state_dict, or the model itself).

    Raises:
        ValueError:  Unsupported file extension
        RuntimeError: File could not be loaded
    """
    suffix = model_path.suffix.lower()

    if suffix == ".pth":
        try:
            checkpoint = torch.load(model_path, map_location="cpu", weights_only=False)
            logger.info(f"Loaded .pth checkpoint from {model_path}")
            return checkpoint
        except Exception as e:
            raise RuntimeError(f"Failed to load .pth file: {e}") from e

    elif suffix == ".pkl":
        try:
            with open(model_path, "rb") as f:
                checkpoint = pickle.load(f)
            logger.info(f"Loaded .pkl checkpoint from {model_path}")
            return checkpoint
        except Exception as e:
            raise RuntimeError(f"Failed to load .pkl file: {e}") from e

    else:
        raise ValueError(
            f"Unsupported model format: '{suffix}'. "
            f"Allowed: .pth, .pkl"
        )


def extract_state_dict(checkpoint: Any) -> Dict[str, Any]:
    """
    Extract a state_dict from various checkpoint formats.

    Handles:
      - Raw state_dict (OrderedDict of tensors)
      - {'state_dict': ...}  (Lightning / custom)
      - {'model_state_dict': ...}  (custom training loop)
      - Full model object (calls .state_dict())

    Returns:
        A flat dict mapping parameter names to tensors.
    """
    if isinstance(checkpoint, dict):
        if "state_dict" in checkpoint:
            return checkpoint["state_dict"]
        if "model_state_dict" in checkpoint:
            return checkpoint["model_state_dict"]
        # Assume it IS a state_dict
        return checkpoint

    # Full model object
    if hasattr(checkpoint, "state_dict"):
        return checkpoint.state_dict()

    raise ValueError(
        "Cannot extract state_dict from checkpoint. "
        "Expected a dict or a nn.Module."
    )
