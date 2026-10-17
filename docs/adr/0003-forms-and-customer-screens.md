# ADR 0003: Forms, controls and customer screens

Status: accepted (2026-10-15). Covers F3-04, F4-01, F4-02, F4-06, F5-01 to F5-05.

## Controls on native elements

The accessibility gate (frontend plan 4.2.1 rule 5) allows replacing an NG-ZORRO component when its wrapper cannot
meet WCAG 2.2 AA. These wrappers use native elements instead, styled with the NG-ZORRO input look (`.ant-input`):

| Wrapper            | Built on                       | Why                                                                                                                                                                      |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ib-date-input`    | text input, `dd/mm/yyyy`       | `nz-date-picker` works in `Date` objects (T8 forbids them for dates) and its calendar is hard to use with a screen reader. Typing is faster at a counter.                |
| `ib-lookup-select` | native `select`                | Keyboard, screen reader and phone pickers work with no extra code. Lookup lists are short.                                                                               |
| `ib-combobox`      | input with `datalist`          | Free text with suggestions (source of funds) and strict mode (nationality, D8: list only, case corrected on blur).                                                       |
| `ib-data-table`    | semantic `table` and our pager | Server paging, one sort column, cards below desktop width. The whole row is clickable through the row's own link (`.ib-row-link`), so there is no click handler on `tr`. |
| `ib-tabs`          | list of router links           | Each tab has a URL and uses `aria-current`; a `tablist` would need arrow-key handling for no gain.                                                                       |
| `ib-stepper`       | ordered list                   | Phone shows "Step n of 3" instead.                                                                                                                                       |
| `ib-switch`        | `button role="switch"`         | Shows Yes or No in text.                                                                                                                                                 |

Features use `ibInput` and `ib-icon` instead of importing NG-ZORRO.

## Forms

- `applyServerErrors` puts the API's `errors` on controls as a `server` error. Angular clears it on the next value
  change. Unknown fields go to the error summary.
- Re-binding a control (creating a new `formControlName`) re-runs validators and drops a server error. Multi-step
  forms therefore keep every step rendered and hide the others (`[hidden]`), instead of `@if`.
- `SubmitGuard` ignores a second submission while one runs (a promise guard; equivalent to `exhaustMap`).
- The error summary takes focus when it appears. It is set on submit, not on every keystroke.
- `unsavedChangesGuard` asks before leaving a dirty form, except after sign-out (in-memory data is discarded then).
- `AuthService.clear` now resets every in-memory store, so customer data and list filters go on any sign-out.

## Customers

- Search is `POST /parties/search` (API ADR A4-n). The global search and the list send a phone-like term as E.164,
  because the portal stores mobiles in E.164 (frontend plan 6.7), so `024 123 4567` finds `+233241234567`.
- The duplicate ID problem carries only `existingPartyNumber`. The portal looks the number up through search to show
  the name and the Open that customer link (UX 6.2 step 2).
- "Check now" after a lost create (UX 3.1) searches by the ID number and matches the name. There is no separate
  duplicate-check endpoint (api-requests #6 is met by search).
- Individual ID types are filtered in the portal by code (`GHANA_CARD`, `PASSPORT`, `DRIVERS_LICENCE`, `VOTER_ID`),
  the same list as the API's `LookupCodes`, until lookups carry applicability (frontend plan 11 #5).
- The minimum customer age is `minimumCustomerAgeYears` in `config.json` (D4, default 18). The API enforces its own
  value; the two must match.
- The record's Edit warning (UX 5.2) shows when the customer is approved or verified and a controlled field changes:
  first name, last name, date of birth, ID type, ID number (API A4-06).
- Record tabs not built yet show a placeholder in development builds only.

## Capture and uploads (F4-03 to F4-05)

- Photos are decoded with `createImageBitmap(file, { imageOrientation: 'from-image' })`, which applies EXIF
  orientation. JPEG quality steps 0.85, 0.75, 0.65, 0.55, 0.5; if still over 2 MB the drawing shrinks by 20% and the
  steps repeat.
- File types are told by their first bytes, like the API (`FileSignatures`), not by name or the browser's type.
- The `Idempotency-Key` is created when a file is captured or a signature accepted, and reused for every retry of
  that file (addendum section 4).
- Colours drawn into image pixels (white JPEG background, black signature ink) live in `shared/capture/pixel-colours.ts`,
  the one file outside the token files that `check:colours` allows.

## Businesses and groups (F6)

- `ib-menu-button` is built on `@angular/cdk/menu`, which gives the ARIA menu button pattern (roles, arrow keys,
  Esc, focus return). The New customer menu lists each kind only with its add permission: individual and business
  need PTY/PARTY add, group needs PTY/GROUPS add.
- The three onboarding pages share `OnboardingFlow` (steps, validation, submit outcomes) and
  `ib-onboarding-frame` (stepper, panels, error summary, action bar).
- Beneficial owners and the documents are not part of the business create form. They are added on the record
  (Beneficial owners tab; Documents in F7), as UX 6.3 step 3 describes.
- Owner shares are typed as text and checked in the portal: above 0, up to 100, two decimals, total at most 100.
  Saving replaces the whole list (`PUT /parties/{id}/beneficial-owners`).
- The chairperson is sent as the first member of `POST /parties/groups` with the CHAIRPERSON role; the API checks
  the person is an individual and not active in another group. A new group opens on its Members tab.
- Check now (UX 3.1) for a business or group matches the exact name within that customer type, because
  registration numbers are not searchable.
- "Already in group [name]" is shown after the API refuses the person, not in the picker beforehand: search rows do
  not say which group someone is in (api-requests P4).
- The raw initial-bundle warning budget is 800 kB (was 750 kB). The plan's limit is 250 kB gzipped for the sign-in
  page; the initial transfer is about 156 kB. Features stay lazy.

## KYC, documents and profile tabs (F7)

- Verify and approve is one call (`POST /parties/{id}/kyc/verify`, ADR D3). It is disabled with the reason in text
  when required checklist items are missing, or when the viewer created or last changed the customer (four-eyes).
  The API stays the authority: with `Supervision:AllowSelfApproval` on, the portal still applies four-eyes.
- Photo and signature approval use PTY/PARTY supervise; capture uses PTY/DOCUMENTS edit; documents use
  PTY/DOCUMENTS add and edit, matching the API's endpoint permissions.
- The viewer (`ib-file-viewer`) fetches each file only when shown, as a blob URL revoked on change or close. PDFs
  open in an iframe with `sandbox="allow-scripts"` (some browser PDF viewers need scripts; same-origin is not
  granted). Only `application/pdf` blobs go into the frame.
- `UploadTask` keeps the captured file and the request, so Retry sends the same `Idempotency-Key`. A refused file
  (wrong type, too large) is not offered for retry; it needs a new capture.
- When a new document's image upload fails, the document stays and the row opens for the image retry.
- The Activity tab needs SEC/AUDIT view and filters `GET /audit/activity` by `entityType=Party` and the customer
  number (the API logs customers by number). Document, photo and signature events logged under other entity types
  do not appear there yet.
- Regulatory attribute codes are upper snake case; a changed value is a new version, shown in History.

## Approvals (F8, F3-05)

- There is no "waiting for me" endpoint yet (api-requests P3). The inbox and badge are built from the lists the
  user may approve, each behind its supervise permission:
  - Customers (PTY/KYC supervise): `POST /parties/search` with `supervision=PENDING`, oldest first. Approving a
    customer is KYC verify (D3), so a row opens the customer's KYC tab.
  - Chart of accounts (LED/CHART supervise): `GET /ledger-accounts`, keeping new accounts awaiting approval and
    accounts with a pending rename. One endpoint approves either.
  - Security (SEC/PERMISSIONS supervise): `GET /change-requests?status=PENDING`.
- The badge counts items the user can act on, leaving out their own requests where the API says who asked
  (change requests, renames, ledger creators). Customer search rows do not carry the creator, so a supervisor's
  own customers are counted until they open them. It refreshes on sign-in, branch switch, after each decision
  and every 5 minutes.
- The changes panel compares a change request's `before` and `proposed` JSON field by field; lists show what was
  added and removed, and permission grants read as "PTY / PARTY: view, add".
- Photos and accounts have no pending lists yet (api-requests P8, and A6 for accounts), so those tabs are not
  shown. Reject on a never-approved ledger account deletes it; on a re-pended one it is not offered (UX 5.2).

## Accounts (F9)

- Account search goes to `POST /accounts/search` with the term in the body (API ADR A5-p). The list keeps its
  filters on the page only.
- The record has Summary, Holders, Balance and holds (ACC/CONDITION view), Conditions, Classification
  (ACC/CLASSIFICATION view) and Activity (SEC/AUDIT view). The Actions menu lists only what the user may do in the
  account's state: hold and release, freeze and unfreeze, dormancy (ACC/CONDITION edit), close (ACC/ACCOUNT
  delete). Nothing is offered on a pending or closed account. Reminders (ACC/ACCOUNT edit) and classifications are
  inline.
- Hold and release show the available balance after the change before the user confirms. Each dialog uses one
  `Idempotency-Key`, so a second press after a timeout cannot hold twice. Opening an account keeps its key after a
  lost connection and takes a new one otherwise.
- Close shows the API's close checks; the confirm button stays disabled until they pass and the typed account
  number matches.
- An account waiting for approval shows the approval bar on its record (ACC/ACCOUNT supervise), like customers
  are approved on their KYC tab. The inbox lists this branch's pending accounts (approval needs the account's
  branch). Without the opener on list rows (api-requests P11) a supervisor's own accounts are counted until they
  open them; the record applies four-eyes.
- Open account is one page in three sections. The holder picker shows why a customer cannot take a role (awaiting
  approval, not verified, no specimen signature) with an Open customer link. A group's signatories are chosen from
  its active members. The page is disabled while the business day is closed, and on a phone it first suggests a
  larger screen with "Continue anyway" (UX 3). The customer record's Open account passes the customer as router
  state, never in the URL.
- Balances read zero until the transactions phase; the card says "No transactions yet".
