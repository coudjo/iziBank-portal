import { FormControl, FormGroup, Validators } from '@angular/forms';
import { applyServerErrors, errorMessage, formProblems } from './form-errors';
import { SubmitGuard } from './submit-guard';

describe('applyServerErrors', () => {
  const form = () =>
    new FormGroup({
      firstName: new FormControl('Ama'),
      mobile: new FormControl('0241234567'),
    });

  it('puts server messages on the matching fields and returns the rest', () => {
    const group = form();
    const rest = applyServerErrors(group, {
      firstName: ['Enter the first name (up to 60 characters).'],
      somethingElse: ['Something else is wrong.'],
    });

    expect(errorMessage(group.controls.firstName)).toBe('Enter the first name (up to 60 characters).');
    expect(group.controls.firstName.touched).toBe(true);
    expect(rest).toEqual([{ field: null, message: 'Something else is wrong.' }]);
  });

  it('clears the server error when the value changes and keeps the entered data', () => {
    const group = form();
    applyServerErrors(group, { mobile: ['Enter a mobile number.'] });
    expect(group.controls.mobile.value).toBe('0241234567');

    group.controls.mobile.setValue('0241234568');
    expect(group.controls.mobile.errors).toBeNull();
  });

  it('lists invalid fields in order with their messages', () => {
    const group = new FormGroup({
      firstName: new FormControl('', Validators.required),
      lastName: new FormControl('', [Validators.maxLength(3)]),
    });
    group.controls.lastName.setValue('Mensah');

    expect(
      formProblems(group, ['firstName', 'lastName'], { firstName: { required: 'Enter the first name.' } }),
    ).toEqual([
      { field: 'firstName', message: 'Enter the first name.' },
      { field: 'lastName', message: 'Use 3 characters or fewer.' },
    ]);
  });
});

describe('SubmitGuard', () => {
  it('ignores a second submission while the first runs', async () => {
    const guard = new SubmitGuard();
    let calls = 0;
    let finish!: () => void;
    const work = () =>
      new Promise<void>((resolve) => {
        calls++;
        finish = resolve;
      });

    const first = guard.run(work);
    const second = await guard.run(work);
    expect(guard.busy()).toBe(true);
    expect(second).toBeUndefined();

    finish();
    await first;
    expect(calls).toBe(1);
    expect(guard.busy()).toBe(false);
  });
});
