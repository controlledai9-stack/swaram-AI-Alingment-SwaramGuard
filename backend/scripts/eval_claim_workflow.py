"""Did it actually happen? Planted false "done" claims in a 3-worker database workflow; see app/services/claim_workflow.py.

    python scripts/eval_claim_workflow.py [trials_per_fault]
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.claim_workflow import evaluate  # noqa: E402

if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    print(json.dumps(evaluate(n), indent=2))
