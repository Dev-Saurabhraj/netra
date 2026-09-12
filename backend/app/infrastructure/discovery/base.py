from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
from app.domain.entities.observation import ObservationDomain, ObservationSourceType


class DiscoveryCollector(ABC):
    """
    Abstract Base Class for all network discovery collectors.
    Guarantees non-crashing execution, bounded timeouts/retries, and standardized ObservationDomain payloads.
    """
    def __init__(self, timeout_seconds: int = 5, max_retries: int = 2):
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries

    @abstractmethod
    async def collect(self, target_ip: str, credentials: Optional[Dict[str, Any]] = None) -> ObservationDomain:
        """
        Collect telemetry from a target device.
        Must catch all protocol errors and return a structured ObservationDomain without raising uncaught exceptions.
        """
        pass

