## Decisions

**D1. Attach to dict results only.** Lists and scalars stay untouched so existing tool contracts
do not change; every workflow tool returns a dict.

**D2. Fail silent.** Offline, no tag or an unwritable config dir returns no notice; a tool call
never fails because of the lookup. The cost is up to one `git ls-remote` (60 s timeout) per day.

**D3. Opt-out by environment**, also used by the test suite so tests never reach the network.
