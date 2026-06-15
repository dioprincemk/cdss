"""
ai/preprocessing/image_utils.py
---------------------------------
Standalone image preprocessing helpers.

These functions are used by:
  - The inference engine (before prediction)
  - The upload validation endpoint (to check image integrity)
  - The Grad-CAM module (to reload the original for overlay)
"""
import hashlib
import io
from pathlib import Path
from typing import Tuple, Optional

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError


# Allowed MIME types and extensions for chest X-ray uploads
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg"}
ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/jpg"}

# ImageNet normalisation constants (must match training transform)
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD  = (0.229, 0.224, 0.225)


def validate_image_bytes(content: bytes) -> Tuple[bool, str, Optional[Tuple[int, int]]]:
    """
    Validate raw image bytes.

    Returns:
        (is_valid, error_message_or_empty, (width, height) | None)
    """
    try:
        img = Image.open(io.BytesIO(content))
        img.verify()  # Checks for truncated / corrupt files
        # Re-open after verify (verify closes the fp)
        img = Image.open(io.BytesIO(content))
        return True, "", img.size
    except UnidentifiedImageError:
        return False, "File is not a recognised image format", None
    except Exception as e:
        return False, f"Image validation failed: {str(e)}", None


def load_and_normalise(
    image_path: Path,
    target_size: int = 224,
    to_grayscale: bool = False,
) -> np.ndarray:
    """
    Load a chest X-ray, resize, optionally convert to grayscale,
    and return a float32 NumPy array in [0, 1] range.
    Shape: (H, W, 3) for RGB or (H, W) for grayscale.
    """
    img = Image.open(image_path).convert("L" if to_grayscale else "RGB")
    img = img.resize((target_size, target_size), Image.LANCZOS)
    arr = np.array(img, dtype=np.float32) / 255.0
    return arr


def compute_sha256(content: bytes) -> str:
    """Return the hex-encoded SHA-256 digest of raw bytes."""
    return hashlib.sha256(content).hexdigest()


def get_image_dimensions(image_path: Path) -> Tuple[int, int]:
    """Return (width, height) of an image file."""
    with Image.open(image_path) as img:
        return img.size


def apply_clahe(image_path: Path) -> Image.Image:
    """
    Apply CLAHE (Contrast Limited Adaptive Histogram Equalisation)
    to improve chest X-ray contrast before display.
    Returns a PIL Image in RGB mode.

    Note: Used for display enhancement only, NOT for model inference
    (model expects standard ImageNet preprocessing).
    """
    import cv2
    img_gray = np.array(Image.open(image_path).convert("L"))
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(img_gray)
    # Convert to RGB for consistent downstream handling
    rgb = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2RGB)
    return Image.fromarray(rgb)
