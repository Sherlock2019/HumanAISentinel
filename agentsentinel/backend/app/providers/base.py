from abc import ABC, abstractmethod
from app.schemas.contracts import IntentResult, JudgeResult

class SafetyProvider(ABC):
    @abstractmethod
    def evaluate(self, payload: dict) -> JudgeResult:
        raise NotImplementedError

    def predict_intent(self, payload: dict) -> IntentResult:
        """Estimate the likely objective of an observed action sequence. Advisory only."""
        raise NotImplementedError
