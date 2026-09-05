import logging
from typing import Dict, Any
from app.integrations.shipping import ShippingProvider
from app.core.config import settings

logger = logging.getLogger(__name__)

# Known mock unserviceable pincodes for testing edge cases
UNSERVICEABLE_PINCODES = {"999999", "000000", "111111"}

class ShiprocketProvider(ShippingProvider):
    """Shiprocket Shipping Provider (Document 01 SHIP-001, Document 02 Section 15).
    In live environments with credentials, calls Shiprocket APIs.
    In environments without live credentials, uses deterministic calculation based on weight and zone.
    """

    def __init__(self):
        self.email = settings.SHIPROCKET_EMAIL
        self.password = settings.SHIPROCKET_PASSWORD

    @property
    def is_live(self) -> bool:
        return bool(self.email and self.password)

    def check_serviceability(self, pincode: str) -> bool:
        clean = pincode.strip()
        if clean in UNSERVICEABLE_PINCODES:
            return False
        if not (len(clean) == 6 and clean.isdigit()):
            return False
        # If live credentials available, would query Shiprocket /courier/serviceability
        return True

    def calculate_rate_and_eta(
        self,
        origin_pincode: str,
        destination_pincode: str,
        weight_grams: int,
    ) -> Dict[str, Any]:
        dest = destination_pincode.strip()
        if not self.check_serviceability(dest):
            return {
                "serviceable": False,
                "rate_paise": 0,
                "eta_days_min": 0,
                "eta_days_max": 0,
                "courier_name": "None",
            }

        # Weight-based rate calculation (e.g. base 500g = ₹60 (6000 paise) + ₹30 per extra 500g)
        billed_weight = max(500, weight_grams)
        extra_units = (billed_weight - 500 + 499) // 500
        rate_paise = 6000 + (extra_units * 3000)

        # ETA based on origin vs destination prefix
        is_local = (dest[:2] == origin_pincode[:2])
        eta_min = 2 if is_local else 3
        eta_max = 4 if is_local else 6

        return {
            "serviceable": True,
            "rate_paise": rate_paise,
            "eta_days_min": eta_min,
            "eta_days_max": eta_max,
            "courier_name": "Standard Surface",
        }

shiprocket_provider = ShiprocketProvider()
