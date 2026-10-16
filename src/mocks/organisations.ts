import { http, HttpResponse } from 'msw';
import type { CreateBusinessRequest, CreateGroupRequest } from '../app/core/api/api-types';
import {
  MEMBER_ROLES,
  addMember,
  applyBusiness,
  blankParty,
  businessErrors,
  find,
  memberIds,
  normalizeId,
  ownerViews,
  problem,
  save,
  store,
  validation,
} from './parties';

/** Mock businesses, groups, beneficial owners and members (F6), following api/openapi.json. */
export function organisationHandlers(base: string, signedIn: (request: Request) => Response | null) {
  const created = (partyId: number, partyNumber: string) =>
    store.takeDrop() ? HttpResponse.error() : HttpResponse.json({ partyId, partyNumber }, { status: 201 });
  const backForApproval = (id: number) =>
    Object.assign(find(id)!.detail, {
      kycStatusCode: 'PENDING',
      effectiveKycStatusCode: 'PENDING',
      supervisionState: 'PENDING',
      supervisedByUserId: null,
    });

  return [
    http.post(`${base}/parties/businesses`, async ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const body = (await request.json()) as CreateBusinessRequest;
      const errors = businessErrors(body);
      if (Object.keys(errors).length > 0) {
        return validation(errors);
      }
      const registration = normalizeId(body.registrationNumber ?? '');
      const existing = store
        .parties()
        .find((party) => party.detail.business?.registrationNumber === registration);
      if (existing) {
        return problem(409, 'party.duplicate-registration', {
          existingPartyNumber: existing.detail.partyNumber,
        });
      }
      const party = blankParty(store.nextId(), 'BUSINESS', body.businessName ?? '');
      applyBusiness(party, body);
      store.parties().push(party);
      const response = created(party.detail.partyId, party.detail.partyNumber);
      save();
      return response;
    }),

    http.put(`${base}/parties/:id/business`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const party = find(params['id'] as string);
      if (!party?.detail.business) {
        return problem(404, 'not-found');
      }
      const body = (await request.json()) as CreateBusinessRequest;
      const errors = businessErrors(body);
      if (Object.keys(errors).length > 0) {
        return validation(errors);
      }
      const before = { ...party.detail.business };
      applyBusiness(party, body);
      const after = party.detail.business!;
      if (
        before.businessName !== after.businessName ||
        before.registrationNumber !== after.registrationNumber ||
        (before.taxIdentificationNumber ?? '') !== (after.taxIdentificationNumber ?? '')
      ) {
        backForApproval(party.detail.partyId);
      }
      save();
      return new HttpResponse(null, { status: 204 });
    }),

    http.get(`${base}/parties/:id/beneficial-owners`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const party = find(params['id'] as string);
      return party ? HttpResponse.json(ownerViews(party)) : problem(404, 'not-found');
    }),

    http.put(`${base}/parties/:id/beneficial-owners`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const party = find(params['id'] as string);
      if (!party) {
        return problem(404, 'not-found');
      }
      const body = (await request.json()) as {
        beneficialOwners: { ownerPartyId: number; ownershipPercentage: number }[] | null;
      };
      const owners = body.beneficialOwners ?? [];
      const problems: string[] = [];
      for (const owner of owners) {
        const person = find(owner.ownerPartyId);
        if (!person || person.detail.partyTypeCode !== 'INDIVIDUAL') {
          problems.push(`Owner ${person?.detail.partyNumber ?? owner.ownerPartyId} is not an individual.`);
        }
      }
      if (owners.reduce((sum, owner) => sum + owner.ownershipPercentage, 0) > 100) {
        problems.push('Ownership adds up to more than 100 percent.');
      }
      if (problems.length > 0) {
        return validation({ beneficialOwners: problems });
      }
      party.owners = owners.map(({ ownerPartyId, ownershipPercentage }) => ({
        ownerPartyId,
        ownershipPercentage,
      }));
      save();
      return new HttpResponse(null, { status: 204 });
    }),

    http.post(`${base}/parties/groups`, async ({ request }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const body = (await request.json()) as CreateGroupRequest;
      const name = body.groupName?.trim();
      if (!name) {
        return validation({ groupName: ['Enter the group name (up to 100 characters).'] });
      }
      const party = blankParty(0, 'GROUP', name);
      Object.assign(party.detail, {
        mobile: body.mobile,
        address1: body.address1,
        group: {
          groupName: name,
          formationDate: body.formationDate,
          meetingFrequency: body.meetingFrequency,
          chairpersonPartyId: null,
          chairpersonPartyNumber: null,
          chairpersonName: null,
          activeMemberCount: 0,
        },
      });
      party.members = [];
      for (const member of body.members ?? []) {
        const failed = addMember(
          party,
          member.memberPartyId,
          member.groupMemberRoleId ?? null,
          member.joinedOn ?? null,
        );
        if (failed) {
          return failed;
        }
      }
      const partyId = store.nextId();
      party.detail.partyId = partyId;
      party.detail.partyNumber = String(partyId).padStart(10, '0');
      store.parties().push(party);
      const response = created(partyId, party.detail.partyNumber);
      save();
      return response;
    }),

    http.put(`${base}/parties/:id/group`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const party = find(params['id'] as string);
      if (!party?.detail.group) {
        return problem(404, 'not-found');
      }
      const body = (await request.json()) as CreateGroupRequest;
      const name = body.groupName?.trim();
      if (!name) {
        return validation({ groupName: ['Enter the group name (up to 100 characters).'] });
      }
      const renamed = party.detail.group.groupName !== name;
      Object.assign(party.detail, { displayName: name, mobile: body.mobile, address1: body.address1 });
      Object.assign(party.detail.group, {
        groupName: name,
        formationDate: body.formationDate,
        meetingFrequency: body.meetingFrequency,
      });
      if (renamed) {
        backForApproval(party.detail.partyId);
      }
      save();
      return new HttpResponse(null, { status: 204 });
    }),

    http.get(`${base}/parties/:id/members`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const party = find(params['id'] as string);
      return party ? HttpResponse.json(party.members ?? []) : problem(404, 'not-found');
    }),

    http.post(`${base}/parties/:id/members`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const party = find(params['id'] as string);
      if (!party?.detail.group) {
        return problem(404, 'not-found');
      }
      const body = (await request.json()) as {
        memberPartyId: number;
        groupMemberRoleId: number | null;
        joinedOn: string | null;
      };
      const failed = addMember(party, body.memberPartyId, body.groupMemberRoleId, body.joinedOn);
      if (failed) {
        return failed;
      }
      save();
      return HttpResponse.json({ id: memberIds.next - 1 }, { status: 201 });
    }),

    http.post(`${base}/parties/:id/members/:memberId/leave`, ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const member = find(params['id'] as string)?.members?.find(
        (row) => row.memberPartyId === Number(params['memberId']) && !row.leftOn,
      );
      if (!member) {
        return problem(404, 'not-found');
      }
      member.leftOn = new Date().toISOString().slice(0, 10);
      save();
      return new HttpResponse(null, { status: 204 });
    }),

    http.put(`${base}/parties/:id/members/:memberId/role`, async ({ request, params }) => {
      const denied = signedIn(request);
      if (denied) {
        return denied;
      }
      const group = find(params['id'] as string);
      const member = group?.members?.find(
        (row) => row.memberPartyId === Number(params['memberId']) && !row.leftOn,
      );
      const body = (await request.json()) as { groupMemberRoleId: number };
      const role = MEMBER_ROLES.find((row) => row.id === body.groupMemberRoleId);
      if (!group || !member || !role) {
        return problem(404, 'not-found');
      }
      if (
        role.code === 'CHAIRPERSON' &&
        group.members!.some((row) => row.isChairperson && !row.leftOn && row !== member)
      ) {
        return problem(409, 'group.chairperson-exists');
      }
      Object.assign(member, {
        groupMemberRoleId: role.id,
        roleCode: role.code,
        isChairperson: role.code === 'CHAIRPERSON',
      });
      save();
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
