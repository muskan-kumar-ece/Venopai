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
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Create a shipment with courier AWB generation."""
        clean_ref = str(reference_id).replace("-", "")[:8]
        return {
            "shiprocket_order_id": f"sr_{clean_ref}",
            "shiprocket_shipment_id": f"ship_{clean_ref}",
            "tracking_number": f"AWB{clean_ref.upper()}",
            "carrier": "Delhivery",
            "courier_company_id": 1,
            "booking_status": "awb_assigned",
            "status": "created",
        }

    def generate_label(self, shipment_id: Any) -> Dict[str, Any]:
        """Generate or retrieve shipping label URL for a booked shipment."""
        return {
            "label_url": f"https://shipping.venopai.in/labels/sim_{shipment_id}.pdf",
            "label_status": "generated",
            "shipment_id": str(shipment_id),
        }

    def schedule_pickup(self, shipment_id: Any, pickup_date: Optional[str] = None) -> Dict[str, Any]:
        """Request carrier pickup for a booked shipment."""
        return {
            "pickup_token_number": f"SIM-PK-{str(shipment_id)[:8]}",
            "pickup_scheduled_date": pickup_date or "2026-10-15 10:00:00",
            "pickup_status": "scheduled",
            "shipment_id": str(shipment_id),
        }

    def generate_manifest(self, shipment_ids: Any) -> Dict[str, Any]:
        """Generate shipping manifest document for shipments."""
        s_list = shipment_ids if isinstance(shipment_ids, list) else [shipment_ids]
        return {
            "manifest_url": f"https://shipping.venopai.in/manifests/sim_batch_{len(s_list)}.pdf",
            "manifest_status": "generated",
            "shipment_ids": [str(s) for s in s_list],
        }

    def print_manifest(self, order_ids: Any) -> Dict[str, Any]:
        """Print or retrieve generated manifest PDF link."""
        o_list = order_ids if isinstance(order_ids, list) else [order_ids]
        return {
            "manifest_url": f"https://shipping.venopai.in/manifests/sim_orders_{len(o_list)}.pdf",
            "manifest_status": "generated",
            "order_ids": [str(o) for o in o_list],
        }


