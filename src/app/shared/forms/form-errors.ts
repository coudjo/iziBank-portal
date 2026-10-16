import { AbstractControl, FormGroup } from '@angular/forms';

/** A problem shown in the error summary. `field` is the form control name, when the problem belongs to one. */
export interface FormProblem {
  field: string | null;
  message: string;
}

/** Messages for the validators the portal uses. A field's own messages win over these. */
const DEFAULT_MESSAGES: Readonly<Record<string, string>> = {
  required: 'This field is required.',
  email: 'Enter an email address like name@example.com.',
  phone: 'Enter a valid phone number, for example 024 123 4567.',
  date: 'Enter a date like 27/03/1985.',
  option: 'Choose a value from the list.',
};

/**
 * FormErrorMapper (frontend plan 6.5): puts the API's `errors` map onto the matching controls as a `server` error.
 * Angular clears it as soon as the value changes. Fields the form does not know go back to the caller for the
 * error summary. `aliases` maps API field names to control names where they differ.
 */
export function applyServerErrors(
  form: FormGroup,
  errors: Readonly<Record<string, readonly string[]>>,
  aliases: Readonly<Record<string, string>> = {},
): FormProblem[] {
  const unmatched: FormProblem[] = [];
  for (const [name, messages] of Object.entries(errors)) {
    const message = messages[0];
    if (!message) {
      continue;
    }
    const controlName = aliases[name] ?? name;
    const control = form.get(controlName) ?? form.get(lowerFirst(controlName));
    if (control) {
      control.setErrors({ ...(control.errors ?? {}), server: message });
      control.markAsTouched();
    } else {
      unmatched.push({ field: null, message });
    }
  }
  return unmatched;
}

/** The first message for a control's errors: the server's, then the field's own messages, then the defaults. */
export function errorMessage(
  control: AbstractControl | null,
  messages: Readonly<Record<string, string>> = {},
): string | null {
  const errors = control?.errors;
  if (!errors) {
    return null;
  }
  // Errors that carry their own message: the server's (FormErrorMapper) and validators that build one.
  if (typeof errors['server'] === 'string') {
    return errors['server'];
  }
  const own = Object.values(errors).find((value): value is string => typeof value === 'string');
  if (own) {
    return own;
  }
  for (const key of Object.keys(errors)) {
    const message = messages[key] ?? DEFAULT_MESSAGES[key];
    if (message) {
      return message;
    }
    if (key === 'maxlength') {
      return `Use ${(errors['maxlength'] as { requiredLength: number }).requiredLength} characters or fewer.`;
    }
  }
  return DEFAULT_MESSAGES['required'];
}

/** Every invalid control of `fields`, in order, for the error summary. */
export function formProblems(
  form: FormGroup,
  fields: readonly string[],
  messages: Readonly<Record<string, Readonly<Record<string, string>>>> = {},
): FormProblem[] {
  const problems: FormProblem[] = [];
  for (const field of fields) {
    const control = form.get(field);
    const message = control?.invalid ? errorMessage(control, messages[field]) : null;
    if (message) {
      problems.push({ field, message });
    }
  }
  return problems;
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
