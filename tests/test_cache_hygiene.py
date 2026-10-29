import os
import time

from autocalc.client import Calculator


def test_prune_only_generated_cache_and_bounds_size(tmp_path):
    stale = tmp_path / ('a' * 40 + '.json')
    stale.write_text('old')
    os.utime(stale, (0, 0))
    older = tmp_path / ('b' * 40 + '.json')
    newer = tmp_path / ('c' * 40 + '.json')
    older.write_text('12345')
    newer.write_text('67890')
    now = time.time()
    os.utime(older, (now - 1, now - 1))
    keep = tmp_path / 'customer.json'
    keep.write_text('private')
    result = Calculator(cache_dir=tmp_path).prune_cache(max_bytes=5)
    assert result['removed'] == 2
    assert not stale.exists() and not older.exists()
    assert newer.exists() and keep.read_text() == 'private'


def test_prune_absent_cache_does_not_create_it(tmp_path):
    target = tmp_path / 'missing'
    assert Calculator(cache_dir=target).prune_cache()['removed'] == 0
    assert not target.exists()
