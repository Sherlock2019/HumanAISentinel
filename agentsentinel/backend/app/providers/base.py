from abc import ABC, abstractmethod
from app.schemas.contracts import JudgeResult

class SafetyProvider(ABC):
    @abstractmethod
    def evaluate(self, payload: dict) -> JudgeResult:
        raise NotImplementedError
