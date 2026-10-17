# Catalog drift

*Specs: `huawei/card-encoding` › Builders reproduce the saved-list corpus*

Huawei changes its catalog continuously. Flavors and OS images are delisted, RI prices change,
and specs are replaced. Two consequences:

- **Golden-test misses are usually drift, not bugs.** A saved list can reference a flavor that
  is no longer sold or an RI plan whose price changed since it was saved. Refresh the corpus
  ([how-to](../../how-to/refresh-corpus.md)) or attribute the miss to drift.
- **Old cards can't always round-trip.** For example, old EIP and VPN cards reference
  `12_bgp` / `19_share` bandwidth specs that the calculator replaced with traffic packages
  (`12_bgp_<N>GB`). Model them against the current specs.
