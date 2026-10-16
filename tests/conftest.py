import sys
from pathlib import Path

# make tests/ importable (ecs_rebuild, golden) and repo root on the path
HERE = Path(__file__).resolve().parent
for p in (str(HERE), str(HERE.parent)):
    if p not in sys.path:
        sys.path.insert(0, p)
