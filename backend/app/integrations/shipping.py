from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

class ShippingProvider(ABC):
    """Abstract interface for shipping providers (Shiprocket V1)."""

    @abstractmethod
    def check_serviceability(self, pincode: str) -> bool:
        """Check if destination PIN code is serviceable for delivery."""
        pass

    @abstractmethod
    def calculate_rate_and_eta(
        self,
        origin_pincode: str,
        destination_pincode: str,
        weight_grams: int,
    ) -> Dict[str, Any]:
        """Calculate shipping rate in paise and estimated delivery days.
        Returns:
            {
                "serviceable": bool,
                "rate_paise": int,
                "eta_days_min": int,
                "eta_days_max": int,
                "courier_name": str,
            }
        """
        pass
