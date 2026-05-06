from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
BACKEND_MAIN = BACKEND / "main.py"

if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

spec = importlib.util.spec_from_file_location("_kodo_backend_main", BACKEND_MAIN)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Could not load backend app from {BACKEND_MAIN}")

module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

app = module.app

