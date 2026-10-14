# Accessibility gate per component (frontend plan 4.2.1 rule 5)

| Component                     | axe (3 viewports) | Keyboard                           | Screen reader   | Notes                                                                           |
| ----------------------------- | ----------------- | ---------------------------------- | --------------- | ------------------------------------------------------------------------------- |
| `ib-button`                   | Pass              | Pass (native button)               | Not yet checked | Loading sets `aria-busy` and disables.                                          |
| `ib-form-field` + `ibControl` | Pass              | Pass                               | Not yet checked | Label `for`, `aria-describedby` (hint, error), `aria-invalid`, `aria-required`. |
| `ib-status-chip`              | Pass              | Pass (explain variant is a button) | Not yet checked | Icon is decorative; the label carries the meaning.                              |
| `ib-banner`                   | Pass              | n/a                                | Not yet checked | `role="alert"` for danger and warning, `role="status"` otherwise.               |
| `ib-page-header`              | Pass              | Pass                               | Not yet checked | h1 receives focus after navigation.                                             |
| `ib-empty-state`              | Pass              | n/a                                | Not yet checked |                                                                                 |
| Shell menus (`nz-dropdown`)   | Pass              | Partial                            | Not yet checked | See exceptions.                                                                 |

Screen reader checks (VoiceOver on macOS and iOS, TalkBack on Android) are a manual step before release.
