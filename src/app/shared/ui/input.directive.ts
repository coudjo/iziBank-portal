import { Directive } from '@angular/core';

/**
 * Text inputs for features (`<input ibInput>`), styled like the rest of the controls without features importing
 * NG-ZORRO. Combine with `ibControl` inside an `ib-form-field`.
 */
@Directive({
  selector: 'input[ibInput], textarea[ibInput], select[ibInput]',
  host: { class: 'ant-input ib-input' },
})
export class InputDirective {}
