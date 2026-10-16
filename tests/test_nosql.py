"""GeminiDB (DynamoDB-compatible) builder reproduces the saved corpus card (render template + price)."""
import json
from pathlib import Path

import pytest

from autocalc.services.nosql import NosqlBuilder

CORPUS = Path(__file__).parent / "fixtures/corpus"


def _cards(o):
    if isinstance(o, list):
        for x in o:
            yield from _cards(x)
    elif isinstance(o, dict):
        if "selectedProduct" in o:
            yield o
        else:
            for v in o.values():
                yield from _cards(v)


@pytest.mark.live
def test_nosql_matches_corpus_card():
    real = next((c for f in sorted(CORPUS.glob("*.json")) for c in _cards(json.loads(f.read_text()))
                 if c["selectedProduct"]["serviceCode"] == "nosql"), None)
    if real is None:
        pytest.skip("no nosql card in tests/fixtures/corpus")
    mine = NosqlBuilder().build("sa-brazil-1", flavor="large.4", nodes=2, storage_gb=10)
    assert mine["rewriteValue"]["template_RENDER"] == real["rewriteValue"]["template_RENDER"]
    assert mine["buyUrl"] == real["buyUrl"]
    assert mine["selectedProduct"]["amount"] == pytest.approx(real["selectedProduct"]["amount"], abs=0.01)
