# API requests

Things the portal needs that the API does not yet provide. Build against a mock until each exists.
Starting list: frontend plan section 11 and UX design section 9.

## Open requests (2026-10-14)

| #                          | Need                                          | Used by                    | Suggested endpoint                                                 |
| -------------------------- | --------------------------------------------- | -------------------------- | ------------------------------------------------------------------ |
| P1 (done, A3-02)           | Current business day for the user's branch    | F3-03 top bar working date | `GET /business-day/current` (comes with A3)                        |
| P2 (customers done, A4-08) | Search across customers and accounts          | F3-04 global search        | Customers: `POST /parties/search`. Accounts: still needed after A6 |
| P3                         | Count of change requests the user can approve | F3-05 approvals badge      | `GET /change-requests/pending/count`                               |

## Notes from F5 (2026-10-15)

- Frontend plan 11 #6 (duplicate check): met by `POST /parties/search` with the ID number.
- Frontend plan 11 #1: the duplicate ID problem carries `existingPartyNumber` only; the portal looks up the name.
- Frontend plan 11 #5 (lookup applicability): still open. The portal filters individual ID types by code.
- Frontend plan 11 #8 (`rowVersion`): still open. `PUT /parties/{id}/individual` has no concurrency token, so two
  people editing the same customer overwrite each other without a `record.changed` warning.
- Frontend plan 11 #7 (phone normalisation): the portal sends E.164; the API stores what it receives. A customer
  saved through the API with `024...` would not be found by a portal search for the same number.

## Notes from F6 (2026-10-16)

| #   | Need                                              | Used by                                                                                        | Suggested change                                                       |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| P4  | Search rows say which active group a person is in | Group member and chairperson pickers (UX 6.4 step 4: "Already in group [name]" shown disabled) | Add `activeGroupPartyNumber` and `activeGroupName` to `PartySearchRow` |
| P5  | Search finds a business by registration number    | Business Check now after a lost create (UX 3.1)                                                | Include `BusinessDetail.RegistrationNumber` in the indexed matches     |

## Notes from F7 (2026-10-16)

| #   | Need                                                     | Used by                           | Suggested change                                                                                                                                                            |
| --- | -------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P6  | KYC status history (who verified or rejected, when, why) | KYC tab "status history" (UX 7.3) | `GET /parties/{id}/kyc/history`, or log KYC and supervision events with `entityType=Party` and the number, as now, and expose them to KYC officers without audit permission |
| P7  | Document type names on document summaries                | Documents tab, viewer labels      | Add `documentTypeName` to `DocumentSummary` (the portal maps codes through the lookup for now)                                                                              |
