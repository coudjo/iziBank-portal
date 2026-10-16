import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzInputModule } from 'ng-zorro-antd/input';
import { ImageCaptureComponent, SignaturePadComponent } from '../shared/capture';
import { FormProblem, errorMessage, formProblems } from '../shared/forms/form-errors';
import {
  BannerComponent,
  ButtonComponent,
  ComboboxComponent,
  DateInputComponent,
  EmptyStateComponent,
  ErrorSummaryComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  LookupSelectComponent,
  PageHeaderComponent,
  PhoneInputComponent,
  StatusChipComponent,
} from '../shared/ui';
import { STATUS_MAP, StatusDomain } from '../shared/ui/status-map';

/** Every ib- component in every state (frontend plan 4.2). Development builds only. */
@Component({
  selector: 'ib-component-gallery-page',
  imports: [
    NzInputModule,
    ReactiveFormsModule,
    ImageCaptureComponent,
    SignaturePadComponent,
    BannerComponent,
    ButtonComponent,
    ComboboxComponent,
    DateInputComponent,
    EmptyStateComponent,
    ErrorSummaryComponent,
    FormControlDirective,
    FormFieldComponent,
    InputDirective,
    LookupSelectComponent,
    PageHeaderComponent,
    PhoneInputComponent,
    StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    section {
      margin-bottom: var(--ib-space-6);
    }
    h2 {
      margin-bottom: var(--ib-space-3);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ib-space-3);
      align-items: center;
      margin-bottom: var(--ib-space-3);
    }
    .form {
      max-width: 420px;
    }
  `,
  template: `
    <ib-page-header title="Component gallery" subtitle="Development only" />

    <section aria-labelledby="g-buttons">
      <h2 id="g-buttons">Buttons</h2>
      <div class="row">
        <ib-button variant="primary">Primary</ib-button>
        <ib-button>Secondary</ib-button>
        <ib-button variant="quiet">Quiet</ib-button>
        <ib-button variant="danger">Danger</ib-button>
        <ib-button variant="primary" [loading]="true">Saving</ib-button>
        <ib-button [disabled]="true">Disabled</ib-button>
      </div>
    </section>

    <section aria-labelledby="g-chips">
      <h2 id="g-chips">Status chips</h2>
      @for (domain of domains; track domain) {
        <div class="row">
          @for (code of codes(domain); track code) {
            <ib-status-chip [domain]="domain" [code]="code" [explain]="true" />
          }
        </div>
      }
    </section>

    <section aria-labelledby="g-banners">
      <h2 id="g-banners">Banners</h2>
      <ib-banner tone="info" message="Viewing this record is logged." />
      <ib-banner tone="success" message="Saved. This customer is awaiting approval by a supervisor." />
      <ib-banner tone="warning" message="Changing this will send the customer back for approval." />
      <ib-banner
        tone="danger"
        message="We could not reach the server."
        description="Check the connection and try again."
      />
    </section>

    <section aria-labelledby="g-fields" class="form">
      <h2 id="g-fields">Form fields</h2>
      <ib-form-field label="First name" [required]="true" hint="As it appears on the ID document">
        <input nz-input ibControl />
      </ib-form-field>
      <ib-form-field label="ID number" [required]="true" error="Enter the ID number.">
        <input nz-input ibControl />
      </ib-form-field>
    </section>

    <section aria-labelledby="g-controls" class="form">
      <h2 id="g-controls">Form controls</h2>
      <form [formGroup]="form" (ngSubmit)="check()" novalidate>
        <ib-error-summary [problems]="problems()" />
        <ib-form-field
          label="Mobile"
          [required]="true"
          hint="For example 024 123 4567"
          [error]="shown('mobile')"
        >
          <ib-phone-input formControlName="mobile" />
        </ib-form-field>
        <ib-form-field label="Date of birth" [required]="true" [error]="shown('dateOfBirth')">
          <ib-date-input formControlName="dateOfBirth" />
        </ib-form-field>
        <ib-form-field label="Gender" [required]="true" [error]="shown('genderId')">
          <ib-lookup-select formControlName="genderId" [options]="genders" />
        </ib-form-field>
        <ib-form-field label="Nationality" [required]="true" [error]="shown('nationality')">
          <ib-combobox formControlName="nationality" [options]="nationalities" [strict]="true" />
        </ib-form-field>
        <ib-form-field label="Email">
          <input ibInput ibControl type="email" formControlName="email" />
        </ib-form-field>
        <ib-button variant="primary" type="submit">Check</ib-button>
      </form>
    </section>

    <section aria-labelledby="g-capture" class="form">
      <h2 id="g-capture">Capture</h2>
      <ib-image-capture label="ID document" [allowPdf]="true" />
      <h3>Specimen signature</h3>
      <ib-signature-pad />
    </section>

    <section aria-labelledby="g-empty">
      <h2 id="g-empty">Empty state</h2>
      <ib-empty-state title="No customers match" message="Clear the filters or add a customer." />
    </section>
  `,
})
export class ComponentGalleryPage {
  protected readonly domains = Object.keys(STATUS_MAP) as StatusDomain[];
  protected readonly genders = [
    { id: 1, name: 'Male' },
    { id: 2, name: 'Female' },
  ];
  protected readonly nationalities = ['Ghanaian', 'Nigerian', 'Togolese'];
  protected readonly form = new FormGroup({
    mobile: new FormControl<string | null>(null, Validators.required),
    dateOfBirth: new FormControl<string | null>(null, Validators.required),
    genderId: new FormControl<number | null>(null, Validators.required),
    nationality: new FormControl<string | null>(null, Validators.required),
    email: new FormControl<string | null>(null, Validators.email),
  });
  protected readonly problems = signal<FormProblem[]>([]);
  private readonly submitted = signal(false);

  protected shown(name: keyof typeof this.form.controls): string | null {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted()) ? errorMessage(control) : null;
  }

  protected check(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    this.problems.set(formProblems(this.form, Object.keys(this.form.controls)));
  }

  protected codes(domain: StatusDomain): string[] {
    return Object.keys(STATUS_MAP[domain]);
  }
}
