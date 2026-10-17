import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type {
  DocumentDetail,
  DocumentSummary,
  LookupRow,
  PhotoView,
  SignatureView,
} from '../../core/api/api-types';
import { AuthService } from '../../core/auth/auth.service';
import { toApiProblem } from '../../core/errors/api-problem';
import { messageFor } from '../../core/errors/error-catalog';
import { formatDate, formatTimestamp } from '../../core/formats/dates';
import { LookupsService } from '../../core/lookups/lookups.service';
import { CanDirective } from '../../core/permissions/can.directive';
import { PermissionService } from '../../core/permissions/permission.service';
import {
  CapturedFile,
  CapturedSignature,
  ImageCaptureComponent,
  SignaturePadComponent,
  UploadService,
  UploadStatusComponent,
  UploadTask,
} from '../../shared/capture';
import { SubmitGuard } from '../../shared/forms/submit-guard';
import { HasUnsavedChanges } from '../../shared/forms/unsaved-changes.guard';
import {
  BannerComponent,
  ButtonComponent,
  DialogService,
  MenuButtonComponent,
  MenuItem,
  StatusChipComponent,
  ToastService,
} from '../../shared/ui';
import { CustomerRecordStore } from './customer-record.store';
import { CustomersClient } from './customers.client';
import { DocumentFormComponent, DocumentSubmit } from './document-form.component';
import { FOUR_EYES_MESSAGE, isOwnWork } from './four-eyes';
import { documentLabel } from './kyc.tab';

type Editing =
  { kind: 'add' } | { kind: 'edit'; document: DocumentDetail } | { kind: 'image'; documentId: number };

/**
 * Documents, photo and signature (UX 6.2 step 3, 7.3; F7). Images are captured and compressed on the device, held in
 * memory and uploaded with progress and same-key retry. Viewing opens the overlay viewer; nothing is a direct link.
 */
@Component({
  selector: 'ib-customer-documents-tab',
  imports: [
    CanDirective,
    BannerComponent,
    ButtonComponent,
    DocumentFormComponent,
    ImageCaptureComponent,
    MenuButtonComponent,
    SignaturePadComponent,
    StatusChipComponent,
    UploadStatusComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    section {
      background: var(--ib-surface);
      border: 1px solid var(--ib-line);
      border-radius: var(--ib-radius-md);
      padding: var(--ib-space-4);
      margin-bottom: var(--ib-space-4);
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ib-space-2);
      margin-bottom: var(--ib-space-3);
    }
    .state {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ib-space-2);
      margin: 0 0 var(--ib-space-3);
      color: var(--ib-ink-muted);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ib-space-2);
      margin-top: var(--ib-space-3);
    }
    .four-eyes {
      margin: var(--ib-space-2) 0 0;
      color: var(--ib-ink-muted);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ib-space-2);
      padding: var(--ib-space-3) 0;
      border-top: 1px solid var(--ib-line);
    }
    li:first-child {
      border-top: 0;
    }
    .doc-name {
      font-weight: 600;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ib-space-1) var(--ib-space-3);
      color: var(--ib-ink-muted);
      font-size: 13px;
    }
    .flag {
      font-weight: 650;
    }
    .expired {
      color: var(--ib-danger-text);
    }
    .panel {
      border-top: 1px solid var(--ib-line);
      margin-top: var(--ib-space-3);
      padding-top: var(--ib-space-3);
    }
  `,
  template: `
    @if (message(); as text) {
      <ib-banner tone="danger" [message]="text" />
    }

    @if (isIndividual()) {
      <section aria-labelledby="photo-title">
        <div class="head">
          <h2 id="photo-title">Photo</h2>
        </div>
        @if (photo(); as current) {
          <p class="state">
            @if (current.hasPhoto) {
              <ib-status-chip
                domain="approval"
                [code]="current.supervisionState === 'APPROVED' ? 'APPROVED' : 'PENDING'"
              />
              <span>Taken {{ timestamp(current.capturedOn) }}</span>
            } @else {
              <span>No photo yet.</span>
            }
          </p>
          <div class="actions">
            @if (current.hasPhoto) {
              <ib-button icon="eye" (click)="viewPhoto()">View photo</ib-button>
            }
            @if (current.hasPhoto && current.supervisionState !== 'APPROVED' && canSupervise()) {
              <ib-button
                variant="primary"
                [disabled]="ownPhoto()"
                [loading]="deciding.busy()"
                (click)="approvePhoto()"
                >Approve photo</ib-button
              >
              <ib-button variant="danger" [loading]="deciding.busy()" (click)="rejectPhoto()"
                >Reject photo</ib-button
              >
            }
          </div>
          @if (current.hasPhoto && current.supervisionState !== 'APPROVED' && canSupervise() && ownPhoto()) {
            <p class="four-eyes">{{ fourEyes }}</p>
          }
        }
        <div class="panel" *ibCan="{ module: 'PTY', subModule: 'DOCUMENTS', action: 'edit' }">
          <ib-image-capture #photoCapture label="Photo" (captured)="photoFile.set($event)" />
          @if (photoFile()) {
            <div class="actions">
              <ib-button
                variant="primary"
                [loading]="photoTask.state() === 'uploading'"
                (click)="uploadPhoto()"
                >Save photo</ib-button
              >
            </div>
            <ib-upload-status [task]="photoTask" label="photo" />
          }
        </div>
      </section>
    }

    <section aria-labelledby="documents-title">
      <div class="head">
        <h2 id="documents-title">Identification documents</h2>
        @if (editing()?.kind !== 'add') {
          <ib-button
            *ibCan="{ module: 'PTY', subModule: 'DOCUMENTS', action: 'add' }"
            icon="plus"
            (click)="startAdd()"
            >Add document</ib-button
          >
        }
      </div>
      @if (editing()?.kind === 'add') {
        <ib-document-form
          #documentForm
          title="Add a document"
          [partyType]="partyType()"
          [busy]="saving.busy()"
          (saved)="addDocument($event)"
          (cancelled)="editing.set(null)"
        />
        <ib-upload-status [task]="documentTask" label="document image" />
      }
      @if (documents().length === 0 && editing()?.kind !== 'add') {
        <p class="state">No documents yet.</p>
      }
      <ul aria-label="Documents">
        @for (document of documents(); track document.partyIdentificationDocumentId) {
          <li>
            <div>
              <span class="doc-name">{{ typeName(document.documentTypeCode) }}</span>
              <span class="ib-num"> {{ document.documentNumberMasked }}</span>
              <div class="meta">
                @if (document.isPrimary) {
                  <span class="flag">Main ID</span>
                }
                <span>Issued {{ date(document.issuedOn) || 'not given' }}</span>
                <span [class.expired]="document.isExpired">
                  {{ document.isExpired ? 'Expired' : 'Expires' }}
                  {{ date(document.expiresOn) || 'not given' }}
                </span>
                <span>{{ document.hasImage ? 'Image on file' : 'No image yet' }}</span>
              </div>
            </div>
            <ib-menu-button
              [label]="'Actions for ' + typeName(document.documentTypeCode)"
              [items]="documentActions(document)"
              (selected)="documentAction(document, $event)"
            />
            @if (editingDocument(document.partyIdentificationDocumentId); as edit) {
              <div class="panel" style="flex-basis: 100%">
                @if (edit.kind === 'edit') {
                  <ib-document-form
                    #documentForm
                    title="Edit the document"
                    [partyType]="partyType()"
                    [document]="edit.document"
                    [withImage]="false"
                    [busy]="saving.busy()"
                    saveLabel="Save changes"
                    (saved)="updateDocument(document.partyIdentificationDocumentId, $event)"
                    (cancelled)="editing.set(null)"
                  />
                } @else {
                  <ib-image-capture
                    label="Document"
                    [allowPdf]="true"
                    (captured)="documentFile.set($event)"
                  />
                  @if (documentFile()) {
                    <div class="actions">
                      <ib-button (click)="editing.set(null)">Cancel</ib-button>
                      <ib-button
                        variant="primary"
                        [loading]="documentTask.state() === 'uploading'"
                        (click)="uploadDocumentImage(document.partyIdentificationDocumentId)"
                        >Save image</ib-button
                      >
                    </div>
                  }
                  <ib-upload-status [task]="documentTask" label="document image" />
                }
              </div>
            }
          </li>
        }
      </ul>
    </section>

    @if (isIndividual()) {
      <section aria-labelledby="signature-title">
        <div class="head">
          <h2 id="signature-title">Specimen signature</h2>
        </div>
        @if (signature(); as current) {
          <p class="state">
            @if (current.hasEffective) {
              <ib-status-chip domain="approval" code="APPROVED" />
              <span>Approved signature on file.</span>
            } @else {
              <span>No approved signature yet. It is needed before any account can be opened.</span>
            }
            @if (current.pending) {
              <ib-status-chip domain="approval" code="PENDING" />
              <span>A new signature is waiting for approval.</span>
            }
          </p>
          <div class="actions">
            @if (current.hasEffective) {
              <ib-button icon="eye" (click)="viewSignature(false)">View signature</ib-button>
            }
            @if (current.pending) {
              <ib-button icon="eye" (click)="viewSignature(true)">View new signature</ib-button>
              @if (canSupervise()) {
                <ib-button
                  variant="primary"
                  [disabled]="ownSignature()"
                  [loading]="deciding.busy()"
                  (click)="approveSignature()"
                  >Approve signature</ib-button
                >
                <ib-button variant="danger" [loading]="deciding.busy()" (click)="rejectSignature()"
                  >Reject signature</ib-button
                >
              }
            }
          </div>
          @if (current.pending && canSupervise() && ownSignature()) {
            <p class="four-eyes">{{ fourEyes }}</p>
          }
        }
        <div class="panel" *ibCan="{ module: 'PTY', subModule: 'DOCUMENTS', action: 'edit' }">
          @if (capturingSignature()) {
            <ib-signature-pad (accepted)="signatureFile.set($event)" />
            <div class="actions">
              <ib-button (click)="capturingSignature.set(false); signatureFile.set(null)">Cancel</ib-button>
              @if (signatureFile()) {
                <ib-button
                  variant="primary"
                  [loading]="signatureTask.state() === 'uploading'"
                  (click)="uploadSignature()"
                  >Save signature</ib-button
                >
              }
            </div>
            <ib-upload-status [task]="signatureTask" label="signature" />
          } @else {
            <ib-button icon="edit" (click)="capturingSignature.set(true)">Capture signature</ib-button>
          }
        </div>
      </section>
    }
  `,
})
export class CustomerDocumentsTab implements HasUnsavedChanges {
  private readonly store = inject(CustomerRecordStore);
  private readonly client = inject(CustomersClient);
  private readonly dialogs = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly me = inject(AuthService).me;
  private readonly uploads = inject(UploadService);
  private readonly documentForm = viewChild(DocumentFormComponent);
  private readonly photoCapture = viewChild<ImageCaptureComponent>('photoCapture');

  protected readonly fourEyes = FOUR_EYES_MESSAGE;
  protected readonly message = signal<string | null>(null);
  protected readonly photo = signal<PhotoView | null>(null);
  protected readonly signature = signal<SignatureView | null>(null);
  protected readonly documents = signal<DocumentSummary[]>([]);
  protected readonly editing = signal<Editing | null>(null);
  protected readonly photoFile = signal<CapturedFile | null>(null);
  protected readonly documentFile = signal<CapturedFile | null>(null);
  protected readonly signatureFile = signal<CapturedSignature | null>(null);
  protected readonly capturingSignature = signal(false);
  protected readonly photoTask = new UploadTask(this.uploads);
  protected readonly documentTask = new UploadTask(this.uploads);
  protected readonly signatureTask = new UploadTask(this.uploads);
  protected readonly saving = new SubmitGuard();
  protected readonly deciding = new SubmitGuard();
  private readonly types = signal<LookupRow[]>([]);

  protected readonly partyType = computed(() => this.store.party()?.partyTypeCode ?? 'INDIVIDUAL');
  protected readonly isIndividual = computed(() => this.partyType() === 'INDIVIDUAL');
  protected readonly canSupervise = computed(() =>
    this.permissions.can({ module: 'PTY', subModule: 'PARTY', action: 'supervise' }),
  );
  protected readonly ownPhoto = computed(() =>
    isOwnWork(this.me()?.staffUserId, this.photo()?.capturedByUserId),
  );
  protected readonly ownSignature = computed(() =>
    isOwnWork(this.me()?.staffUserId, this.signature()?.pending?.capturedByUserId),
  );

  constructor() {
    effect(() => {
      const party = this.store.party();
      if (party) {
        untracked(() => void this.load(party.partyId));
      }
    });
    inject(LookupsService)
      .list('identification-document-types')
      .then(
        (rows) => this.types.set(rows),
        () => undefined,
      );
  }

  hasUnsavedChanges(): boolean {
    return (
      this.photoFile() !== null ||
      this.documentFile() !== null ||
      this.signatureFile() !== null ||
      (this.documentForm()?.isDirty() ?? false)
    );
  }

  protected typeName(code: string): string {
    return this.types().find((row) => row.code === code)?.name ?? documentLabel(code);
  }

  protected editingDocument(documentId: number): Editing | null {
    const editing = this.editing();
    if (editing?.kind === 'edit' && editing.document.partyIdentificationDocumentId === documentId) {
      return editing;
    }
    return editing?.kind === 'image' && editing.documentId === documentId ? editing : null;
  }

  protected documentActions(document: DocumentSummary): MenuItem[] {
    const items: MenuItem[] = [];
    if (document.hasImage) {
      items.push({ label: 'View image', value: 'view' });
    }
    if (this.permissions.can({ module: 'PTY', subModule: 'DOCUMENTS', action: 'edit' })) {
      items.push({ label: document.hasImage ? 'Replace image' : 'Add image', value: 'image' });
      items.push({ label: 'Edit details', value: 'edit' });
      if (!document.isPrimary) {
        items.push({ label: 'Delete', value: 'delete' });
      }
    }
    return items;
  }

  protected async documentAction(document: DocumentSummary, action: string): Promise<void> {
    const partyId = this.partyId();
    const id = document.partyIdentificationDocumentId;
    this.message.set(null);
    if (action === 'view') {
      await this.dialogs.view(this.typeName(document.documentTypeCode), [
        {
          label: this.typeName(document.documentTypeCode),
          load: () => this.client.documentImage(partyId, id),
        },
      ]);
    } else if (action === 'image') {
      this.documentFile.set(null);
      this.documentTask.cancel();
      this.documentTask.state.set('idle');
      this.editing.set({ kind: 'image', documentId: id });
    } else if (action === 'edit') {
      try {
        this.editing.set({ kind: 'edit', document: await this.client.document(partyId, id) });
      } catch (failure) {
        this.message.set(messageFor(toApiProblem(failure)));
      }
    } else if (action === 'delete') {
      const confirmed = await this.dialogs.confirm({
        title: 'Delete this document?',
        message: `The ${this.typeName(document.documentTypeCode)} ${document.documentNumberMasked} and its image will be removed. KYC goes back to pending.`,
        confirmLabel: 'Delete',
        tone: 'danger',
      });
      if (confirmed) {
        await this.act(() => this.client.deleteDocument(partyId, id), 'Document deleted.');
      }
    }
  }

  protected startAdd(): void {
    this.documentTask.state.set('idle');
    this.editing.set({ kind: 'add' });
  }

  protected async addDocument(submit: DocumentSubmit): Promise<void> {
    const partyId = this.partyId();
    await this.saving.run(async () => {
      this.message.set(null);
      try {
        const created = await this.client.addDocument(partyId, submit.request);
        if (submit.file) {
          const uploaded = await this.documentTask.start(
            this.imageRequest(partyId, created.id, submit.file),
            async () => {
              this.documentFile.set(null);
              this.editing.set(null);
              await this.refresh(partyId);
            },
          );
          if (!uploaded) {
            // The document exists; the image is retried from its row with the same file and key.
            this.editing.set({ kind: 'image', documentId: created.id });
            this.documentFile.set(submit.file);
            await this.refresh(partyId);
            return;
          }
        }
        this.editing.set(null);
        this.toast.success('Document saved.');
        await this.refresh(partyId);
      } catch (failure) {
        this.showFormError(failure);
      }
    });
  }

  protected async updateDocument(documentId: number, submit: DocumentSubmit): Promise<void> {
    const partyId = this.partyId();
    await this.saving.run(async () => {
      this.message.set(null);
      try {
        await this.client.updateDocument(partyId, documentId, submit.request);
        this.editing.set(null);
        this.toast.success('Document saved.');
        await this.refresh(partyId);
      } catch (failure) {
        this.showFormError(failure);
      }
    });
  }

  protected async uploadDocumentImage(documentId: number): Promise<void> {
    const file = this.documentFile();
    const partyId = this.partyId();
    if (file) {
      await this.documentTask.start(this.imageRequest(partyId, documentId, file), async () => {
        this.documentFile.set(null);
        this.editing.set(null);
        this.toast.success('Document image saved.');
        await this.refresh(partyId);
      });
    }
  }

  protected async uploadPhoto(): Promise<void> {
    const file = this.photoFile();
    const partyId = this.partyId();
    if (!file) {
      return;
    }
    await this.photoTask.start(
      {
        path: `parties/${partyId}/photo`,
        method: 'PUT',
        blob: file.blob,
        contentType: file.type,
        idempotencyKey: file.idempotencyKey,
      },
      async () => {
        this.photoFile.set(null);
        this.photoCapture()?.clear();
        this.toast.success('Photo saved. It needs a supervisor’s approval.');
        await this.refresh(partyId);
      },
    );
  }

  protected async uploadSignature(): Promise<void> {
    const file = this.signatureFile();
    const partyId = this.partyId();
    if (!file) {
      return;
    }
    await this.signatureTask.start(
      {
        path: `parties/${partyId}/signature`,
        method: 'PUT',
        blob: file.blob,
        contentType: 'image/png',
        idempotencyKey: file.idempotencyKey,
      },
      async () => {
        this.signatureFile.set(null);
        this.capturingSignature.set(false);
        this.toast.success('Signature saved. It needs a supervisor’s approval.');
        await this.refresh(partyId);
      },
    );
  }

  protected viewPhoto(): Promise<void> {
    const partyId = this.partyId();
    return this.dialogs.view('Photo', [{ label: 'Photo', load: () => this.client.photoImage(partyId) }]);
  }

  protected viewSignature(pending: boolean): Promise<void> {
    const partyId = this.partyId();
    const label = pending ? 'New signature' : 'Specimen signature';
    return this.dialogs.view(label, [{ label, load: () => this.client.signatureImage(partyId, pending) }]);
  }

  protected approvePhoto(): Promise<void> {
    return this.decide(() => this.client.approvePhoto(this.partyId()), 'Photo approved.');
  }

  protected async rejectPhoto(): Promise<void> {
    const reason = await this.dialogs.reason({
      title: 'Reject the photo?',
      message: 'The photo will be removed and a new one will be needed.',
      label: 'Reason',
      confirmLabel: 'Reject photo',
      required: false,
    });
    if (reason !== null) {
      await this.decide(() => this.client.rejectPhoto(this.partyId(), reason || null), 'Photo rejected.');
    }
  }

  protected approveSignature(): Promise<void> {
    return this.decide(() => this.client.approveSignature(this.partyId()), 'Signature approved.');
  }

  protected async rejectSignature(): Promise<void> {
    const reason = await this.dialogs.reason({
      title: 'Reject the new signature?',
      message: 'The new signature will not be used. The current approved signature, if any, stays in force.',
      label: 'Reason',
      confirmLabel: 'Reject signature',
      required: false,
    });
    if (reason !== null) {
      await this.decide(
        () => this.client.rejectSignature(this.partyId(), reason || null),
        'Signature rejected.',
      );
    }
  }

  protected readonly date = formatDate;
  protected readonly timestamp = formatTimestamp;

  private partyId(): number {
    return this.store.party()!.partyId;
  }

  private imageRequest(partyId: number, documentId: number, file: CapturedFile) {
    return {
      path: `parties/${partyId}/documents/${documentId}/image`,
      method: 'PUT' as const,
      blob: file.blob,
      contentType: file.type,
      idempotencyKey: file.idempotencyKey,
    };
  }

  private async decide(work: () => Promise<void>, done: string): Promise<void> {
    await this.deciding.run(() => this.act(work, done));
  }

  private async act(work: () => Promise<void>, done: string): Promise<void> {
    this.message.set(null);
    try {
      await work();
      this.toast.success(done);
      await this.refresh(this.partyId());
    } catch (failure) {
      this.message.set(messageFor(toApiProblem(failure)));
    }
  }

  private showFormError(failure: unknown): void {
    const problem = toApiProblem(failure);
    if (problem.status === 400 && problem.errors) {
      this.documentForm()?.showErrors(problem.errors);
    } else {
      this.message.set(messageFor(problem));
    }
  }

  private async refresh(partyId: number): Promise<void> {
    await Promise.all([this.load(partyId), this.store.reload()]);
  }

  private async load(partyId: number): Promise<void> {
    const individual = this.isIndividual();
    const [documents, photo, signature] = await Promise.allSettled([
      this.client.documents(partyId),
      individual ? this.client.photo(partyId) : Promise.resolve(null),
      individual ? this.client.signature(partyId) : Promise.resolve(null),
    ]);
    if (documents.status === 'fulfilled') {
      this.documents.set(documents.value);
    } else {
      this.message.set(messageFor(toApiProblem(documents.reason)));
    }
    this.photo.set(photo.status === 'fulfilled' ? photo.value : null);
    this.signature.set(signature.status === 'fulfilled' ? signature.value : null);
  }
}
