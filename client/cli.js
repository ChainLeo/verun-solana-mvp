import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { ScanClient, ClientError } from './scan.js';
import { signChallenge } from './policy.js';
import { readPrivate } from './storage.js';

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { state: { type: 'string' }, query: { type: 'string' }, 'approve-test-usdc': { type: 'boolean' }, help: { type: 'boolean' } } });
  if (values.help) {
    console.log('scan prepare --query query.json --state .verun-client/scan.json\nscan pay --state .verun-client/scan.json --approve-test-usdc\nscan status|retry --state .verun-client/scan.json\nRequires VERUN_CLIENT_CONFIG_FILE and VERUN_GATEWAY_TOKEN_FILE. Pay also needs SOLANA_PAYER_KEYPAIR_FILE.');
  } else {
    const command = positionals[0];
    if (positionals.length !== 1 || !['prepare', 'pay', 'retry', 'status'].includes(command) || !values.state || (command === 'prepare' && !values.query)) throw new ClientError('invalid_arguments; use --help');
    const config = JSON.parse(fs.readFileSync(process.env.VERUN_CLIENT_CONFIG_FILE, 'utf8'));
    const token = readPrivate(process.env.VERUN_GATEWAY_TOKEN_FILE).trim();
    const client = new ScanClient({ config, token, sign: async (challenge, approved, requestId) => {
      const key = JSON.parse(readPrivate(process.env.SOLANA_PAYER_KEYPAIR_FILE));
      if (!Array.isArray(key) || key.length !== 64 || !key.every(b => Number.isInteger(b) && b >= 0 && b <= 255)) throw new ClientError('invalid_local_keypair');
      const signer = await createKeyPairSignerFromBytes(Uint8Array.from(key));
      return signChallenge(challenge, signer, approved, requestId);
    } });
    const result = command === 'prepare' ? await client.prepare(values.state, JSON.parse(fs.readFileSync(values.query, 'utf8'))) :
      command === 'pay' ? await client.pay(values.state, values['approve-test-usdc'] === true) : await client[command](values.state);
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(error instanceof ClientError ? error.message : 'client_operation_failed; check configuration, private file permissions and saved scan state');
  process.exitCode = 1;
}
