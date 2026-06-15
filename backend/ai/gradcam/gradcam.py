"""
ai/gradcam/gradcam.py
----------------------
Gradient-weighted Class Activation Mapping (Grad-CAM) implementation.

Grad-CAM produces a heatmap highlighting the regions of the chest X-ray
that most influenced the model's prediction — providing visual explainability
to assist clinicians in understanding AI decisions.

Reference: Selvaraju et al., "Grad-CAM: Visual Explanations from Deep
Networks via Gradient-based Localization", ICCV 2017.
"""
import uuid
from pathlib import Path
from typing import Optional, Tuple

import cv2
import numpy as np
import torch
from PIL import Image

from ai.inference.engine import DenseNet121Engine, load_image_as_tensor
from core.config.settings import get_settings

settings = get_settings()


def generate_gradcam(
    engine: DenseNet121Engine,
    image_path: Path,
    target_class_idx: Optional[int] = None,
    alpha: float = 0.5,
) -> Tuple[Path, Path]:
    """
    Generate Grad-CAM heatmap and overlay for a given image.

    Args:
        engine:           The loaded DenseNet121Engine
        image_path:       Path to the chest X-ray image
        target_class_idx: Class index to explain. If None, uses predicted class.
        alpha:            Blend weight for overlay (0=original, 1=heatmap)

    Returns:
        (heatmap_path, overlay_path) — paths to saved PNG files
    """
    feature_maps, gradients = engine.get_gradients_for_gradcam(image_path, target_class_idx)

    # ── Compute Grad-CAM weights ───────────────────────────────────────────────
    # Global average pool the gradients: shape (1, C, H, W) → (C,)
    weights = gradients.mean(dim=[0, 2, 3])  # (num_channels,)

    # Weighted combination of feature maps
    # feature_maps: (1, C, H, W)
    cam = torch.zeros(feature_maps.shape[2:], dtype=torch.float32)
    for i, w in enumerate(weights):
        cam += w * feature_maps[0, i]

    # ReLU — only keep positive activations
    cam = torch.relu(cam)

    # Normalise to [0, 1]
    cam_np = cam.numpy()
    if cam_np.max() > 0:
        cam_np = (cam_np - cam_np.min()) / (cam_np.max() - cam_np.min() + 1e-8)

    # ── Load original image ────────────────────────────────────────────────────
    original_img = np.array(Image.open(image_path).convert("RGB"))
    h, w = original_img.shape[:2]

    # Resize CAM to match original image
    cam_resized = cv2.resize(cam_np, (w, h))

    # ── Generate heatmap (COLORMAP_JET) ───────────────────────────────────────
    heatmap = cv2.applyColorMap(
        (cam_resized * 255).astype(np.uint8),
        cv2.COLORMAP_JET,
    )
    heatmap_rgb = cv2.cvtColor(heatmap, cv2.COLOR_BGR2RGB)

    # ── Overlay ────────────────────────────────────────────────────────────────
    overlay = cv2.addWeighted(
        original_img.astype(np.uint8), 1 - alpha,
        heatmap_rgb.astype(np.uint8), alpha,
        0,
    )

    # ── Save files ─────────────────────────────────────────────────────────────
    uid = uuid.uuid4().hex[:12]
    gradcam_dir = settings.GRADCAM_DIR
    gradcam_dir.mkdir(parents=True, exist_ok=True)

    heatmap_path = gradcam_dir / f"heatmap_{uid}.png"
    overlay_path = gradcam_dir / f"overlay_{uid}.png"

    Image.fromarray(heatmap_rgb).save(heatmap_path)
    Image.fromarray(overlay).save(overlay_path)

    return heatmap_path, overlay_path
