// Encrypted state only: repository and Actions artifacts may be public.
const fs = require('node:fs');
const crypto = require('node:crypto');
const mode = process.argv[2];
const keyText = process.env.BRIDGE_STATE_KEY;
if (!keyText || !/^[a-f0-9]{64}$/i.test(keyText)) {
  console.error('Encrypted persistence unavailable: configure a 32-byte hex BRIDGE_STATE_KEY in Actions secrets.');
  process.exit(1);
}
const key = Buffer.from(keyText, 'hex');
fs.mkdirSync('.dev-bridge', {recursive:true, mode:0o700});
if (mode === 'seal') {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(fs.readFileSync('.dev-bridge/snapshot.json')), cipher.final()]);
  fs.writeFileSync('.dev-bridge/state.enc', Buffer.concat([nonce,cipher.getAuthTag(),ciphertext]), {mode:0o600});
} else if (mode === 'open') {
  const envelope = fs.readFileSync('.dev-bridge/state.enc');
  const decipher = crypto.createDecipheriv('aes-256-gcm',key,envelope.subarray(0,12));
  decipher.setAuthTag(envelope.subarray(12,28));
  try {
    const plaintext = Buffer.concat([decipher.update(envelope.subarray(28)),decipher.final()]);
    const data = JSON.parse(plaintext);
    if(data.schema_version!==1 || !data.checkpoint || !data.github)throw Error('Invalid snapshot');
    fs.writeFileSync('.dev-bridge/snapshot.tmp',plaintext,{mode:0o600});
    fs.renameSync('.dev-bridge/snapshot.tmp','.dev-bridge/snapshot.json');
  } catch { console.error('Encrypted snapshot failed authentication/validation; prior state not overwritten.');process.exit(1); }
} else { console.error('Use seal|open');process.exit(1); }
