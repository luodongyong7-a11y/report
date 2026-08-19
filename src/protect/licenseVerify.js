export const LICENSE_PUBLIC_SPKI_BASE64 = 'MCowBQYDK2VwAyEAbXN/VfzQKPA4PWrVcBYpY0YDts2HMCV1J0QoJqGqbeA='

export function licenseIsPro (status) {
  return !!(status && status.active && status.edition === 'pro')
}
