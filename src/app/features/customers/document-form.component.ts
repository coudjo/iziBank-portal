import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type { DocumentDetail, DocumentRequest, LookupRow } from '../../core/api/api-types';
import { normalizeIdNumber } from '../../core/formats/masking';
import { LookupsService } from '../../core/lookups/lookups.service';
import { CapturedFile, ImageCaptureComponent } from '../../shared/capture';
import { FormProblem, applyServerErrors, errorMessage, formProblems } from '../../shared/forms/form-errors';
import {
  ButtonComponent,
  DateInputComponent,
  ErrorSummaryComponent,
  FormControlDirective,
  FormFieldComponent,
  InputDirective,
  LookupSelectComponent,
} from '../../shared/ui';
import { notInFuture } from './business-form';
import { INDIVIDUAL_ID_TYPES } from './individual-form';

/** Business document types (API LookupCodes.IdentificationDocumentTypes.Business). */
export const BUSINESS_DOCUMENT_TYPES = [
  'CERTIFICATE_OF_INCORPORATION',
  'CERT_TO_COMMENCE_BUSINESS',
  'TIN_CERTIFICATE',
  'BUSINESS_OPERATING_PERMIT',
];

export interface DocumentSubmit {
  request: DocumentRequest;
  file: CapturedFile | null;
}

const FIELDS = ['documentTypeId', 'documentNumber', 'issuedOn', 'expiresOn'];
const MESSAGES = {
  documentTypeId: { required: 'Choose the document type.' },
  documentNumber: { required: 'Enter the document number.' },
  issuedOn: { future: 'The issue date cannot be in the future.' },
  expiresOn: { order: 'The expiry date must be after the issue date.' },
};

/** Add or edit an identification document, optionally with its image (F7). */
@Component({
  selector: 'ib-document-form',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    DateInputComponent,
    ErrorSummaryComponent,
    FormControlDirective,
    FormFieldComponent,
    ImageCaptureComponent,
    InputDirective,
    LookupSelectComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0 var(--ib-space-5);
    }
    @media (max-width: 767.98px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--ib-space-2);
      margin-top: var(--ib-space-4);
    }
    h3 {
      font-size: 15px;
      margin: var(--ib-space-2) 0 var(--ib-space-2);
    }
  `,
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate [attr.aria-label]="title()">
      <ib-error-summary [problems]="problems()" />
      <div class="grid">
        <ib-form-field label="Document type" [required]="true" [error]="error('documentTypeId')">
          <ib-lookup-select formControlName="documentTypeId" [options]="types()" />
        </ib-form-field>
        <ib-form-field label="Document number" [required]="true" [error]="error('documentNumber')">
          <input
            ibInput
            ibControl
            formControlName="documentNumber"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            maxlength="30"
          />
        </ib-form-field>
        <ib-form-field label="Issued on" hint="For example 01/02/2022" [error]="error('issuedOn')">
          <ib-date-input formControlName="issuedOn" />
        </ib-form-field>
        <ib-form-field label="Expires on" [error]="error('expiresOn')">
          <ib-date-input formControlName="expiresOn" />
        </ib-form-field>
      </div>
      @if (withImage()) {
        <h3>Image of the document</h3>
        <ib-image-capture label="Document" [allowPdf]="true" (captured)="file.set($event)" />
      }
      <div class="actions">
        <ib-button (click)="cancelled.emit()">Cancel</ib-button>
        <ib-button variant="primary" type="submit" [loading]="busy()">{{ saveLabel() }}</ib-button>
      </div>
    </form>
  `,
})
export class DocumentFormComponent implements OnInit {
  readonly partyType = input.required<string>();
  readonly document = input<DocumentDetail | null>(null);
  readonly withImage = input(true);
  readonly busy = input(false);
  readonly title = input('Document');
  readonly saveLabel = input('Save document');
  readonly saved = output<DocumentSubmit>();
  readonly cancelled = output<void>();

  protected readonly form = new FormGroup(
    {
      documentTypeId: new FormControl<number | null>(null, Validators.required),
      documentNumber: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(30)],
      }),
      issuedOn: new FormControl<string | null>(null, notInFuture()),
      expiresOn: new FormControl<string | null>(null),
    },
    {
      validators: (group) => {
        const issued = group.get('issuedOn')?.value as string | null;
        const expires = group.get('expiresOn');
        const wrong = !!issued && !!expires?.value && (expires.value as string) < issued;
        if (expires) {
          const others = { ...(expires.errors ?? {}) };
          delete others['order'];
          expires.setErrors(wrong ? { ...others, order: true } : Object.keys(others).length ? others : null, {
            emitEvent: false,
          });
        }
        return null;
      },
    },
  );
  protected readonly file = signal<CapturedFile | null>(null);
  protected readonly problems = signal<FormProblem[]>([]);
  private readonly submitted = signal(false);
  private readonly rows = signal<LookupRow[]>([]);
  protected readonly types = computed(() => {
    const allowed: readonly string[] =
      this.partyType() === 'BUSINESS' ? BUSINESS_DOCUMENT_TYPES : INDIVIDUAL_ID_TYPES;
    return this.rows()
      .filter((row) => allowed.includes(row.code))
      .map(({ id, name }) => ({ id, name }));
  });

  constructor() {
    inject(LookupsService)
      .list('identification-document-types')
      .then(
        (rows) => this.rows.set(rows),
        () => undefined,
      );
  }

  ngOnInit(): void {
    const document = this.document();
    if (document) {
      this.form.reset({
        documentTypeId: document.documentTypeId,
        documentNumber: document.documentNumber,
        issuedOn: document.issuedOn ?? null,
        expiresOn: document.expiresOn ?? null,
      });
    }
  }

  /** Puts the API's 400 errors on the fields. */
  showErrors(errors: Record<string, string[]>): void {
    const rest = applyServerErrors(this.form, errors);
    this.problems.set([...formProblems(this.form, FIELDS, MESSAGES), ...rest]);
  }

  isDirty(): boolean {
    return this.form.dirty || this.file() !== null;
  }

  protected error(name: string): string | null {
    const control = this.form.get(name);
    if (!control || control.valid || !(control.touched || this.submitted())) {
      return null;
    }
    return errorMessage(control, MESSAGES[name as keyof typeof MESSAGES]);
  }

  protected submit(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    const problems = formProblems(this.form, FIELDS, MESSAGES);
    this.problems.set(problems);
    if (problems.length > 0) {
      return;
    }
    const value = this.form.getRawValue();
    this.saved.emit({
      request: {
        documentTypeId: value.documentTypeId,
        documentNumber: normalizeIdNumber(value.documentNumber),
        issuedOn: value.issuedOn,
        expiresOn: value.expiresOn,
      },
      file: this.file(),
    });
  }
}
