## Decisions

- Standard-library writer (zip + XML) instead of a spreadsheet library: the sheet is one table, and
  a dependency needs the owner's approval. Links use the `HYPERLINK` formula, which Excel,
  LibreOffice and Google Sheets all open, so no relationship parts are needed.
- The sheet is checked by reading it back with openpyxl in a throwaway environment, not in the
  project's dependencies.
- Totals come from the list as the calculator reports it (USD list price).
