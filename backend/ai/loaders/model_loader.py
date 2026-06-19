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
import torch.nn as nn
import torch.nn.functional as F
from torchvision import models

logger = logging.getLogger(__name__)


class AdaptiveConcatPool2d(nn.Module):
    """Combine adaptive max pooling and average pooling for FastAI-style heads."""

    def __init__(self) -> None:
        super().__init__()
        self.avg_pool = nn.AdaptiveAvgPool2d(1)
        self.max_pool = nn.AdaptiveMaxPool2d(1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return torch.cat([self.max_pool(x), self.avg_pool(x)], dim=1)


class DenseNetWithFastAIHead(nn.Module):
    """Wrapper around torchvision DenseNet body that uses a FastAI-style head."""

    def __init__(self, features: nn.Module, norm5: nn.Module, head: nn.Module) -> None:
        super().__init__()
        self.features = features
        self.norm5 = norm5
        self.head = head

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.features(x)
        x = self.norm5(x)
        x = F.relu(x, inplace=True)
        return self.head(x)


def remap_densenet_state_dict(state_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Remap legacy FastAI-style DenseNet keys to torchvision DenseNet keys."""
    has_legacy_prefix = any(k.startswith("0.0.") for k in state_dict)
    has_legacy_head = any(k.startswith("1.") for k in state_dict)

    if not (has_legacy_prefix and has_legacy_head):
        return state_dict

    mapped: Dict[str, Any] = {}
    for key, value in state_dict.items():
        if key.startswith("0.0."):
            mapped[f"features.{key[4:]}"] = value
        elif key.startswith("1."):
            mapped[f"classifier.{key[2:]}"] = value
        else:
            mapped[key] = value

    return mapped


def build_densenet121_model_from_state_dict(state_dict: Dict[str, Any], num_classes: int) -> nn.Module:
    """Build a DenseNet121 model instance that matches a checkpoint state_dict."""
    model = models.densenet121(weights=None)

    # Detect and use a FastAI-style classifier head if present.
    if any(key.startswith("classifier.2.") for key in state_dict):
        if "classifier.4.weight" not in state_dict:
            raise ValueError("Custom DenseNet checkpoint is missing classifier head weights")
        if "classifier.8.weight" not in state_dict:
            raise ValueError("Custom DenseNet checkpoint is missing final classifier weights")

        output_classes = state_dict["classifier.8.weight"].shape[0]
        if output_classes != num_classes:
            raise ValueError(
                f"Checkpoint output classes ({output_classes}) do not match expected classes ({num_classes})"
            )

        hidden_features = state_dict["classifier.4.weight"].shape[0]
        model.classifier = nn.Sequential(
            AdaptiveConcatPool2d(),
            nn.Flatten(),
            nn.BatchNorm1d(2048),
            nn.ReLU(inplace=True),
            nn.Linear(2048, hidden_features, bias=False),
            nn.ReLU(inplace=True),
            nn.BatchNorm1d(hidden_features),
            nn.ReLU(inplace=True),
            nn.Linear(hidden_features, output_classes, bias=False),
        )

        def fastai_forward(self, x: torch.Tensor) -> torch.Tensor:
            x = self.features(x)
            x = F.relu(x, inplace=True)
            return self.classifier(x)

        model.forward = fastai_forward.__get__(model, model.__class__)
    else:
        model.classifier = nn.Linear(model.classifier.in_features, num_classes)

    return model


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


def validate_densenet_model(model_path: Path, expected_classes: int) -> tuple[bool, str]:
    """
    Validate a DenseNet121 checkpoint file by loading the state_dict and
    checking that it can be loaded into a DenseNet121 classifier with the
    expected number of output classes.

    Returns:
        (is_valid, validation_log)
    """
    try:
        checkpoint = load_model_file(model_path)
        state_dict = extract_state_dict(checkpoint)
        normalized_state_dict = remap_densenet_state_dict(state_dict)

        model = build_densenet121_model_from_state_dict(normalized_state_dict, expected_classes)
        incompatible = model.load_state_dict(normalized_state_dict, strict=False)

        missing = [k for k in incompatible.missing_keys if "classifier" not in k]
        if len(missing) > 20:
            return False, f"Model has too many unexpected missing keys ({len(missing)}). Architecture mismatch."

        if incompatible.unexpected_keys:
            return False, (
                "Model has unexpected keys after normalization. "
                f"Unexpected keys: {incompatible.unexpected_keys[:10]}"
            )

        return True, f"Validation passed. {expected_classes} output classes confirmed."
    except Exception as e:
        return False, f"Validation failed: {e}"
