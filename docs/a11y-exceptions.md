# Accessibility exceptions

Must be empty before release (frontend plan 4.2.1 rule 5).

| Component                  | Problem                                                                                                                                                        | Plan                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `ib-signature-pad` drawing | Drawing a signature needs a pointer (finger, stylus or mouse); there is no keyboard way to sign. Clear, the confirmation tick and Accept all work by keyboard. | Accepted under WCAG 2.1.1's exception for path-dependent input. Not a release blocker. |
