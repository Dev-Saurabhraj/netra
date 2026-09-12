import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from sqlalchemy.future import select

from app.core.logging import logger
from app.infrastructure.database.session import AsyncSessionLocal
from app.infrastructure.database.models.discovery import DiscoveryRun, DiscoveryRunStatus
from app.api.routes.discovery import run_discovery_background
from app.infrastructure.websocket.hub import ws_hub


class DiscoveryScheduler:
    """
    Asynchronous background scheduler for automated periodic network discovery cycles.
    Guarantees non-overlapping execution and provides real-time status telemetry.
    """
    _instance: Optional["DiscoveryScheduler"] = None

    def __init__(self):
        self.is_enabled: bool = False
        self.interval_seconds: int = 60
        self.last_run_at: Optional[datetime] = None
        self.next_run_at: Optional[datetime] = None
        self.is_running: bool = False
        self._task: Optional[asyncio.Task] = None
        self._stop_event: asyncio.Event = asyncio.Event()

    @classmethod
    def get_instance(cls) -> "DiscoveryScheduler":
        if cls._instance is None:
            cls._instance = DiscoveryScheduler()
        return cls._instance

    def start(self):
        """Start background scheduler loop."""
        if self._task and not self._task.done():
            return
        self._stop_event.clear()
        self._task = asyncio.create_task(self._worker_loop())
        logger.info("DiscoveryScheduler service started.")

    async def stop(self):
        """Gracefully stop background scheduler loop."""
        self._stop_event.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("DiscoveryScheduler service stopped.")

    def configure(self, enabled: bool, interval_seconds: Optional[int] = None) -> Dict[str, Any]:
        """Configure scheduler operational parameters."""
        self.is_enabled = enabled
        if interval_seconds is not None and interval_seconds >= 10:
            self.interval_seconds = interval_seconds
        
        if self.is_enabled:
            self.next_run_at = datetime.fromtimestamp(
                datetime.now(timezone.utc).timestamp() + self.interval_seconds,
                tz=timezone.utc
            )
        else:
            self.next_run_at = None

        logger.info(f"DiscoveryScheduler configured: enabled={self.is_enabled}, interval={self.interval_seconds}s")
        return self.get_status()

    def get_status(self) -> Dict[str, Any]:
        """Return current status dictionary."""
        return {
            "enabled": self.is_enabled,
            "interval_seconds": self.interval_seconds,
            "is_running": self.is_running,
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
            "next_run_at": self.next_run_at.isoformat() if self.next_run_at else None,
        }

    async def _worker_loop(self):
        """Continuous background loop evaluating discovery cadence."""
        while not self._stop_event.is_set():
            try:
                # Sleep in short increments to allow rapid responsive cancellation / interval updates
                await asyncio.sleep(1)

                if not self.is_enabled:
                    continue

                now = datetime.now(timezone.utc)
                if self.next_run_at and now >= self.next_run_at:
                    await self._trigger_scheduled_discovery()
                    self.last_run_at = datetime.now(timezone.utc)
                    self.next_run_at = datetime.fromtimestamp(
                        self.last_run_at.timestamp() + self.interval_seconds,
                        tz=timezone.utc
                    )
                    await ws_hub.broadcast("DISCOVERY_SCHEDULE_TRIGGERED", self.get_status())

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in DiscoveryScheduler worker loop: {e}")
                await asyncio.sleep(5)

    async def _trigger_scheduled_discovery(self):
        """Verify non-overlapping execution and launch discovery run."""
        if self.is_running:
            logger.warning("DiscoveryScheduler skipped tick: previous discovery cycle still running.")
            return

        async with AsyncSessionLocal() as session:
            # Check for any active discovery runs in progress
            res = await session.execute(
                select(DiscoveryRun).where(
                    DiscoveryRun.status.in_([DiscoveryRunStatus.RUNNING, DiscoveryRunStatus.QUEUED])
                )
            )
            active_run = res.scalars().first()
            if active_run:
                logger.warning(f"DiscoveryScheduler: Active run {active_run.id} found. Skipping automated tick.")
                return

            self.is_running = True
            try:
                # Create DiscoveryRun record in QUEUED state
                run = DiscoveryRun(
                    status=DiscoveryRunStatus.QUEUED,
                    total_targets=0,
                    processed_targets=0,
                    successful_targets=0,
                    failed_targets=0,
                    started_at=datetime.now(timezone.utc),
                    logs=[{"timestamp": datetime.now(timezone.utc).isoformat(), "message": "Scheduled discovery triggered by automated timer"}],
                )
                session.add(run)
                await session.commit()
                await session.refresh(run)

                logger.info(f"DiscoveryScheduler launched automated run {run.id}")
                # Execute in background task
                asyncio.create_task(self._run_with_lock(run.id))
            except Exception as e:
                self.is_running = False
                logger.error(f"Failed to trigger scheduled discovery run: {e}")

    async def _run_with_lock(self, run_id: str):
        """Execute discovery and ensure scheduler is_running flag resets upon completion."""
        try:
            await run_discovery_background(run_id)
        finally:
            self.is_running = False
            await ws_hub.broadcast("DISCOVERY_SCHEDULE_COMPLETED", self.get_status())


scheduler = DiscoveryScheduler.get_instance()

