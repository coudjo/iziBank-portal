import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { LookupRow } from '../../core/api/api-types';
import { LookupsService } from '../../core/lookups/lookups.service';
import { errorMessage } from '../../shared/forms/form-errors';
import {
  ComboboxComponent,
  DateInputComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  LookupSelectComponent,
  PhoneInputComponent,
} from '../../shared/ui';
import { BUSINESS_MESSAGES, BusinessStep } from './business-form';
import { SOURCES_OF_FUNDS } from './individual-form';

/** One section of the business form (UX 6.3), shared by onboarding and the Details edit. */
@Component({
  selector: 'ib-business-fields',
  imports: [
    ReactiveFormsModule,
    ComboboxComponent,
    DateInputComponent,
    FormControlDirective,
    FormFieldComponent,
    InputDirective,
    LookupSelectComponent,
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
      @switch (section()) {
        @case ('business') {
          <ib-form-field label="Business name" class="wide" [required]="true" [error]="error('businessName')">
            <input ibInput ibControl formControlName="businessName" autocomplete="off" maxlength="150" />
          </ib-form-field>
          <ib-form-field
            label="Registration number"
            [required]="true"
            hint="As shown on the certificate"
            [error]="error('registrationNumber')"
          >
            <input
              ibInput
              ibControl
              formControlName="registrationNumber"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              maxlength="40"
            />
          </ib-form-field>
          <ib-form-field label="Legal form" [required]="true" [error]="error('businessCategoryId')">
            <ib-lookup-select formControlName="businessCategoryId" [options]="categories()" />
          </ib-form-field>
          <ib-form-field label="Tax identification number (TIN)" [error]="error('taxIdentificationNumber')">
            <input
              ibInput
              ibControl
              formControlName="taxIdentificationNumber"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              maxlength="30"
            />
          </ib-form-field>
          <ib-form-field
            label="Incorporation date"
            hint="For example 27/03/2015"
            [error]="error('incorporationDate')"
          >
            <ib-date-input formControlName="incorporationDate" />
          </ib-form-field>
        }
        @case ('contact') {
          <ib-form-field label="Mobile" hint="A mobile or a phone number is needed" [error]="error('mobile')">
            <ib-phone-input formControlName="mobile" autocomplete="off" />
          </ib-form-field>
          <ib-form-field label="Phone" [error]="error('phone')">
            <ib-phone-input formControlName="phone" autocomplete="off" />
          </ib-form-field>
          <ib-form-field label="Email" class="wide" [error]="error('emailAddress')">
            <input
              ibInput
              ibControl
              type="email"
              formControlName="emailAddress"
              autocomplete="off"
              maxlength="100"
            />
          </ib-form-field>
          <ib-form-field label="Address line 1" class="wide" [required]="true" [error]="error('address1')">
            <input ibInput ibControl formControlName="address1" autocomplete="off" maxlength="200" />
          </ib-form-field>
          <ib-form-field label="Address line 2" class="wide" [error]="error('address2')">
            <input ibInput ibControl formControlName="address2" autocomplete="off" maxlength="200" />
          </ib-form-field>
          <ib-form-field
            label="Source of funds"
            [required]="true"
            hint="Choose from the list or type your own"
            [error]="error('sourceOfFunds')"
          >
            <ib-combobox formControlName="sourceOfFunds" [options]="sources" [maxLength]="200" />
          </ib-form-field>
          <ib-form-field label="Sector" [error]="error('occupationOrSector')">
            <input
              ibInput
              ibControl
              formControlName="occupationOrSector"
              autocomplete="off"
              maxlength="100"
            />
          </ib-form-field>
        }
      }
    </div>
  `,
})
export class BusinessFieldsComponent {
  readonly section = input.required<BusinessStep>();
  readonly group = input.required<FormGroup>();
  readonly submitted = input(false);

  protected readonly sources = SOURCES_OF_FUNDS;
  private readonly rows = signal<LookupRow[]>([]);
  protected readonly categories = computed(() => this.rows().map(({ id, name }) => ({ id, name })));

  constructor() {
    inject(LookupsService)
      .list('business-categories')
      .then(
        (rows) => this.rows.set(rows),
        () => undefined,
      );
  }

  protected error(name: string): string | null {
    const control = this.group().get(name);
    if (!control || control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    return errorMessage(control, BUSINESS_MESSAGES[name]);
  }
}
