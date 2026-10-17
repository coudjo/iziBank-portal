import { describe as describeValue, diffJson, label } from './json-diff';

describe('diffJson', () => {
  it('lists changed fields only, with readable names', () => {
    expect(diffJson({ name: 'Tellers', code: 'TELLER' }, { name: 'Counter staff', code: 'TELLER' })).toEqual([
      { field: 'Name', before: 'Tellers', after: 'Counter staff' },
    ]);
    expect(label('roleGroupCodes')).toBe('Role group codes');
  });

  it('shows what a list gained and lost, with permissions in words', () => {
    const grant = (sub: string, add: boolean) => ({
      moduleCode: 'PTY',
      subModuleCode: sub,
      allowView: true,
      allowAdd: add,
      allowEdit: false,
      allowDelete: false,
      allowSupervise: false,
    });
    const [change] = diffJson(
      { permissions: [grant('PARTY', false)] },
      { permissions: [grant('PARTY', true)] },
    );
    expect(change.field).toBe('Permissions');
    expect(change.removed).toEqual(['PTY / PARTY: view']);
    expect(change.added).toEqual(['PTY / PARTY: view, add']);
  });

  it('treats a new record as every field added', () => {
    expect(diffJson(null, { accountName: 'Cash' })).toEqual([
      { field: 'Account name', before: '—', after: 'Cash' },
    ]);
    expect(describeValue(true)).toBe('Yes');
  });
});
