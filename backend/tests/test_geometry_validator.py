import pytest

from app.exceptions.custom_exceptions import InvalidGeometryError
from app.schemas.geometry import PolygonGeometry
from app.services.geometry_validator import calculate_area_hectares, validate_polygon


def _square_geometry(side_degrees: float, origin=(0.0, 0.0)) -> PolygonGeometry:
    """A closed square ring starting at `origin`, `side_degrees` on a side."""
    lon0, lat0 = origin
    lon1, lat1 = lon0 + side_degrees, lat0 + side_degrees
    return PolygonGeometry(
        type="Polygon",
        coordinates=[[[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]]],
    )


def test_calculate_area_hectares_equator_square():
    # At the equator, 1 degree ~= 111.32 km in both directions, so a
    # 0.01deg x 0.01deg square is ~1113.2m x 1113.2m.
    polygon = validate_polygon(_square_geometry(0.01))
    area_ha = calculate_area_hectares(polygon)
    expected_ha = (1113.2 * 1113.2) / 10_000
    assert area_ha == pytest.approx(expected_ha, rel=0.01)


def test_calculate_area_hectares_shrinks_with_latitude():
    # Longitude degrees cover less ground away from the equator (cos(lat)
    # scaling), so the same degree-sized square should compute a smaller
    # area at high latitude than at the equator.
    equator_polygon = validate_polygon(_square_geometry(0.01, origin=(0.0, 0.0)))
    high_lat_polygon = validate_polygon(_square_geometry(0.01, origin=(0.0, 60.0)))

    assert calculate_area_hectares(high_lat_polygon) < calculate_area_hectares(equator_polygon)


def test_validate_polygon_rejects_too_small():
    with pytest.raises(InvalidGeometryError):
        validate_polygon(_square_geometry(0.00001))


def test_validate_polygon_rejects_too_large():
    with pytest.raises(InvalidGeometryError):
        validate_polygon(_square_geometry(5.0))


def test_validate_polygon_rejects_holes():
    geometry = PolygonGeometry(
        type="Polygon",
        coordinates=[
            [[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]],
            [[0.002, 0.002], [0.004, 0.002], [0.004, 0.004], [0.002, 0.004], [0.002, 0.002]],
        ],
    )
    with pytest.raises(InvalidGeometryError):
        validate_polygon(geometry)


def test_validate_polygon_accepts_reasonable_field():
    polygon = validate_polygon(_square_geometry(0.01))
    assert polygon.is_valid
