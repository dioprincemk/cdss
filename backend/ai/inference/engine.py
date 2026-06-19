"""
ai/inference/engine.py
-----------------------
Abstract inference interface + DenseNet121 implementation.

ARCHITECTURAL DECISION:
    The InferenceEngine is an abstract base class. The DenseNet121Engine
    implements it. Future models (ResNet, EfficientNet, custom architectures)
    only need to implement the same interface — zero frontend changes required.

    The frontend always calls POST /api/v1/ai/predict and receives:
        {
            "predicted_class": "Pneumonia",
            "confidence_scores": {"Normal": 0.02, "Pneumonia": 0.94, ...},
            "class_labels": ["Normal", "Pneumonia", "COVID-19", "Tuberculosis"]
        }

    Class labels are NEVER hardcoded in the frontend.
"""
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torchvision import models, transforms


# ── Abstract Base ─────────────────────────────────────────────────────────────
class InferenceEngine(ABC):
    """Abstract interface that all model implementations must follow."""

    @property
    @abstractmethod
    def class_labels(self) -> List[str]:
        """Return the list of disease class labels this model predicts."""
        ...

    @property
    @abstractmethod
    def architecture(self) -> str:
        """Return the architecture name (e.g., 'DenseNet121')."""
        ...

    @abstractmethod
    def predict(self, image_path: Path) -> Dict:
        """
        Run inference on a chest X-ray image.

        Returns:
            {
                "predicted_class": str,
                "confidence_scores": Dict[str, float],
                "top_confidence": float,
                "inference_time_ms": int,
            }
        """
        ...

    @abstractmethod
    def get_features(self, image_path: Path) -> torch.Tensor:
        """Return intermediate feature maps (used by Grad-CAM)."""
        ...


# ── Image Preprocessing ───────────────────────────────────────────────────────
def build_transform(input_size: int = 224) -> transforms.Compose:
    """
    ImageNet-normalised preprocessing pipeline.
    Matches the training transform for DenseNet121.
    """
    return transforms.Compose([
        transforms.Resize((input_size, input_size)),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225],
        ),
    ])


def load_image_as_tensor(image_path: Path, input_size: int = 224) -> torch.Tensor:
    """
    Load a chest X-ray from disk, convert to RGB, and apply preprocessing.
    Returns a (1, 3, H, W) tensor ready for inference.
    """
    img = Image.open(image_path).convert("RGB")
    transform = build_transform(input_size)
    tensor = transform(img)
    return tensor.unsqueeze(0)  # Add batch dimension


# ── DenseNet121 Implementation ────────────────────────────────────────────────
class DenseNet121Engine(InferenceEngine):
    """
    DenseNet121-based pulmonary disease classifier.

    Supports loading:
    - A full model checkpoint (.pth with state_dict)
    - A pickled model (.pkl)

    The model's final classifier layer is replaced to match the number of
    disease classes found in the uploaded model checkpoint.
    """

    def __init__(
        self,
        model_path: Path,
        disease_classes: List[str],
        input_size: int = 224,
        device: Optional[str] = None,
    ):
        self._class_labels = disease_classes
        self._input_size = input_size
        self._device = torch.device(
            device or ("cuda" if torch.cuda.is_available() else "cpu")
        )

        self._model = self._load_model(model_path, len(disease_classes))
        self._model.eval()

        # Grad-CAM hooks
        self._feature_maps: Optional[torch.Tensor] = None
        self._register_hooks()

    def _load_model(self, model_path: Path, num_classes: int) -> nn.Module:
        """Load DenseNet121, replace classifier head, load weights."""
        from ai.loaders.model_loader import extract_state_dict, load_model_file, remap_densenet_state_dict, build_densenet121_model_from_state_dict

        checkpoint = load_model_file(model_path)
        state_dict = extract_state_dict(checkpoint)
        normalized_state_dict = remap_densenet_state_dict(state_dict)

        model = build_densenet121_model_from_state_dict(normalized_state_dict, num_classes)
        model.load_state_dict(normalized_state_dict, strict=False)
        return model.to(self._device)

    def _register_hooks(self) -> None:
        """Register a forward hook on the last dense block for Grad-CAM."""
        def hook_fn(module, input, output):
            self._feature_maps = output

        # DenseNet121: last dense block is model.features.denseblock4
        self._model.features.denseblock4.register_forward_hook(hook_fn)

    @property
    def class_labels(self) -> List[str]:
        return self._class_labels

    @property
    def architecture(self) -> str:
        return "DenseNet121"

    def predict(self, image_path: Path) -> Dict:
        """Run inference and return structured prediction results."""
        start_ms = time.time()

        tensor = load_image_as_tensor(image_path, self._input_size).to(self._device)

        with torch.no_grad():
            logits = self._model(tensor)
            probabilities = torch.softmax(logits, dim=1)[0]

        probs_np = probabilities.cpu().numpy()
        confidence_scores = {
            label: float(round(float(prob), 4))
            for label, prob in zip(self._class_labels, probs_np)
        }

        top_idx = int(np.argmax(probs_np))
        predicted_class = self._class_labels[top_idx]
        top_confidence = float(probs_np[top_idx])

        elapsed_ms = int((time.time() - start_ms) * 1000)

        return {
            "predicted_class": predicted_class,
            "confidence_scores": confidence_scores,
            "top_prediction": predicted_class,
            "top_confidence": top_confidence,
            "inference_time_ms": elapsed_ms,
        }

    def get_features(self, image_path: Path) -> torch.Tensor:
        """Run a forward pass and return the captured feature maps."""
        tensor = load_image_as_tensor(image_path, self._input_size).to(self._device)
        with torch.no_grad():
            _ = self._model(tensor)
        return self._feature_maps

    def get_gradients_for_gradcam(
        self, image_path: Path, target_class_idx: Optional[int] = None
    ) -> tuple[torch.Tensor, torch.Tensor]:
        """
        Compute Grad-CAM gradients for the target class.

        Returns:
            (feature_maps, gradients) — both as tensors on CPU
        """
        tensor = load_image_as_tensor(image_path, self._input_size).to(self._device)
        tensor.requires_grad_(True)

        # Enable gradient tracking
        self._model.zero_grad()
        feature_maps = None
        gradients = None

        def save_features(module, input, output):
            nonlocal feature_maps
            feature_maps = output

        def save_gradients(module, grad_input, grad_output):
            nonlocal gradients
            gradients = grad_output[0]

        hook_fwd = self._model.features.denseblock4.register_forward_hook(save_features)
        hook_bwd = self._model.features.denseblock4.register_backward_hook(save_gradients)

        try:
            logits = self._model(tensor)
            if target_class_idx is None:
                target_class_idx = int(logits.argmax(dim=1).item())

            self._model.zero_grad()
            logits[0, target_class_idx].backward()
        finally:
            hook_fwd.remove()
            hook_bwd.remove()

        return feature_maps.detach().cpu(), gradients.detach().cpu()
