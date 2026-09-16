from datetime import timedelta

from app.worker import _retry_delay


def test_cleanup_retry_delay_is_bounded_exponential_backoff() -> None:
    assert _retry_delay(0) == timedelta(seconds=30)
    assert _retry_delay(3) == timedelta(seconds=240)
    assert _retry_delay(99) == timedelta(seconds=3600)
