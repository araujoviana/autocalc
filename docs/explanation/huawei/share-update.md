# `share/update` keeps the list key and the share link

Observed 2026-11-02 on calculator frontend 11.4.201, with a throwaway list on the maintainer's own
account (named `[autocalc] SPIKE delete me`, deleted afterwards). No client data.

| Step | Result |
|---|---|
| `share/add` with one ECS card (2 vCPU, 4 GB) | list key returned; total 38.74 USD |
| `share/update?key=<same key>` with a body of two ECS cards (adds a 4 vCPU, 8 GB card) | accepted |
| `share/list` | the same key is listed once |
| `share/detail?key=<same key>` | total is now 109.01 USD, so the new cards replaced the old ones |
| share URL | `…calculator.html?shareListId=<same key>&currentCurrency=USD`: unchanged, it only carries the key |
| `share/delete` | list gone from `share/list` |

So updating a list in place is possible: the key and the link a customer holds stay the same while
the content changes. `Session.update` already exists (used by `rename_price_list`).

## What this means for the publish gate

The gate (ADR-0003) saves first, verifies second, and deletes on a mismatch. That is safe for a new
list, because nobody holds its link yet. On an update the link is already out, so a failed check
cannot delete the list, and leaving a wrong price behind is worse than failing. An update path
would need the previous body saved first and put back when the check fails. That rollback is not
built and not tested.

## Not checked

- Whether an update changes the list's last-modified time or its position in the account's list.
- What a customer sees if they have the old link open during an update.
- Whether `share/update` with fewer cards, or with other currencies or settlement, behaves the same.
