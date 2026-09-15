from pathlib import Path
import sys

backend_root = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(backend_root))

from app.main import app

__all__ = ["app"]
