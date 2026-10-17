import { http, HttpResponse } from 'msw';
import type {
  ActivityRow,
  DocumentRequest,
  DocumentSummary,
  NextOfKinRequest,
  NextOfKinView,
  PhotoView,
  RegulatoryAttributeView,
  SignatureView,
} from '../app/core/api/api-types';
import { ID_TYPES, MockParty, find, normalizeId, problem, save, validation } from './parties';

/**
 * Mock KYC, documents, photo, signature, next of kin, regulatory attributes and the activity log (F7), following
 * api/openapi.json. Detailed state is built from the seed flags the first time a customer is touched.
 */
interface MockDocument {
  id: number;
  typeId: number;
  number: string;
  issuedOn: string | null;
  expiresOn: string | null;
  isPrimary: boolean;
  image: StoredFile | null;
}

interface StoredFile {
  type: string;
  /** base64; seeded files use a generated placeholder. */
  data: string | null;
}

interface Version {
  id: number;
  capturedOn: string;
  capturedByUserId: number;
  supervisedByUserId: number | null;
  supervisedOn: string | null;
  file: StoredFile;
}

export interface Profile {
  documents: MockDocument[];
  photo: (Version & { state: 'PENDING' | 'APPROVED' }) | null;
  signatures: Version[];
  nextOfKin: NextOfKinView[];
  attributes: RegulatoryAttributeView[];
  activity: ActivityRow[];
}

let nextId = 1000;
let failNext = false;

/** Test hook: the next upload is lost on the way, like a dropped mobile connection. */
export function failNextUpload(): void {
  failNext = true;
}
const now = () => new Date().toISOString();
const SEEDED: StoredFile = { type: 'image/png', data: null };

/** A small grey PNG standing in for seeded images. */
const PLACEHOLDER_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAARElEQVR42u3PMQ0AAAgDsPlXxsODIizwkjSpgaZ6XouAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwNUCHhbVpZyiMz4AAAAASUVORK5CYII=';

export function profileOf(party: MockParty): Profile {
  if (!party.profile) {
    const person = party.detail.individual;
    party.profile = {
      documents:
        party.detail.partyTypeCode === 'INDIVIDUAL' && person?.identificationTypeId
          ? [
              {
                id: nextId++,
                typeId: person.identificationTypeId,
                number: person.identificationNumber ?? '',
                issuedOn: '2021-01-15',
                expiresOn: '2031-01-14',
                isPrimary: true,
                image: party.hasDocumentImage ? SEEDED : null,
              },
            ]
          : [],
      photo: party.hasPhoto
        ? {
            id: nextId++,
            capturedOn: party.detail.createdOn,
            capturedByUserId: party.detail.createdByUserId ?? 2,
            supervisedByUserId: 3,
            supervisedOn: party.detail.createdOn,
            file: SEEDED,
            state: 'APPROVED',
          }
        : null,
      signatures: party.hasSignature
        ? [
            {
              id: nextId++,
              capturedOn: party.detail.createdOn,
              capturedByUserId: 2,
              supervisedByUserId: 3,
              supervisedOn: party.detail.createdOn,
              file: SEEDED,
            },
          ]
        : [],
      nextOfKin: Array.from({ length: party.nextOfKin }, () => ({
        partyNextOfKinId: nextId++,
        fullName: 'Adjoa Mensima',
        relationship: 'Sibling',
        mobileNumber: '+233244999001',
      })),
      attributes: [],
      activity: [],
    };
  }
  return party.profile;
}

/** Keeps the seed flags (used by the checklist and search rows) in step with the detailed state. */
function sync(party: MockParty): void {
  const profile = profileOf(party);
  party.hasPhoto = profile.photo?.state === 'APPROVED';
  party.hasDocumentImage = profile.documents.some((document) => document.image !== null);
  party.nextOfKin = profile.nextOfKin.length;
  party.hasSignature = profile.signatures.some((version) => version.supervisedByUserId !== null);
}

/** KYC-relevant changes send the customer back to pending (API A4-04). */
function backToPending(party: MockParty): void {
  Object.assign(party.detail, { kycStatusCode: 'PENDING', effectiveKycStatusCode: 'PENDING' });
}

function record(
  party: MockParty,
  staffUserId: number | null,
  eventCode: string,
  details?: Record<string, unknown>,
) {
  profileOf(party).activity.unshift({
    eventId: nextId++,
    eventTimestamp: now(),
    eventCode,
    outcome: 'SUCCESS',
    sessionId: null,
    staffUserId,
    staffCode: STAFF[staffUserId ?? 0] ?? null,
    branchId: 1,
    entityType: 'Party',
    entityId: party.detail.partyNumber,
    requestDetailsJson: details ? JSON.stringify(details) : null,
  });
}

const STAFF: Record<number, string> = {
  1: 'ADMIN',
  2: 'TELLER1',
  3: 'KYC1',
  5: 'ROAMER',
  6: 'FIELD1',
  7: 'AUDIT1',
};

export function photoView(party: MockParty): PhotoView {
  const photo = profileOf(party).photo;
  return {
    hasPhoto: photo !== null,
    supervisionState: photo?.state ?? null,
    capturedOn: photo?.capturedOn ?? null,
    capturedByUserId: photo?.capturedByUserId ?? null,
    supervisedByUserId: photo?.supervisedByUserId ?? null,
  };
}

export function signatureView(party: MockParty): SignatureView {
  const versions = profileOf(party).signatures;
  const effective = [...versions].reverse().find((version) => version.supervisedByUserId !== null) ?? null;
  const pending = versions.find((version) => version.supervisedByUserId === null) ?? null;
  const shape = (version: Version | null) =>
    version
      ? {
          partySignatureId: version.id,
          capturedOn: version.capturedOn,
          capturedByUserId: version.capturedByUserId,
          supervisedByUserId: version.supervisedByUserId,
          supervisedOn: version.supervisedOn,
        }
      : null;
  return { hasEffective: effective !== null, effective: shape(effective), pending: shape(pending) };
}

function summary(document: MockDocument): DocumentSummary {
  const number = document.number;
  return {
    partyIdentificationDocumentId: document.id,
    documentTypeId: document.typeId,
    documentTypeCode: ID_TYPES.find((type) => type.id === document.typeId)?.code ?? '',
    documentNumberMasked: number.length <= 4 ? '*'.repeat(number.length) : `****${number.slice(-4)}`,
    issuedOn: document.issuedOn,
    expiresOn: document.expiresOn,
    isExpired: !!document.expiresOn && document.expiresOn < now().slice(0, 10),
    hasImage: document.image !== null,
    isPrimary: document.isPrimary,
  };
}

async function readFile(request: Request): Promise<StoredFile | Response> {
  if (failNext) {
    failNext = false;
    return HttpResponse.error();
  }
  const buffer = new Uint8Array(await request.arrayBuffer());
  if (buffer.length === 0) {
    return problem(400, 'upload.empty');
  }
  const type = request.headers.get('Content-Type') ?? 'application/octet-stream';
  let binary = '';
  for (const byte of buffer) {
    binary += String.fromCharCode(byte);
  }
  return { type, data: btoa(binary) };
}

function fileResponse(file: StoredFile | null): Response {
  if (!file) {
    return problem(404, 'not-found');
  }
  const base64 = file.data ?? PLACEHOLDER_PNG;
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return new HttpResponse(bytes, { headers: { 'Content-Type': file.data ? file.type : 'image/png' } });
}

function documentErrors(body: DocumentRequest): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  if (!ID_TYPES.some((type) => type.id === body.documentTypeId)) {
    errors['documentTypeId'] = ['Choose a document type that applies to this customer.'];
  }
  if (!body.documentNumber?.trim()) {
    errors['documentNumber'] = ['Enter the document number (up to 30 characters).'];
  }
  if (body.issuedOn && body.expiresOn && body.expiresOn < body.issuedOn) {
    errors['expiresOn'] = ['The expiry date must be after the issue date.'];
  }
  return errors;
}

export function kycHandlers(
  base: string,
  signedIn: (request: Request) => Response | null,
  who: (request: Request) => number | null,
) {
  /** Runs `work` for a known customer after the session check. */
  const withParty =
    (
      work: (
        party: MockParty,
        request: Request,
        params: Record<string, string>,
      ) => Response | Promise<Response>,
    ) =>
    ({
      request,
      params,
    }: {
      request: Request;
      params: Record<string, string | readonly string[] | undefined>;
    }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const party = find(params['id'] as string);
      return party ? work(party, request, params as Record<string, string>) : problem(404, 'not-found');
    };
  const done = (party: MockParty) => {
    sync(party);
    save();
    return new HttpResponse(null, { status: 204 });
  };

  return [
    http.post(
      `${base}/parties/:id/kyc/verify`,
      withParty((party, request) => {
        const me = who(request);
        if (me === party.detail.createdByUserId || me === party.detail.modifiedByUserId) {
          return problem(409, 'supervision.self-approval');
        }
        sync(party);
        const missing: string[] = [];
        if (party.detail.partyTypeCode === 'INDIVIDUAL') {
          if (!party.hasPhoto) missing.push('PHOTO');
          if (!party.hasDocumentImage) missing.push('ID_DOCUMENT_IMAGE');
          if (party.nextOfKin === 0) missing.push('NEXT_OF_KIN');
        }
        if (missing.length > 0) {
          return problem(409, 'kyc.checklist-incomplete', { missing });
        }
        if (
          party.detail.effectiveKycStatusCode === 'VERIFIED' &&
          party.detail.supervisionState !== 'PENDING'
        ) {
          return problem(409, 'kyc.not-pending');
        }
        Object.assign(party.detail, {
          kycStatusCode: 'VERIFIED',
          effectiveKycStatusCode: 'VERIFIED',
          supervisionState: 'APPROVED',
          supervisedByUserId: me,
        });
        record(party, me, 'KYC_VERIFY');
        return done(party);
      }),
    ),

    http.post(
      `${base}/parties/:id/kyc/reject`,
      withParty(async (party, request) => {
        const body = (await request.json()) as { reason?: string | null };
        if (!body.reason?.trim()) {
          return validation({ reason: ['Give the reason for rejecting (up to 300 characters).'] });
        }
        if (party.detail.effectiveKycStatusCode === 'REJECTED') {
          return problem(409, 'kyc.not-pending');
        }
        Object.assign(party.detail, { kycStatusCode: 'REJECTED', effectiveKycStatusCode: 'REJECTED' });
        record(party, who(request), 'KYC_REJECT', { reason: body.reason.trim() });
        return done(party);
      }),
    ),

    http.get(
      `${base}/parties/:id/documents`,
      withParty((party) => HttpResponse.json(profileOf(party).documents.map(summary))),
    ),

    http.get(
      `${base}/parties/:id/documents/:documentId`,
      withParty((party, _request, params) => {
        const document = profileOf(party).documents.find((row) => row.id === Number(params['documentId']));
        return document
          ? HttpResponse.json({ ...summary(document), documentNumber: document.number })
          : problem(404, 'not-found');
      }),
    ),

    http.post(
      `${base}/parties/:id/documents`,
      withParty(async (party, request) => {
        if (party.detail.partyTypeCode === 'GROUP') {
          return validation({
            documentTypeId: ['Groups do not hold identification documents; add them to the members.'],
          });
        }
        const body = (await request.json()) as DocumentRequest;
        const errors = documentErrors(body);
        if (Object.keys(errors).length > 0) {
          return validation(errors);
        }
        const document: MockDocument = {
          id: nextId++,
          typeId: body.documentTypeId!,
          number: normalizeId(body.documentNumber ?? ''),
          issuedOn: body.issuedOn,
          expiresOn: body.expiresOn,
          isPrimary: false,
          image: null,
        };
        profileOf(party).documents.push(document);
        backToPending(party);
        record(party, who(request), 'CREATE_RECORD', { document: summary(document).documentTypeCode });
        sync(party);
        save();
        return HttpResponse.json({ id: document.id }, { status: 201 });
      }),
    ),

    http.put(
      `${base}/parties/:id/documents/:documentId`,
      withParty(async (party, request, params) => {
        const document = profileOf(party).documents.find((row) => row.id === Number(params['documentId']));
        if (!document) {
          return problem(404, 'not-found');
        }
        const body = (await request.json()) as DocumentRequest;
        const errors = documentErrors(body);
        if (Object.keys(errors).length > 0) {
          return validation(errors);
        }
        Object.assign(document, {
          typeId: body.documentTypeId,
          number: normalizeId(body.documentNumber ?? ''),
          issuedOn: body.issuedOn,
          expiresOn: body.expiresOn,
        });
        backToPending(party);
        return done(party);
      }),
    ),

    http.delete(
      `${base}/parties/:id/documents/:documentId`,
      withParty((party, _request, params) => {
        const profile = profileOf(party);
        const document = profile.documents.find((row) => row.id === Number(params['documentId']));
        if (!document) {
          return problem(404, 'not-found');
        }
        if (document.isPrimary) {
          return problem(409, 'party.primary-document');
        }
        profile.documents = profile.documents.filter((row) => row !== document);
        backToPending(party);
        return done(party);
      }),
    ),

    http.put(
      `${base}/parties/:id/documents/:documentId/image`,
      withParty(async (party, request, params) => {
        const document = profileOf(party).documents.find((row) => row.id === Number(params['documentId']));
        if (!document) {
          return problem(404, 'not-found');
        }
        const file = await readFile(request);
        if (file instanceof Response) {
          return file;
        }
        document.image = file;
        backToPending(party);
        record(party, who(request), 'UPDATE_RECORD', { documentImage: document.id });
        return done(party);
      }),
    ),

    http.get(
      `${base}/parties/:id/documents/:documentId/image`,
      withParty((party, _request, params) =>
        fileResponse(
          profileOf(party).documents.find((row) => row.id === Number(params['documentId']))?.image ?? null,
        ),
      ),
    ),

    http.get(
      `${base}/parties/:id/photo`,
      withParty((party) => HttpResponse.json(photoView(party))),
    ),

    http.put(
      `${base}/parties/:id/photo`,
      withParty(async (party, request) => {
        const file = await readFile(request);
        if (file instanceof Response) {
          return file;
        }
        profileOf(party).photo = {
          id: nextId++,
          capturedOn: now(),
          capturedByUserId: who(request) ?? 0,
          supervisedByUserId: null,
          supervisedOn: null,
          file,
          state: 'PENDING',
        };
        backToPending(party);
        record(party, who(request), 'UPDATE_RECORD', { photo: 'captured' });
        return done(party);
      }),
    ),

    http.get(
      `${base}/parties/:id/photo/image`,
      withParty((party) => fileResponse(profileOf(party).photo?.file ?? null)),
    ),

    http.post(
      `${base}/parties/:id/photo/supervise`,
      withParty((party, request) => {
        const photo = profileOf(party).photo;
        if (!photo || photo.state !== 'PENDING') {
          return problem(409, 'supervision.not-pending');
        }
        if (photo.capturedByUserId === who(request)) {
          return problem(409, 'supervision.self-approval');
        }
        Object.assign(photo, { state: 'APPROVED', supervisedByUserId: who(request), supervisedOn: now() });
        record(party, who(request), 'SUPERVISE_APPROVE', { photo: true });
        return done(party);
      }),
    ),

    http.post(
      `${base}/parties/:id/photo/reject`,
      withParty((party, request) => {
        const profile = profileOf(party);
        if (!profile.photo || profile.photo.state !== 'PENDING') {
          return problem(409, 'supervision.not-pending');
        }
        profile.photo = null;
        record(party, who(request), 'SUPERVISE_REJECT', { photo: true });
        return done(party);
      }),
    ),

    http.get(
      `${base}/parties/:id/signature`,
      withParty((party) => HttpResponse.json(signatureView(party))),
    ),

    http.put(
      `${base}/parties/:id/signature`,
      withParty(async (party, request) => {
        const file = await readFile(request);
        if (file instanceof Response) {
          return file;
        }
        const profile = profileOf(party);
        profile.signatures = profile.signatures.filter((version) => version.supervisedByUserId !== null);
        const version: Version = {
          id: nextId++,
          capturedOn: now(),
          capturedByUserId: who(request) ?? 0,
          supervisedByUserId: null,
          supervisedOn: null,
          file,
        };
        profile.signatures.push(version);
        sync(party);
        save();
        return HttpResponse.json({ id: version.id });
      }),
    ),

    http.get(
      `${base}/parties/:id/signature/image`,
      withParty((party, request) => {
        const pending = new URL(request.url).searchParams.get('pending') === 'true';
        const versions = profileOf(party).signatures;
        const version = pending
          ? versions.find((row) => row.supervisedByUserId === null)
          : [...versions].reverse().find((row) => row.supervisedByUserId !== null);
        return fileResponse(version?.file ?? null);
      }),
    ),

    http.post(
      `${base}/parties/:id/signature/supervise`,
      withParty((party, request) => {
        const pending = profileOf(party).signatures.find((row) => row.supervisedByUserId === null);
        if (!pending) {
          return problem(409, 'supervision.not-pending');
        }
        if (pending.capturedByUserId === who(request)) {
          return problem(409, 'supervision.self-approval');
        }
        Object.assign(pending, { supervisedByUserId: who(request), supervisedOn: now() });
        record(party, who(request), 'SUPERVISE_APPROVE', { signature: true });
        return done(party);
      }),
    ),

    http.post(
      `${base}/parties/:id/signature/reject`,
      withParty((party, request) => {
        const profile = profileOf(party);
        if (!profile.signatures.some((row) => row.supervisedByUserId === null)) {
          return problem(409, 'supervision.not-pending');
        }
        profile.signatures = profile.signatures.filter((row) => row.supervisedByUserId !== null);
        record(party, who(request), 'SUPERVISE_REJECT', { signature: true });
        return done(party);
      }),
    ),

    http.get(
      `${base}/parties/:id/next-of-kin`,
      withParty((party) => HttpResponse.json(profileOf(party).nextOfKin)),
    ),

    http.post(
      `${base}/parties/:id/next-of-kin`,
      withParty(async (party, request) => {
        const body = (await request.json()) as NextOfKinRequest;
        if (!body.fullName?.trim()) {
          return validation({ fullName: ['Enter the full name (up to 100 characters).'] });
        }
        const row: NextOfKinView = {
          partyNextOfKinId: nextId++,
          fullName: body.fullName.trim(),
          relationship: body.relationship ?? null,
          mobileNumber: body.mobileNumber ?? null,
        };
        profileOf(party).nextOfKin.push(row);
        sync(party);
        save();
        return HttpResponse.json({ id: row.partyNextOfKinId }, { status: 201 });
      }),
    ),

    http.put(
      `${base}/parties/:id/next-of-kin/:kinId`,
      withParty(async (party, request, params) => {
        const row = profileOf(party).nextOfKin.find(
          (item) => item.partyNextOfKinId === Number(params['kinId']),
        );
        if (!row) {
          return problem(404, 'not-found');
        }
        const body = (await request.json()) as NextOfKinRequest;
        if (!body.fullName?.trim()) {
          return validation({ fullName: ['Enter the full name (up to 100 characters).'] });
        }
        Object.assign(row, {
          fullName: body.fullName.trim(),
          relationship: body.relationship ?? null,
          mobileNumber: body.mobileNumber ?? null,
        });
        return done(party);
      }),
    ),

    http.delete(
      `${base}/parties/:id/next-of-kin/:kinId`,
      withParty((party, _request, params) => {
        const profile = profileOf(party);
        profile.nextOfKin = profile.nextOfKin.filter(
          (item) => item.partyNextOfKinId !== Number(params['kinId']),
        );
        return done(party);
      }),
    ),

    http.get(
      `${base}/parties/:id/regulatory-attributes`,
      withParty((party) => {
        const latest = new Map<string, RegulatoryAttributeView>();
        for (const row of profileOf(party).attributes) {
          latest.set(row.attributeCode, row);
        }
        return HttpResponse.json([...latest.values()]);
      }),
    ),

    http.get(
      `${base}/parties/:id/regulatory-attributes/:code/history`,
      withParty((party, _request, params) =>
        HttpResponse.json(
          profileOf(party)
            .attributes.filter((row) => row.attributeCode === params['code'])
            .reverse(),
        ),
      ),
    ),

    http.put(
      `${base}/parties/:id/regulatory-attributes/:code`,
      withParty(async (party, request, params) => {
        const code = params['code'];
        if (!/^[A-Z][A-Z0-9_]{0,49}$/.test(code)) {
          return validation({
            attributeCode: [
              'Use upper case letters, digits and underscores, starting with a letter (up to 50).',
            ],
          });
        }
        const body = (await request.json()) as { attributeValue: string | null };
        profileOf(party).attributes.push({
          attributeCode: code,
          attributeValue: body.attributeValue,
          recordedOn: now(),
          recordedByUserId: who(request),
        });
        save();
        return new HttpResponse(null, { status: 204 });
      }),
    ),

    http.get(`${base}/audit/activity`, ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const url = new URL(request.url);
      const number = url.searchParams.get('entityId');
      const page = Number(url.searchParams.get('page') ?? 1);
      const pageSize = Number(url.searchParams.get('pageSize') ?? 25);
      const party = (number ? find(Number(number)) : undefined) ?? undefined;
      const rows = party ? profileOf(party).activity : [];
      return HttpResponse.json({
        items: rows.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        totalCount: rows.length,
      });
    }),
  ];
}
