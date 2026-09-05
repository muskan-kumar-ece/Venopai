import pytest
from unittest.mock import patch
from app.core.config import settings
from app.services.tax import (
    TaxService,
    TaxPricingMode,
    TaxTransactionType,
    TaxCalculationResult,
    calculate_gst,
)


def test_tax_state_classification_intra_state():
    """TAX-002: Customer state == VenopAI supply state -> INTRA_STATE (CGST + SGST)."""
    res = TaxService.calculate_tax(
        merchandise_amount_paise=100000,
        destination_state="Telangana",
        supply_state="Telangana",
        tax_rate_percent=18,
        pricing_mode="TAX_EXCLUSIVE",
    )
    assert res.tax_type == "CGST+SGST"
    assert res.total_tax_paise == 18000
    assert res.cgst_paise == 9000
    assert res.sgst_paise == 9000
    assert res.igst_paise is None
    assert res.rate_percent == 18
    assert res.pricing_mode == "TAX_EXCLUSIVE"
    assert res.taxable_amount_paise == 100000


def test_tax_state_classification_inter_state():
    """TAX-002: Customer state != VenopAI supply state -> INTER_STATE (IGST)."""
    res = TaxService.calculate_tax(
        merchandise_amount_paise=100000,
        destination_state="Karnataka",
        supply_state="Telangana",
        tax_rate_percent=18,
        pricing_mode="TAX_EXCLUSIVE",
    )
    assert res.tax_type == "IGST"
    assert res.total_tax_paise == 18000
    assert res.cgst_paise is None
    assert res.sgst_paise is None
    assert res.igst_paise == 18000


def test_tax_state_of_supply_comes_from_configuration():
    """Section 4: Prove state of supply is genuinely configuration-driven,
    not hardcoded to 'Telangana' in code.
    """
    # Test with supply state configured as "Maharashtra"
    with patch.object(settings, "VENOPAI_STATE_OF_SUPPLY", "Maharashtra"):
        # Customer in Maharashtra should be INTRA_STATE
        res_mh = TaxService.calculate_tax(
            merchandise_amount_paise=100000,
            destination_state="Maharashtra",
        )
        assert res_mh.tax_type == "CGST+SGST"

        # Customer in Telangana should now be INTER_STATE
        res_ts = TaxService.calculate_tax(
            merchandise_amount_paise=100000,
            destination_state="Telangana",
        )
        assert res_ts.tax_type == "IGST"


def test_tax_rate_comes_from_configuration():
    """Section 3 & 10: Prove tax rate is an operational configuration value,
    not an immutable business policy.
    """
    # Configure 12% GST
    with patch.object(settings, "DEFAULT_GST_RATE_PERCENT", 12):
        res_12 = TaxService.calculate_tax(
            merchandise_amount_paise=100000,
            destination_state="Telangana",
        )
        assert res_12.rate_percent == 12
        assert res_12.total_tax_paise == 12000
        assert res_12.cgst_paise == 6000
        assert res_12.sgst_paise == 6000

    # Configure 5% GST
    with patch.object(settings, "DEFAULT_GST_RATE_PERCENT", 5):
        res_5 = TaxService.calculate_tax(
            merchandise_amount_paise=100000,
            destination_state="Karnataka",
        )
        assert res_5.rate_percent == 5
        assert res_5.total_tax_paise == 5000
        assert res_5.igst_paise == 5000


def test_tax_pricing_mode_exclusive_vs_inclusive():
    """TAX-003: Tax-inclusive vs tax-exclusive calculation is configuration-driven."""
    # 1. TAX_EXCLUSIVE: merchandise 100,000 paise (₹1000.00) @ 18%
    # Taxable = 100,000, Tax = 18,000
    res_ex = TaxService.calculate_tax(
        merchandise_amount_paise=100000,
        destination_state="Telangana",
        tax_rate_percent=18,
        pricing_mode="TAX_EXCLUSIVE",
    )
    assert res_ex.pricing_mode == "TAX_EXCLUSIVE"
    assert res_ex.taxable_amount_paise == 100000
    assert res_ex.total_tax_paise == 18000

    # 2. TAX_INCLUSIVE: gross merchandise 118,000 paise (₹1180.00) @ 18%
    # Taxable = round(118000 * 100 / 118) = 100,000, Tax = 18,000
    res_inc = TaxService.calculate_tax(
        merchandise_amount_paise=118000,
        destination_state="Telangana",
        tax_rate_percent=18,
        pricing_mode="TAX_INCLUSIVE",
    )
    assert res_inc.pricing_mode == "TAX_INCLUSIVE"
    assert res_inc.taxable_amount_paise == 100000
    assert res_inc.total_tax_paise == 18000
    assert res_inc.cgst_paise == 9000
    assert res_inc.sgst_paise == 9000


def test_tax_integer_paise_precision_and_no_leak():
    """Section 6: Prove all calculations use integer paise without rounding discrepancies."""
    # 1495 paise (₹14.95) @ 18%
    # Total tax = round(1495 * 18 / 100) = round(269.1) = 269 paise
    # In round-to-even: CGST = round(269 / 2) = round(134.5) = 134 paise
    # SGST = 269 - 134 = 135 paise
    # CGST + SGST = 134 + 135 = 269 paise exactly! Zero paisa leakage.
    res = TaxService.calculate_tax(
        merchandise_amount_paise=1495,
        destination_state="Telangana",
        tax_rate_percent=18,
        pricing_mode="TAX_EXCLUSIVE",
    )
    assert res.total_tax_paise == 269
    assert res.cgst_paise == 134
    assert res.sgst_paise == 135
    assert res.cgst_paise + res.sgst_paise == res.total_tax_paise

    assert isinstance(res.total_tax_paise, int)
    assert isinstance(res.cgst_paise, int)
    assert isinstance(res.sgst_paise, int)


def test_tax_service_backward_compatibility_wrapper():
    """Verify calculate_gst backward compatibility function returns expected dictionary."""
    d = calculate_gst(
        taxable_amount_paise=50000,
        destination_state="Karnataka",
    )
    assert isinstance(d, dict)
    assert d["type"] == "IGST"
    assert d["rate_percent"] == 18
    assert d["total_tax_paise"] == 9000
    assert d["igst_paise"] == 9000
    assert d["taxable_amount_paise"] == 50000
    assert d["pricing_mode"] == "TAX_EXCLUSIVE"
