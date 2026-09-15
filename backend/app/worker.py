import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import text

from .config import get_settings
from .db import session_factory

logger = logging.getLogger("vahansync.worker")


def _retry_delay(attempts: int) -> timedelta:
    return timedelta(seconds=min(3600, 30 * (2 ** min(attempts, 7))))


async def _remove_object(base_url: str, service_key: str, bucket: str, file_key: str) -> None:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            f"{base_url}/storage/v1/object/remove/{bucket}",
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json",
            },
            json={"prefixes": [file_key]},
        )
    response.raise_for_status()


async def process_storage_cleanup_jobs(limit: int = 25) -> int:
    settings = get_settings()
    if (
        session_factory is None
        or not settings.supabase_url
        or not settings.supabase_service_role_key
    ):
        return 0

    now = datetime.now(timezone.utc)
    async with session_factory() as session:
        result = await session.execute(
            text(
                'select "id", "bucket", "fileKey", attempts from "storage_cleanup_jobs" '
                'where "completedAt" is null and "nextAttemptAt" <= :now '
                'order by "nextAttemptAt", "createdAt" limit :limit '
                "for update skip locked"
            ),
            {"now": now, "limit": limit},
        )
        jobs = [dict(row) for row in result.mappings().all()]
        for job in jobs:
            await session.execute(
                text(
                    'update "storage_cleanup_jobs" set attempts = attempts + 1, '
                    '"nextAttemptAt" = :next_attempt where "id" = :id'
                ),
                {
                    "id": job["id"],
                    "next_attempt": now + _retry_delay(int(job["attempts"])),
                },
            )
        await session.commit()

    processed = 0
    for job in jobs:
        try:
            await _remove_object(
                settings.supabase_url.rstrip("/"),
                settings.supabase_service_role_key,
                str(job["bucket"]),
                str(job["fileKey"]),
            )
        except (httpx.HTTPError, ValueError) as error:
            logger.warning("Storage cleanup failed for %s: %s", job["id"], error)
            continue
        async with session_factory() as session:
            await session.execute(
                text(
                    'update "storage_cleanup_jobs" set "completedAt" = :completed_at '
                    'where "id" = :id and "completedAt" is null'
                ),
                {"id": job["id"], "completed_at": datetime.now(timezone.utc)},
            )
            await session.commit()
        processed += 1
    return processed


async def run_worker() -> None:
    interval = max(1, int(os.getenv("WORKER_POLL_INTERVAL_SECONDS", "30")))
    while True:
        try:
            await process_storage_cleanup_jobs()
        except Exception:
            logger.exception("Background worker iteration failed")
        await asyncio.sleep(interval)


if __name__ == "__main__":
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    asyncio.run(run_worker())
