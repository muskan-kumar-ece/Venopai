"""Shiprocket package weight and volumetric measurement calculation module.

Implements:
- Dead weight calculation from product quantities and tare weight
- Volumetric weight calculation using the standard domestic divisor (5000)
- Billable (chargeable) weight determination with 0.5 kg minimum
- Safe handling of missing, zero, negative, or invalid dimensions
"""
import re
from typing import Any, Dict, Optional, Tuple


DEFAULT_VOLUMETRIC_DIVISOR = 5000
MIN_BILLABLE_WEIGHT_KG = 0.5


def calculate_volumetric_weight_kg(
    length_cm: Optional[float] = None,
    breadth_cm: Optional[float] = None,
    height_cm: Optional[float] = None,
    divisor: int = DEFAULT_VOLUMETRIC_DIVISOR,
) -> float:
    """Calculate volumetric weight in kilograms: (L x B x H) / divisor.
    
    Returns 0.0 if any dimension is missing, non-positive, or non-numeric.
    """
    if length_cm is None or breadth_cm is None or height_cm is None:
        return 0.0

    try:
        l = float(length_cm)
        b = float(breadth_cm)
        h = float(height_cm)
    except (ValueError, TypeError):
        return 0.0

    if l <= 0 or b <= 0 or h <= 0:
        return 0.0

    div = max(1, int(divisor))
    return round((l * b * h) / float(div), 3)


def parse_dimensions_string(dim_str: Optional[str]) -> Optional[Tuple[float, float, float]]:
    """Safely parse dimensional strings like '10 x 5 x 2 cm' or '12 * 8 * 4'."""
    if not dim_str or not isinstance(dim_str, str):
        return None

    # Find float or integer patterns separated by x, X, or *
    matches = re.findall(r"(\d+(?:\.\d+)?)", dim_str)
    if len(matches) >= 3:
        try:
            l = float(matches[0])
            b = float(matches[1])
            h = float(matches[2])
            if l > 0 and b > 0 and h > 0:
                return (l, b, h)
        except (ValueError, IndexError):
            pass
    return None


def calculate_package_measurements(
    dead_weight_grams: int,
    length_cm: Optional[float] = None,
    breadth_cm: Optional[float] = None,
    height_cm: Optional[float] = None,
    divisor: int = DEFAULT_VOLUMETRIC_DIVISOR,
    min_billable_kg: float = MIN_BILLABLE_WEIGHT_KG,
    packaging_tare_grams: int = 0,
) -> Dict[str, Any]:
    """Calculate complete shipment package measurements and billable weight.
    
    Args:
        dead_weight_grams: Raw scale weight of products in grams
        length_cm: Package length in centimeters
        breadth_cm: Package breadth/width in centimeters
        height_cm: Package height in centimeters
        divisor: Volumetric weight divisor (default 5000)
        min_billable_kg: Minimum billable weight in kg (default 0.5kg)
        packaging_tare_grams: Packaging material weight in grams
    
    Returns:
        Dict with dead weight, volumetric weight, billable weight, dimensions, and flags.
    """
    safe_tare = max(0, packaging_tare_grams)
    safe_dead_grams = max(1, dead_weight_grams + safe_tare)
    dead_kg = round(safe_dead_grams / 1000.0, 3)

    vol_kg = calculate_volumetric_weight_kg(
        length_cm=length_cm,
        breadth_cm=breadth_cm,
        height_cm=height_cm,
        divisor=divisor,
    )

    billable_raw = max(dead_kg, vol_kg, min_billable_kg)
    billable_kg = round(billable_raw, 2)

    has_valid_dims = vol_kg > 0.0

    return {
        "dead_weight_grams": safe_dead_grams,
        "dead_weight_kg": dead_kg,
        "volumetric_weight_kg": vol_kg,
        "billable_weight_kg": billable_kg,
        "length_cm": float(length_cm) if (has_valid_dims and length_cm is not None) else None,
        "breadth_cm": float(breadth_cm) if (has_valid_dims and breadth_cm is not None) else None,
        "height_cm": float(height_cm) if (has_valid_dims and height_cm is not None) else None,
        "is_volumetric": vol_kg > dead_kg,
        "applied_min_billable": billable_raw == min_billable_kg and max(dead_kg, vol_kg) < min_billable_kg,
    }
