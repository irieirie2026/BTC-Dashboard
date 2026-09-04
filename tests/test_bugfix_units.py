"""Smoke tests for researcher-bot unit/scale bugs."""

from btc_data.fetchers import normalize_hash_rate_ehs, _scale_bg_value
from server import _parse_deribit_option_name, _parse_compact_btc, _bt_num
from timeseries_models import _origin_budget
from cross_market import _robust_median


def test_hash_rate_ths_not_ehs():
    assert abs(normalize_hash_rate_ehs(1_089_484_806.1) - 1089.48) < 1
    assert 50 <= normalize_hash_rate_ehs(1.089e21) <= 5000
    assert normalize_hash_rate_ehs(901.7) == 901.7
    assert normalize_hash_rate_ehs(1_089_484_806.1) < 5000


def test_supply_in_profit_clamped():
    spec = {"path": "profit-loss", "scale": 100, "value_key": "profitLoss"}
    assert _scale_bg_value(0.89, 100, spec) == 89.0
    assert _scale_bg_value(89.1, 100, spec) == 89.1
    assert _scale_bg_value(2.598, 100, spec) == 100.0
    assert _scale_bg_value(259.81, 100, spec) == 100.0


def test_deribit_one_digit_day():
    parsed = _parse_deribit_option_name("BTC-4SEP26-110000-C")
    assert parsed is not None
    _, strike, side = parsed
    assert strike == 110000
    assert side == "call"


def test_datco_compact_and_dict():
    assert abs(_parse_compact_btc("1.270M") - 1_270_000) < 1
    assert _bt_num({"display_value": 640123}) == 640123


def test_ts_5y_origin_budget():
    assert _origin_budget(1825) == (8, 8)
    assert _origin_budget(3650) == (8, 8)


def test_datco_allows_public_company():
    from server import _bt_normalize_company

    c = _bt_normalize_company(
        {
            "type": "PUBLIC_COMPANY",
            "name": "Strategy",
            "slug": "strategy",
            "btc_balance": {"display_value": 640000},
            "ticker": {"symbol": "MSTR"},
        },
        100000,
    )
    assert c and c["btc"] == 640000


def test_mexc_outlier_median():
    vals = [100_000, 100_200, 99_800, 12_500_000]
    med = _robust_median(vals)
    assert med is not None
    assert abs(med - 100_000) < 500
