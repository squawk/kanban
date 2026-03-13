## 2024-05-24 - [Inefficient in-memory filtering of database results]
**Learning:** The codebase contained an anti-pattern where entire tables (comments, card_tags) were fetched into memory and then filtered using JavaScript's `.filter()`. This leads to significant performance degradation as the data grows (O(N) memory and CPU usage where N is the total number of rows in the table, rather than just the relevant rows).
**Action:** Always use database-level filtering (e.g., `where(inArray(...))` in Drizzle) to ensure only the necessary data is retrieved from the database.

## 2024-05-24 - [Batch deletion for collection operations]
**Learning:** Deleting multiple related records in a loop (e.g., card tags for multiple cards) creates an N+1 problem for deletions, resulting in many unnecessary database round-trips.
**Action:** Use batch operations with `inArray` or similar constructs to perform multiple deletions in a single database command.
