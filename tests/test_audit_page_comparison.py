from autocalc.page.store import rewrite_mismatches


def test_checkbox_order_does_not_change_edit_state():
    assert rewrite_mismatches({"boxes": ["b", "a"]}, {"boxes": ["a", "b"]}) == []
    assert rewrite_mismatches({"boxes": ["a"]}, {"boxes": ["b"]}) == ["boxes"]
