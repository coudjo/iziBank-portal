# API requests

Things the portal needs that the API does not yet provide. Build against a mock until each exists.
Starting list: frontend plan section 11 and UX design section 9.

## Open requests (2026-10-14)

| #                | Need                                          | Used by                    | Suggested endpoint                          |
| ---------------- | --------------------------------------------- | -------------------------- | ------------------------------------------- |
| P1 (done, A3-02) | Current business day for the user's branch    | F3-03 top bar working date | `GET /business-day/current` (comes with A3) |
| P2               | Search across customers and accounts          | F3-04 global search        | `GET /search?q=` (after A4 and A6)          |
| P3               | Count of change requests the user can approve | F3-05 approvals badge      | `GET /change-requests/pending/count`        |
