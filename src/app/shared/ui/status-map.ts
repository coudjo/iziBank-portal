/**
 * Status chips (UX 5.1, frontend plan F1-05). Every status has a family, an icon and a label: status is never
 * shown by colour alone.
 */
export type StatusFamily = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface StatusDefinition {
  family: StatusFamily;
  icon: string;
  label: string;
  explanation: string;
}

export type StatusDomain = 'approval' | 'kyc' | 'account' | 'businessDay';

export const STATUS_MAP: Readonly<Record<StatusDomain, Readonly<Record<string, StatusDefinition>>>> = {
  approval: {
    PENDING: {
      family: 'warning',
      icon: 'clock-circle',
      label: 'Awaiting approval',
      explanation: 'A different supervisor must approve this before it can be used.',
    },
    APPROVED: {
      family: 'success',
      icon: 'check-circle',
      label: 'Approved',
      explanation: 'A supervisor has approved this record.',
    },
  },
  kyc: {
    PENDING: {
      family: 'warning',
      icon: 'clock-circle',
      label: 'KYC pending',
      explanation: 'Identity checks are not complete. A KYC officer verifies and approves the customer.',
    },
    VERIFIED: {
      family: 'success',
      icon: 'safety-certificate',
      label: 'Verified',
      explanation: "The customer's identity has been checked and approved.",
    },
    REJECTED: {
      family: 'danger',
      icon: 'close-circle',
      label: 'Rejected',
      explanation: 'Identity checks failed. See the reason on the KYC tab.',
    },
    EXPIRED: {
      family: 'warning',
      icon: 'exclamation-circle',
      label: 'Expired',
      explanation: 'An identity document has expired. Upload a current one and verify again.',
    },
  },
  account: {
    PENDING: {
      family: 'warning',
      icon: 'clock-circle',
      label: 'Awaiting approval',
      explanation: 'The account cannot be used until a supervisor approves it.',
    },
    PENDING_SUPERVISION: {
      family: 'warning',
      icon: 'clock-circle',
      label: 'Awaiting approval',
      explanation: 'The account cannot be used until a supervisor approves it.',
    },
    ACTIVE: {
      family: 'success',
      icon: 'check-circle',
      label: 'Active',
      explanation: 'The account is in use.',
    },
    FROZEN: {
      family: 'danger',
      icon: 'stop',
      label: 'Frozen',
      explanation: 'Debits are blocked until a supervisor unfreezes the account.',
    },
    DORMANT: {
      family: 'neutral',
      icon: 'minus-circle',
      label: 'Dormant',
      explanation: 'The account has been marked dormant. A supervisor can reactivate it.',
    },
    CLOSED: {
      family: 'neutral',
      icon: 'minus-circle',
      label: 'Closed',
      explanation: 'The account is closed and cannot be changed.',
    },
  },
  businessDay: {
    OPEN: {
      family: 'success',
      icon: 'check-circle',
      label: 'Open',
      explanation: 'The business day is open.',
    },
    CLOSED: {
      family: 'neutral',
      icon: 'minus-circle',
      label: 'Closed',
      explanation: 'The business day is not open. Ask a supervisor to open it.',
    },
    NOT_OPEN: {
      family: 'warning',
      icon: 'warning',
      label: 'Business day not open',
      explanation: 'The business day is not open for this branch. Ask a supervisor to open it.',
    },
    EOD_IN_PROGRESS: {
      family: 'info',
      icon: 'sync',
      label: 'End of day running',
      explanation: 'End of day is in progress. Some actions wait until it finishes.',
    },
  },
};

export function statusFor(domain: StatusDomain, code: string): StatusDefinition {
  return (
    STATUS_MAP[domain][code] ?? {
      family: 'neutral',
      icon: 'info-circle',
      label: code,
      explanation: '',
    }
  );
}
