/** Test (QE) environment base URL — no trailing slash. */
export const TEST_BASE_URL = 'https://api-qecom.novapay.ua';

/** Production environment base URL — no trailing slash. */
export const PRODUCTION_BASE_URL = 'https://api-ecom.novapay.ua';

/** HTTP header used by NovaPay for RSA request signatures. */
export const HEADER_X_SIGN = 'x-sign';

/** HTTP header used by NovaPay for webhook request signatures. */
export const WEBHOOK_HEADER_X_SIGN = 'x-sign-v2';

export const paths = {
  acquiring: {
    createSession: '/v1/session',
    addPayment: '/v1/payment',
    voidSession: '/v1/void',
    completeHold: '/v1/complete-hold',
    expireSession: '/v1/expire',
    getStatus: '/v1/get-status',
  },
  checkout: {
    createSession: '/v1/checkout/session',
    addPayment: '/v1/checkout/payment',
    /** Same path as acquiring; host is the checkout client base URL. */
    voidSession: '/v1/void',
    /** Same path as acquiring; host is the checkout client base URL. */
    completeHold: '/v1/complete-hold',
    /** Same path as acquiring; host is the checkout client base URL. */
    getStatus: '/v1/get-status',
    /** Same path as acquiring; host is the checkout client base URL. */
    expireSession: '/v1/expire',
  },
} as const;
