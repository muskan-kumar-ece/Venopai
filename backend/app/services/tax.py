"""TaxService: Dedicated, centrally controlled tax capability for VenopAI (TAX-001 to TAX-005).

Authoritative Document Reconciliation:
- TAX-001: Every commerce order and paid service engagement must have a determinable taxable amount.
- TAX-002: The system distinguishes intra-state transactions (CGST + SGST) from inter-state
  transactions (IGST) based on customer destination state vs configured VenopAI state of supply.
- TAX-003: Tax-inclusive vs tax-exclusive pricing mode is a business configuration decision
  (Document 01 Open Question: 'Decision Required = Yes'). It is NOT locked as permanent hardcoded logic.
- TAX-004: Invoices and checkout summaries must provide taxable value and applicable tax breakdown.
- TAX-005: Tax calculation is a dedicated centrally controlled capability. Tax rates, state of supply,
  and pricing mode are strictly configuration-driven, never hardcoded as immutable business rules.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional, Dict, Any
from app.core.config import settings


class TaxPricingMode(str, Enum):
    """TAX-003: Business-configurable tax pricing mode."""
    TAX_EXCLUSIVE = "TAX_EXCLUSIVE"
    TAX_INCLUSIVE = "TAX_INCLUSIVE"


class TaxTransactionType(str, Enum):
    """TAX-002: State classification relationship."""
    INTRA_STATE = "INTRA_STATE"
    INTER_STATE = "INTER_STATE"


@dataclass(frozen=True)
class TaxCalculationResult:
    """Standardized output contract for TaxService (TAX-001, TAX-004).
    All monetary amounts are strictly integer paise. No floating point.
    """
    taxable_amount_paise: int
    tax_type: str  # "CGST+SGST" or "IGST"
    rate_percent: int
    total_tax_paise: int
    cgst_paise: Optional[int]
    sgst_paise: Optional[int]
    igst_paise: Optional[int]
    pricing_mode: str

    def to_dict(self) -> Dict[str, Any]:
        """Serialize for API response compatibility."""
        return {
            "taxable_amount_paise": self.taxable_amount_paise,
            "type": self.tax_type,
            "rate_percent": self.rate_percent,
            "total_tax_paise": self.total_tax_paise,
            "cgst_paise": self.cgst_paise,
            "sgst_paise": self.sgst_paise,
            "igst_paise": self.igst_paise,
            "pricing_mode": self.pricing_mode,
        }


class TaxService:
    """Dedicated centralized tax calculation engine (TAX-005)."""

    @staticmethod
    def get_configured_state_of_supply() -> str:
        """Retrieve state of supply from application configuration."""
        return getattr(settings, "VENOPAI_STATE_OF_SUPPLY", "Telangana")

    @staticmethod
    def get_configured_pricing_mode() -> str:
        """Retrieve pricing mode from application configuration."""
        return getattr(settings, "TAX_PRICING_MODE", TaxPricingMode.TAX_EXCLUSIVE.value)

    @staticmethod
    def get_configured_tax_rate() -> int:
        """Retrieve default tax rate percentage from application configuration."""
        return getattr(settings, "DEFAULT_GST_RATE_PERCENT", 18)

    @classmethod
    def determine_state_relationship(
        cls,
        destination_state: str,
        supply_state: Optional[str] = None,
    ) -> TaxTransactionType:
        """TAX-002: Classify transaction relationship based on customer state vs state of supply.
        The state of supply is configuration-driven and can be overridden.
        """
        effective_supply = (
            supply_state if supply_state is not None else cls.get_configured_state_of_supply()
        ).strip().lower()

        effective_dest = destination_state.strip().lower()

        if effective_dest == effective_supply:
            return TaxTransactionType.INTRA_STATE
        return TaxTransactionType.INTER_STATE

    @classmethod
    def calculate_tax(
        cls,
        merchandise_amount_paise: int,
        destination_state: str,
        shipping_amount_paise: int = 0,
        supply_state: Optional[str] = None,
        tax_rate_percent: Optional[int] = None,
        pricing_mode: Optional[str] = None,
        tax_shipping: bool = False,
    ) -> TaxCalculationResult:
        """TAX-001, TAX-002, TAX-003, TAX-004, TAX-005.
        
        Centralized tax calculation contract:
        - Inputs:
          * merchandise_amount_paise: Gross catalog merchandise value in integer paise.
          * destination_state: Customer delivery state.
          * shipping_amount_paise: Optional shipping charge in paise.
          * supply_state: VenopAI state of supply (defaults to configuration).
          * tax_rate_percent: Tax rate percentage (defaults to configuration).
          * pricing_mode: Pricing mode (defaults to configuration).
          * tax_shipping: Whether shipping charge is taxable.
        - Outputs:
          * TaxCalculationResult containing taxable amount, tax type, CGST, SGST, IGST, total tax.
        """
        # Obtain controlled configuration values
        rate = tax_rate_percent if tax_rate_percent is not None else cls.get_configured_tax_rate()
        mode = (pricing_mode if pricing_mode is not None else cls.get_configured_pricing_mode()).upper()
        state_rel = cls.determine_state_relationship(destination_state, supply_state=supply_state)

        # Determine gross taxable base
        taxable_base = merchandise_amount_paise + (shipping_amount_paise if tax_shipping else 0)

        # Calculate taxable amount and tax according to TAX-003 pricing mode
        if mode == TaxPricingMode.TAX_INCLUSIVE.value:
            # Taxable Amount = round(Gross * 100 / (100 + Rate))
            taxable_amount_paise = round(taxable_base * 100 / (100 + rate))
            total_tax_paise = taxable_base - taxable_amount_paise
        else:
            # TAX_EXCLUSIVE: Catalog price is taxable value; tax is added on top
            taxable_amount_paise = taxable_base
            total_tax_paise = round(taxable_amount_paise * rate / 100)

        # Classify and allocate tax breakdown (TAX-002)
        if state_rel == TaxTransactionType.INTRA_STATE:
            # Intra-state: split equally between CGST and SGST
            tax_type = "CGST+SGST"
            cgst_paise = round(total_tax_paise / 2)
            sgst_paise = total_tax_paise - cgst_paise
            igst_paise = None
        else:
            # Inter-state: allocate 100% to IGST
            tax_type = "IGST"
            cgst_paise = None
            sgst_paise = None
            igst_paise = total_tax_paise

        return TaxCalculationResult(
            taxable_amount_paise=taxable_amount_paise,
            tax_type=tax_type,
            rate_percent=rate,
            total_tax_paise=total_tax_paise,
            cgst_paise=cgst_paise,
            sgst_paise=sgst_paise,
            igst_paise=igst_paise,
            pricing_mode=mode,
        )


def calculate_gst(
    taxable_amount_paise: int,
    destination_state: str,
    shipping_amount_paise: int = 0,
    supply_state: Optional[str] = None,
    tax_rate_percent: Optional[int] = None,
    pricing_mode: Optional[str] = None,
    tax_shipping: bool = False,
) -> Dict[str, Any]:
    """Compatibility wrapper delegating directly to centralized TaxService (TAX-005)."""
    result = TaxService.calculate_tax(
        merchandise_amount_paise=taxable_amount_paise,
        destination_state=destination_state,
        shipping_amount_paise=shipping_amount_paise,
        supply_state=supply_state,
        tax_rate_percent=tax_rate_percent,
        pricing_mode=pricing_mode,
        tax_shipping=tax_shipping,
    )
    return result.to_dict()
