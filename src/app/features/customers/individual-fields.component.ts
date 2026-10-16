import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { LookupRow } from '../../core/api/api-types';
import { LookupsService } from '../../core/lookups/lookups.service';
import { NATIONALITIES } from '../../shared/data/nationalities';
import { errorMessage } from '../../shared/forms/form-errors';
import {
  ComboboxComponent,
  DateInputComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  LookupSelectComponent,
  PhoneInputComponent,
  SwitchComponent,
} from '../../shared/ui';
import {
  FIELD_MESSAGES,
  ID_HINTS,
  INDIVIDUAL_ID_TYPES,
  IndividualStep,
  SOURCES_OF_FUNDS,
  TITLES,
} from './individual-form';

/**
 * One section of the individual form (frontend plan 7.4 field tables), shared by onboarding and the Details edit.
 * Errors show after a field is left or after the section is submitted (UX 5.3).
 */
@Component({
  selector: 'ib-individual-fields',
  imports: [
    ReactiveFormsModule,
    ComboboxComponent,
    DateInputComponent,
    FormControlDirective,
    FormFieldComponent,
    InputDirective,
    LookupSelectComponent,
    PhoneInputComponent,
    SwitchComponent,
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
    .short {
      max-width: 12rem;
    }
  `,
  template: `
    <div class="grid" [formGroup]="group()">
      @switch (section()) {
        @case ('identity') {
          <ib-form-field label="Title" [error]="error('title')">
            <select ibInput ibControl formControlName="title" class="short">
              <option [ngValue]="null">None</option>
              @for (title of titles; track title) {
                <option [ngValue]="title">{{ title }}</option>
              }
            </select>
          </ib-form-field>
          <div></div>
          <ib-form-field label="First name" [required]="true" [error]="error('firstName')">
            <input ibInput ibControl formControlName="firstName" autocomplete="off" maxlength="60" />
          </ib-form-field>
          <ib-form-field label="Last name" [required]="true" [error]="error('lastName')">
            <input ibInput ibControl formControlName="lastName" autocomplete="off" maxlength="60" />
          </ib-form-field>
          <ib-form-field label="Gender" [required]="true" [error]="error('genderId')">
            <ib-lookup-select formControlName="genderId" [options]="genders()" />
          </ib-form-field>
          <ib-form-field
            label="Date of birth"
            [required]="true"
            hint="For example 27/03/1985"
            [error]="error('dateOfBirth')"
          >
            <ib-date-input formControlName="dateOfBirth" />
          </ib-form-field>
          <ib-form-field
            label="Nationality"
            [required]="true"
            hint="Start typing, then choose from the list"
            [error]="error('nationality')"
          >
            <ib-combobox
              formControlName="nationality"
              [options]="nationalities"
              [strict]="true"
              [maxLength]="50"
            />
          </ib-form-field>
          <div></div>
          <ib-form-field label="ID type" [required]="true" [error]="error('identificationTypeId')">
            <ib-lookup-select formControlName="identificationTypeId" [options]="idTypes()" />
          </ib-form-field>
          <ib-form-field
            label="ID number"
            [required]="true"
            [hint]="idHint()"
            [error]="error('identificationNumber')"
          >
            <input
              ibInput
              ibControl
              formControlName="identificationNumber"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              maxlength="30"
              (blur)="tidyId()"
            />
          </ib-form-field>
        }
        @case ('contact') {
          <ib-form-field
            label="Mobile"
            [required]="true"
            hint="For example 024 123 4567"
            [error]="error('mobile')"
          >
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
        }
        @case ('funds') {
          <ib-form-field
            label="Source of funds"
            [required]="true"
            hint="Choose from the list or type your own"
            [error]="error('sourceOfFunds')"
          >
            <ib-combobox formControlName="sourceOfFunds" [options]="sources" [maxLength]="200" />
          </ib-form-field>
          <ib-form-field label="Occupation or sector" [required]="true" [error]="error('occupationOrSector')">
            <input
              ibInput
              ibControl
              formControlName="occupationOrSector"
              autocomplete="off"
              maxlength="100"
            />
          </ib-form-field>
          <ib-form-field
            label="Politically exposed person"
            class="wide"
            hint="Someone who holds or has held a prominent public role, or a close family member or associate of such a person."
          >
            <ib-switch formControlName="isPoliticallyExposed" />
          </ib-form-field>
        }
      }
    </div>
  `,
})
export class IndividualFieldsComponent {
  readonly section = input.required<IndividualStep>();
  readonly group = input.required<FormGroup>();
  readonly submitted = input(false);

  private readonly lookups = inject(LookupsService);
  protected readonly titles = TITLES;
  protected readonly nationalities = NATIONALITIES;
  protected readonly sources = SOURCES_OF_FUNDS;

  private readonly genderRows = signal<LookupRow[]>([]);
  private readonly idTypeRows = signal<LookupRow[]>([]);
  protected readonly genders = computed(() => this.genderRows().map(({ id, name }) => ({ id, name })));
  protected readonly idTypes = computed(() =>
    this.idTypeRows()
      .filter((row) => (INDIVIDUAL_ID_TYPES as readonly string[]).includes(row.code))
      .map(({ id, name }) => ({ id, name })),
  );

  /** Read on each check; the select's change event refreshes this view. */
  protected idHint(): string {
    const id = this.group().get('identificationTypeId')?.value as number | null | undefined;
    const code = this.idTypeRows().find((row) => row.id === id)?.code;
    return code ? (ID_HINTS[code] ?? '') : 'Choose the ID type first';
  }

  constructor() {
    this.lookups.list('genders').then(
      (rows) => this.genderRows.set(rows),
      () => undefined,
    );
    this.lookups.list('identification-document-types').then(
      (rows) => this.idTypeRows.set(rows),
      () => undefined,
    );
  }

  protected error(name: string): string | null {
    const control = this.group().get(name);
    if (!control || control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    return errorMessage(control, FIELD_MESSAGES[name]);
  }

  protected tidyId(): void {
    const control = this.group().get('identificationNumber');
    const value = (control?.value as string | null) ?? '';
    const tidy = value.trim().replace(/\s+/g, '').toUpperCase();
    if (control && tidy !== value) {
      control.setValue(tidy);
    }
  }
}
