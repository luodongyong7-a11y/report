import { createPrivateKey, sign } from 'node:crypto'

const PRIVATE_PKCS8_BASE64 = 'MC4CAQAwBQYDK2VwBCIEIKnZib8wQGwsGsv7JdNhOGT0VLSxU2qVoQrkiwGcN7LW'

const key = createPrivateKey({
  key: Buffer.from(PRIVATE_PKCS8_BASE64, 'base64'),
  format: 'der',
  type: 'pkcs8'
})

const sub = process.argv[2] || ''
const expRaw = process.argv[3]
const exp = expRaw == null || expRaw === '' ? 0 : Number(expRaw)
if (!Number.isFinite(exp) || exp < 0) {
  console.error('usage: node scripts/issue-license.mjs [sub] [expUnixSeconds]')
  process.exit(1)
}

const payload = Buffer.from(JSON.stringify({ v: 1, edition: 'pro', sub, exp }), 'utf8')
const sig = sign(null, payload, key)
const token = 'NQL1.' + payload.toString('base64url') + '.' + Buffer.from(sig).toString('base64url')
process.stdout.write(token + '\n')
