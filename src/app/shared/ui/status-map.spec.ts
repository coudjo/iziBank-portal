import { STATUS_MAP, statusFor } from './status-map';

describe('status map', () => {
  it('gives every status an icon, a text label and an explanation', () => {
    for (const statuses of Object.values(STATUS_MAP)) {
      for (const status of Object.values(statuses)) {
        expect(status.icon.length).toBeGreaterThan(0);
        expect(status.label.length).toBeGreaterThan(0);
        expect(status.explanation.length).toBeGreaterThan(0);
      }
    }
  });

  it('shows an unknown code as neutral text rather than colour alone', () => {
    const unknown = statusFor('kyc', 'SOMETHING_NEW');
    expect(unknown.family).toBe('neutral');
    expect(unknown.label).toBe('SOMETHING_NEW');
  });
});
