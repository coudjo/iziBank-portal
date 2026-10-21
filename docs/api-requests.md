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

## Notes from F8 (2026-10-17)

| #   | Need                                                                        | Used by                                               | Suggested change                                                                                   |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| P3  | (still open) One count, and ideally one list, of what this user can approve | Approvals badge and inbox                             | `GET /approvals/pending` with type, record, requested by and when; excludes the caller's own items |
| P8  | Photos and signatures awaiting approval                                     | Approvals inbox Photos tab (UX 6.6)                   | `GET /parties/pending-images` or a filter on search                                                |
| P9  | Who created a customer, on search rows                                      | Inbox "who created it" column; four-eyes in the badge | Add `createdByUserId` and `createdByName` to `PartySearchRow`                                      |
| P10 | When a ledger account was created                                           | Inbox "when" and age for new ledger accounts          | Add `createdOn` to `LedgerAccountView`                                                             |

## Notes from F9 (2026-10-17)

| #   | Need                                            | Used by                                              | Suggested change                                                                                    |
| --- | ----------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| P11 | Who opened an account, on account list rows     | Approvals inbox Accounts tab: four-eyes in the badge | Add `openedByUserId` and `openedByName` to `AccountListRow`                                         |
| P12 | Accounts in the global search                   | Global search overlay (UX 4.1)                       | None needed: `POST /accounts/search` serves it; the overlay change is portal work (F9 follow-up)    |
| P13 | Eligibility of a group's members as signatories | Open account, group signatories                      | Add `hasEffectiveSignature`, KYC and approval state to `GroupMemberView` (the portal searches each) |

## Notes from F10 (2026-10-17)

| #   | Need                                 | Used by                                                                                 | Suggested change                           |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------ |
| P14 | Ledger accounts filtered by currency | Product control account picker (loads 100 accounts and filters by currency on the page) | Add `currencyId` to `GET /ledger-accounts` |

## Notes from F11a (2026-10-20)

| #   | Need                                                           | Used by                                                                                   | Suggested change                                                                                                            |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| P15 | Staff search term out of the URL                               | Staff list search (a staff member's name in a query string reaches proxy and server logs) | Accept the term in a `POST /staff-users/search` body, as `POST /accounts/search` does                                       |
| P16 | Sessions of one staff member                                   | Staff record Sessions tab (reads the latest 100 sessions and filters on the page)         | Add `staffUserId` to `GET /sessions`                                                                                        |
| P17 | A reason when disabling a staff member or resetting a password | Staff record actions (UX 6.10 step 6: "each with a reason")                               | Add `reason` to `PUT /staff-users/{id}` when `isDisabled` changes, and to `reset-secret-key`; record it in the activity log |
