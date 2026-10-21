import type { ModuleView, PermissionGrant } from '../../core/api/api-types';
import { allowed, describeChanges, grantedBy, matrixRows, setFlag, stored } from './permission-matrix';

const MODULES: ModuleView[] = [
  {
    moduleCode: 'ACC',
    moduleName: 'Accounts',
    subModules: [
      { subModuleCode: 'PRODUCT', subModuleName: 'Product' },
      { subModuleCode: 'ACCOUNT', subModuleName: 'Account' },
    ],
  },
];

const grant = (subModuleCode: string | null, flags: string): PermissionGrant => ({
  moduleCode: 'ACC',
  subModuleCode,
  allowView: flags.includes('V'),
  allowAdd: flags.includes('A'),
  allowEdit: flags.includes('E'),
  allowDelete: flags.includes('D'),
  allowSupervise: flags.includes('S'),
});

describe('permission matrix (UX 6.10, API addendum 2.2)', () => {
  const rows = matrixRows(MODULES);
  const [all, product, account] = rows;

  it('lists each module as an "all" row followed by its sub-modules', () => {
    expect(rows.map((row) => row.label)).toEqual([
      'Accounts (all)',
      'Accounts › Product',
      'Accounts › Account',
    ]);
  });

  it('lets a module row cover its sub-modules, but not the other way round', () => {
    const grants = [grant(null, 'V'), grant('PRODUCT', 'VE')];
    expect(allowed(grants, account, 'allowView')).toBe(true);
    expect(allowed(grants, product, 'allowEdit')).toBe(true);
    expect(allowed(grants, all, 'allowEdit')).toBe(false);
    expect(stored(grants, account, 'allowView')).toBe(false);
  });

  it('ticks View with any other permission and clears the row with View', () => {
    let grants = setFlag([], product, 'allowSupervise', true);
    expect(grants).toEqual([grant('PRODUCT', 'VS')]);
    grants = setFlag(grants, product, 'allowView', false);
    expect(grants).toEqual([]);
  });

  it('names the groups that grant a permission', () => {
    const groups = [
      { name: 'Teller', permissions: [grant('ACCOUNT', 'VA')] },
      { name: 'Supervisor', permissions: [grant(null, 'VAS')] },
    ];
    expect(grantedBy(groups, account, 'allowAdd')).toEqual(['Teller', 'Supervisor']);
    expect(grantedBy(groups, account, 'allowSupervise')).toEqual(['Supervisor']);
  });

  it('describes a change in words, without repeating a module change on its sub-modules', () => {
    expect(describeChanges(rows, [grant('PRODUCT', 'VE')], [grant(null, 'VS')])).toEqual([
      'Adds View, Approve on Accounts (all)',
      'Removes Edit on Accounts › Product',
    ]);
  });
});
