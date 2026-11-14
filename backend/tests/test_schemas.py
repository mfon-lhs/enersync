import pytest
from pydantic import ValidationError

from app.schemas.asset import AssetCreate, AssetUpdate
from app.schemas.logistics_request import RequestCreate

# These tests check the input rules on their own, with no database and no web server.


def asset_fields(**changes):
    # A valid asset. Pass keyword arguments to change any of its fields
    fields = {
        "asset_tag": "ENS-PH-PUMP-001",
        "name": "Test Pump",
        "category": "Power Systems",
        "current_location": "Port Harcourt Hub",
    }
    fields.update(changes)
    return fields


def request_fields(**changes):
    fields = {"asset_id": 1, "origin": "Port Harcourt Hub", "destination": "Obagi Field Location"}
    fields.update(changes)
    return fields


def test_a_new_asset_gets_sensible_defaults():
    asset = AssetCreate(**asset_fields())

    assert asset.utilization_pct == 0
    assert asset.is_critical is False
    assert asset.inspection_interval_days == 90
    assert asset.capacity_value is None
    assert asset.latitude is None


def test_asset_accepts_every_command_center_field():
    asset = AssetCreate(
        **asset_fields(
            capacity_value=500,
            capacity_unit="kVA",
            utilization_pct=64.5,
            is_critical=True,
            inspection_interval_days=45,
            latitude=4.8156,
            longitude=7.0498,
        )
    )

    assert asset.capacity_unit == "kVA"
    assert asset.latitude == 4.8156


@pytest.mark.parametrize(
    "bad_fields",
    [
        {"latitude": 4.8},
        {"longitude": 7.0},
        {"capacity_value": 10},
        {"capacity_unit": "kVA"},
    ],
)
def test_pairs_must_come_together(bad_fields):
    with pytest.raises(ValidationError):
        AssetCreate(**asset_fields(**bad_fields))


@pytest.mark.parametrize(
    "bad_fields",
    [
        {"latitude": 91, "longitude": 7},
        {"latitude": -91, "longitude": 7},
        {"latitude": 4, "longitude": 181},
        {"latitude": 4, "longitude": -181},
        {"utilization_pct": -1},
        {"utilization_pct": 101},
        {"inspection_interval_days": 0},
        {"capacity_value": -5, "capacity_unit": "kVA"},
    ],
)
def test_numbers_must_stay_in_range(bad_fields):
    with pytest.raises(ValidationError):
        AssetCreate(**asset_fields(**bad_fields))


def test_asset_tag_must_still_start_with_ens():
    with pytest.raises(ValidationError):
        AssetCreate(**asset_fields(asset_tag="PUMP-001"))


def test_update_may_clear_capacity_and_position():
    update = AssetUpdate(capacity_value=None, capacity_unit=None, latitude=None, longitude=None)

    assert update.model_dump(exclude_unset=True) == {
        "capacity_value": None,
        "capacity_unit": None,
        "latitude": None,
        "longitude": None,
    }


@pytest.mark.parametrize("field", ["name", "utilization_pct", "is_critical", "inspection_interval_days"])
def test_update_refuses_null_for_required_fields(field):
    with pytest.raises(ValidationError):
        AssetUpdate(**{field: None})


def test_update_only_reports_the_fields_that_were_sent():
    update = AssetUpdate(utilization_pct=80)

    assert update.model_dump(exclude_unset=True) == {"utilization_pct": 80}


def test_request_priority_defaults_to_normal():
    assert RequestCreate(**request_fields()).priority == "Normal"


def test_request_refuses_an_unknown_priority():
    with pytest.raises(ValidationError):
        RequestCreate(**request_fields(priority="Urgent"))


def test_arrival_cannot_be_earlier_than_departure():
    with pytest.raises(ValidationError):
        RequestCreate(
            **request_fields(
                departure_date="2026-12-02T08:00:00Z",
                estimated_arrival_date="2026-12-01T08:00:00Z",
            )
        )


def test_arrival_at_or_after_departure_is_fine():
    request = RequestCreate(
        **request_fields(
            departure_date="2026-12-01T08:00:00Z",
            estimated_arrival_date="2026-12-01T08:00:00Z",
        )
    )

    assert request.estimated_arrival_date == request.departure_date


def test_dates_with_and_without_a_time_zone_can_be_compared():
    # One date has a time zone and the other does not. This must be a clear answer, not a crash.
    with pytest.raises(ValidationError):
        RequestCreate(
            **request_fields(
                departure_date="2026-12-02T08:00:00Z",
                estimated_arrival_date="2026-12-01T08:00",
            )
        )
