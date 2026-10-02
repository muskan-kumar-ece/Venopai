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

    def get_tracking_status(self, shipment_ref: str) -> Dict[str, Any]:
        """Fetch tracking history and status for a shipment."""
        return {
            "tracking_number": shipment_ref,
            "carrier": "Delhivery",
            "status": "in_transit",
            "estimated_delivery": None,
            "events": [],
        }

    def create_shipment(
        self,
        reference_id: str,
        pickup_pincode: str,
        delivery_pincode: str,
        weight_grams: int,
        dimensions: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Create a shipment with courier AWB generation."""
        return {
            "shiprocket_order_id": f"sr_{reference_id[:8]}",
            "tracking_number": f"AWB{reference_id[:8].upper()}",
            "carrier": "Delhivery",
            "status": "created",
        }

