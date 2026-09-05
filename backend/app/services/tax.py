from typing import Dict, Any
from app.core.config import settings

def calculate_gst(taxable_amount_paise: int, destination_state: str) -> Dict[str, Any]:
    """TAX-001, TAX-002, TAX-005: Dedicated centralized GST calculation capability.
    - Intra-state (customer state == VenopAI state of supply): CGST (9%) + SGST (9%)
    - Inter-state (customer state != VenopAI state of supply): IGST (18%)
    All arithmetic performed in integer paise.
    """
    supply_state = settings.VENOPAI_STATE_OF_SUPPLY.strip().lower()
    dest_state = destination_state.strip().lower()

    gst_rate = settings.DEFAULT_GST_RATE_PERCENT # 18

    # Calculate total GST amount rounded to nearest paisa
    total_tax_paise = round(taxable_amount_paise * gst_rate / 100)

    if dest_state == supply_state:
        # Intra-state: CGST + SGST (half and half)
        cgst_paise = round(total_tax_paise / 2)
        sgst_paise = total_tax_paise - cgst_paise
        return {
            "type": "CGST+SGST",
            "rate_percent": gst_rate,
            "total_tax_paise": total_tax_paise,
            "cgst_paise": cgst_paise,
            "sgst_paise": sgst_paise,
            "igst_paise": None,
        }
    else:
        # Inter-state: IGST
        return {
            "type": "IGST",
            "rate_percent": gst_rate,
            "total_tax_paise": total_tax_paise,
            "cgst_paise": None,
            "sgst_paise": None,
            "igst_paise": total_tax_paise,
        }
