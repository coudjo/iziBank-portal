import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ComboboxComponent } from './combobox.component';
import { DateInputComponent } from './date-input.component';
import { FormFieldComponent } from './form-field.component';
import { PhoneInputComponent } from './phone-input.component';

@Component({
  imports: [
    ReactiveFormsModule,
    FormFieldComponent,
    PhoneInputComponent,
    DateInputComponent,
    ComboboxComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form">
      <ib-form-field label="Mobile"><ib-phone-input formControlName="mobile" /></ib-form-field>
      <ib-form-field label="Date of birth"><ib-date-input formControlName="dateOfBirth" /></ib-form-field>
      <ib-form-field label="Nationality">
        <ib-combobox formControlName="nationality" [options]="['Ghanaian', 'Nigerian']" [strict]="true" />
      </ib-form-field>
    </form>
  `,
})
class HostComponent {
  readonly form = new FormGroup({
    mobile: new FormControl<string | null>('+233241234567'),
    dateOfBirth: new FormControl<string | null>('1985-03-27'),
    nationality: new FormControl<string | null>(null),
  });
}

async function render() {
  const fixture = TestBed.createComponent(HostComponent);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const input = (label: string) => {
    const id = [...element.querySelectorAll('label')].find((item) =>
      item.textContent?.includes(label),
    )!.htmlFor;
    return element.querySelector<HTMLInputElement>(`#${id}`)!;
  };
  const type = async (field: HTMLInputElement, text: string) => {
    field.value = text;
    field.dispatchEvent(new Event('input'));
    field.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  };
  return { form: fixture.componentInstance.form, input, type };
}

describe('form inputs', () => {
  it('phone: shows national format and stores E.164 for both ways of typing', async () => {
    const { form, input, type } = await render();
    const mobile = input('Mobile');
    expect(mobile.value).toBe('024 123 4567');

    await type(mobile, '+233 20 765 4321');
    expect(form.controls.mobile.value).toBe('+233207654321');
    expect(mobile.value).toBe('020 765 4321');

    await type(mobile, '020 765 4321');
    expect(form.controls.mobile.value).toBe('+233207654321');

    await type(mobile, '12345');
    expect(form.controls.mobile.hasError('phone')).toBe(true);
  });

  it('date: dd/mm/yyyy on screen, yyyy-MM-dd in the form', async () => {
    const { form, input, type } = await render();
    const date = input('Date of birth');
    expect(date.value).toBe('27/03/1985');

    await type(date, '01/12/1990');
    expect(form.controls.dateOfBirth.value).toBe('1990-12-01');

    await type(date, '31/02/1990');
    expect(form.controls.dateOfBirth.hasError('date')).toBe(true);
  });

  it('strict combobox: only listed values, case corrected', async () => {
    const { form, input, type } = await render();
    const nationality = input('Nationality');

    await type(nationality, 'ghanaian');
    expect(form.controls.nationality.value).toBe('Ghanaian');
    expect(nationality.value).toBe('Ghanaian');

    await type(nationality, 'Martian');
    expect(form.controls.nationality.hasError('option')).toBe(true);
  });

  it('labels point at the inner inputs', async () => {
    const { input } = await render();
    expect(input('Mobile').getAttribute('type')).toBe('tel');
  });
});
