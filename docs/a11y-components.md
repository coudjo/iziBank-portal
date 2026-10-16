# Accessibility gate per component (frontend plan 4.2.1 rule 5)

| Component                                                            | axe (3 viewports) | Keyboard                           | Screen reader   | Notes                                                                           |
| -------------------------------------------------------------------- | ----------------- | ---------------------------------- | --------------- | ------------------------------------------------------------------------------- |
| `ib-button`                                                          | Pass              | Pass (native button)               | Not yet checked | Loading sets `aria-busy` and disables.                                          |
| `ib-form-field` + `ibControl`                                        | Pass              | Pass                               | Not yet checked | Label `for`, `aria-describedby` (hint, error), `aria-invalid`, `aria-required`. |
| `ib-status-chip`                                                     | Pass              | Pass (explain variant is a button) | Not yet checked | Icon is decorative; the label carries the meaning.                              |
| `ib-banner`                                                          | Pass              | n/a                                | Not yet checked | `role="alert"` for danger and warning, `role="status"` otherwise.               |
| `ib-page-header`                                                     | Pass              | Pass                               | Not yet checked | h1 receives focus after navigation.                                             |
| `ib-empty-state`                                                     | Pass              | n/a                                | Not yet checked |                                                                                 |
| `ib-error-summary`                                                   | Pass              | Pass (items focus their field)     | Not yet checked | `role="alert"`, takes focus on submit.                                          |
| `ib-phone-input`, `ib-date-input`, `ib-combobox`, `ib-lookup-select` | Pass              | Pass (native controls)             | Not yet checked | Label, hint and error wired through `ibControl`.                                |
| `ib-switch`                                                          | Pass              | Pass                               | Not yet checked | `role="switch"`, Yes or No in text.                                             |
| `ib-data-table`                                                      | Pass              | Pass (row link)                    | Not yet checked | Caption, `aria-sort`, pager with live count; cards below desktop.               |
| `ib-tabs`, `ib-stepper`                                              | Pass              | Pass                               | Not yet checked | `aria-current="page"` / `"step"`.                                               |
| `ib-masked-value`                                                    | Pass              | Pass                               | Not yet checked | `aria-pressed`; reveal and re-mask announced.                                   |
| Global search                                                        | Pass              | Pass (arrows, Enter, Esc)          | Not yet checked | Combobox with `aria-activedescendant` over a listbox.                           |
| Shell menus (`nz-dropdown`)                                          | Pass              | Partial                            | Not yet checked | See exceptions.                                                                 |

Screen reader checks (VoiceOver on macOS and iOS, TalkBack on Android) are a manual step before release.
