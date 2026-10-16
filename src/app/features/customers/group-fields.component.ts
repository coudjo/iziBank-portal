import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { errorMessage } from '../../shared/forms/form-errors';
import {
  ComboboxComponent,
  DateInputComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  PhoneInputComponent,
} from '../../shared/ui';
import { GROUP_MESSAGES, MEETING_FREQUENCIES } from './group-form';

/** The group's own details (UX 6.4 step 1), shared by onboarding and the Details edit. */
@Component({
  selector: 'ib-group-fields',
  imports: [
    ReactiveFormsModule,
    ComboboxComponent,
    DateInputComponent,
    FormControlDirective,
    FormFieldComponent,
    InputDirective,
    PhoneInputComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0 var(--ib-space-5);
    }
    .wide {
      grid-column: 1 / -1;
    }
    @media (max-width: 1279.98px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
  `,
  template: `
    <div class="grid" [formGroup]="group()">
      <ib-form-field label="Group name" class="wide" [required]="true" [error]="error('groupName')">
        <input ibInput ibControl formControlName="groupName" autocomplete="off" maxlength="100" />
      </ib-form-field>
      <ib-form-field label="Formation date" hint="For example 01/06/2020" [error]="error('formationDate')">
        <ib-date-input formControlName="formationDate" />
      </ib-form-field>
      <ib-form-field
        label="Meeting frequency"
        hint="Choose from the list or type your own"
        [error]="error('meetingFrequency')"
      >
        <ib-combobox formControlName="meetingFrequency" [options]="frequencies" [maxLength]="30" />
      </ib-form-field>
      <ib-form-field label="Group mobile" [error]="error('mobile')">
        <ib-phone-input formControlName="mobile" autocomplete="off" />
      </ib-form-field>
      <ib-form-field label="Meeting place or address" [error]="error('address1')">
        <input ibInput ibControl formControlName="address1" autocomplete="off" maxlength="200" />
      </ib-form-field>
    </div>
  `,
})
export class GroupFieldsComponent {
  readonly group = input.required<FormGroup>();
  readonly submitted = input(false);

  protected readonly frequencies = MEETING_FREQUENCIES;

  protected error(name: string): string | null {
    const control = this.group().get(name);
    if (!control || control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    return errorMessage(control, GROUP_MESSAGES[name]);
  }
}
