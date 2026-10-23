## Decisions

**D1. Thread, not async browser.** The tools are synchronous and use Playwright's sync API;
`asyncio.to_thread` in the one wrapper fixes every tool. Alternative rejected: porting the
driver to the async API.

**D2. Candidates follow the page.** A draft must only offer what `publish_quote` can encode, so
flavors without a family and other-OS variants are filtered at the provider, not at publish.
