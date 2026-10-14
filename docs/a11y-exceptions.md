# Accessibility exceptions

Must be empty before release (frontend plan 4.2.1 rule 5).

| Component                                                   | Problem                                                                                                                                                        | Plan                                                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| User menu and phone "More" menu (`nz-dropdown` + `nz-menu`) | NG-ZORRO renders the menu without ARIA roles and without arrow-key movement. Roles are added in our template; arrow keys do not move between items (Tab does). | Replace with a CDK menu (`@angular/cdk/menu`) in F3-01 if the dropdown cannot be fixed in the wrapper. |
