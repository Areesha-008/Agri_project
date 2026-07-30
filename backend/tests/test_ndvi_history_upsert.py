"""
Runnable proof that upsert_history_row (ndvi_job_service.py) can never leave
two NdviHistory rows for the same (field, satellite_image_date) — the bug
that let one field accumulate 46 rows for 15 actual weeks. Hits the real
configured database directly (there's no DB-test fixture in this repo yet;
every other test here is a pure-function unit test) since this guarantee is
inherently a database interaction, not something a pure-function assert can
verify. Creates and tears down its own throwaway user+field.
"""

import uuid

from geoalchemy2.shape import from_shape
from shapely.geometry import Polygon

from app.db.session import SessionLocal
from app.models.field import Field
from app.models.ndvi_history import NdviHistory
from app.models.user import User
from app.services.ndvi_job_service import upsert_history_row

TEST_SATELLITE_DATE = "2099-01-01"  # far future — can't collide with real data


def _make_field(db) -> Field:
    user = User(email=f"upsert-test-{uuid.uuid4().hex}@example.invalid", hashed_password="x")
    db.add(user)
    db.flush()

    polygon = Polygon([(73.0, 31.0), (73.001, 31.0), (73.001, 31.001), (73.0, 31.001), (73.0, 31.0)])
    field = Field(user_id=user.id, name="upsert-test-field", geometry=from_shape(polygon, srid=4326))
    db.add(field)
    db.flush()
    return field


def test_repeated_upsert_for_same_date_never_duplicates():
    db = SessionLocal()
    field = None
    try:
        field = _make_field(db)
        db.commit()

        first_id = upsert_history_row(
            db,
            field.id,
            {
                "ndvi_mean": 0.1,
                "ndvi_min": 0.05,
                "ndvi_max": 0.15,
                "satellite_image_date": TEST_SATELLITE_DATE,
                "source_collection": "TEST",
            },
        )
        second_id = upsert_history_row(
            db,
            field.id,
            {
                "ndvi_mean": 0.9,
                "ndvi_min": 0.85,
                "ndvi_max": 0.95,
                "satellite_image_date": TEST_SATELLITE_DATE,
                "source_collection": "TEST",
            },
        )

        # Same row updated in place, not a second one inserted.
        assert first_id == second_id

        rows = (
            db.query(NdviHistory)
            .filter(NdviHistory.field_id == field.id, NdviHistory.satellite_image_date == TEST_SATELLITE_DATE)
            .all()
        )
        assert len(rows) == 1
        # The second call's values won — an update, not two independent rows.
        assert rows[0].ndvi_mean == 0.9
    finally:
        if field is not None:
            # Deleting the user cascades to the field (ON DELETE CASCADE),
            # which cascades to the ndvi_history row this test wrote.
            db.query(User).filter(User.id == field.user_id).delete()
            db.commit()
        db.close()


def test_upsert_collapses_drifted_duplicate_into_existing_row():
    """
    Two analysis runs of "the same real week" whose tile grids drifted by a
    day (different exact satellite_image_date, but overlapping date ranges)
    must land on the SAME row, not two rows a day or two apart — this is the
    exact bug that produced pairs of near-duplicate points on the NDVI chart
    instead of one point every 7 days.
    """
    db = SessionLocal()
    field = None
    try:
        field = _make_field(db)
        db.commit()

        first_id = upsert_history_row(
            db,
            field.id,
            {
                "ndvi_mean": 0.1,
                "ndvi_min": 0.05,
                "ndvi_max": 0.15,
                "date_range_start": "2099-06-24",
                "satellite_image_date": "2099-06-30",
                "source_collection": "TEST",
            },
        )
        # A later run's grid drifted a day forward — a different exact date,
        # but its 7-day window still contains the existing row's date.
        second_id = upsert_history_row(
            db,
            field.id,
            {
                "ndvi_mean": 0.9,
                "ndvi_min": 0.85,
                "ndvi_max": 0.95,
                "date_range_start": "2099-06-25",
                "satellite_image_date": "2099-07-01",
                "source_collection": "TEST",
            },
        )

        assert first_id == second_id

        rows = db.query(NdviHistory).filter(NdviHistory.field_id == field.id).all()
        assert len(rows) == 1
        # Original bucket date kept stable — the point doesn't jump position.
        assert str(rows[0].satellite_image_date) == "2099-06-30"
        # But the data itself is refreshed to the latest run's values.
        assert rows[0].ndvi_mean == 0.9
    finally:
        if field is not None:
            db.query(User).filter(User.id == field.user_id).delete()
            db.commit()
        db.close()
