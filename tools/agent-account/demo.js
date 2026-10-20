// Architecture B on testnet: pay from the agent ACCOUNT (a contract) instead of
// calling a vault. The payment is a plain token `transfer(from = account, ...)`,
// the same call x402 makes, authorized by the account's `__check_auth`.
//
// Testnet only. It uses throwaway keys that it generates and keeps in
// tools/agent-account/.keys.json (git-ignored): an agent key, an owner key and a
// "relayer" account that pays the fees, like an x402 facilitator would. It never
// touches the keys of the Stellar CLI keystore.
//
//   node agent-account/demo.js init
//   node agent-account/demo.js prepare --account C... --to G... --amount 8 [--as agent|owner] [--out file]
//   node agent-account/demo.js send --file file
//   node agent-account/demo.js sim --account C... --to G... --amount 8 [--as agent|owner]

import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  Address, Asset, Contract, Keypair, Networks, Operation, TransactionBuilder, authorizeEntry, nativeToScVal, rpc, xdr,
} from '@stellar/stellar-sdk';

const HERE = dirname(fileURLToPath(import.meta.url));
const KEYS = join(HERE, '.keys.json');
const RPC_URL = 'https://soroban-testnet.stellar.org';
const PASSPHRASE = Networks.TESTNET;
const STROOPS = 10_000_000n;
const XLM_SAC = Asset.native().contractId(PASSPHRASE);

const { positionals, values: args } = parseArgs({
  allowPositionals: true,
  options: {
    account: { type: 'string' },
    to: { type: 'string' },
    amount: { type: 'string' },
    as: { type: 'string', default: 'agent' },
    out: { type: 'string' },
    file: { type: 'string' },
    'seq-offset': { type: 'string', default: '0' },
  },
});
const command = positionals[0];
const server = new rpc.Server(RPC_URL);
const say = (o) => console.log(JSON.stringify(o));

function loadKeys() {
  if (!existsSync(KEYS)) throw new Error('Faltan las claves de prueba: ejecuta primero "init".');
  const k = JSON.parse(readFileSync(KEYS, 'utf8'));
  return { agent: Keypair.fromSecret(k.agent), owner: Keypair.fromSecret(k.owner), relayer: Keypair.fromSecret(k.relayer) };
}

async function init() {
  let k;
  if (existsSync(KEYS)) {
    k = JSON.parse(readFileSync(KEYS, 'utf8'));
  } else {
    k = { agent: Keypair.random().secret(), owner: Keypair.random().secret(), relayer: Keypair.random().secret() };
    writeFileSync(KEYS, JSON.stringify(k, null, 2));
  }
  const keys = { agent: Keypair.fromSecret(k.agent), owner: Keypair.fromSecret(k.owner), relayer: Keypair.fromSecret(k.relayer) };
  const exists = await server.getAccount(keys.relayer.publicKey()).then(() => true).catch(() => false);
  if (!exists) {
    const res = await fetch(`https://friendbot.stellar.org/?addr=${keys.relayer.publicKey()}`);
    if (!res.ok) throw new Error(`Friendbot respondió ${res.status}`);
  }
  // Only public data is printed: the keys stay in the git-ignored file.
  say({
    agent_key_hex: Buffer.from(keys.agent.rawPublicKey()).toString('hex'),
    owner_key_hex: Buffer.from(keys.owner.rawPublicKey()).toString('hex'),
    relayer: keys.relayer.publicKey(),
  });
}

/** The address an auth entry is for, whatever flavor of address credentials it carries. */
function entryAddress(entry) {
  const c = entry.credentials;
  const creds = { sorobanCredentialsAddress: c.address, sorobanCredentialsAddressV2: c.addressV2, sorobanCredentialsAddressWithDelegates: c.addressWithDelegates?.addressCredentials }[c.type];
  return creds ? Address.fromScAddress(creds.address).toString() : null;
}

/**
 * Signs the auth entry of the account contract. The signature is our own enum
 * (Agent or Owner), not a classic ed25519 account signature, so the SDK is
 * given the ScVal to store instead of a key.
 */
function signEntry(entry, keypair, kind, validUntil, account) {
  return authorizeEntry(
    entry,
    async (_preimage, payload) => ({
      signatureScVal: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(kind), xdr.ScVal.scvBytes(keypair.sign(Buffer.from(payload)))]),
      address: account,
    }),
    validUntil,
    PASSPHRASE,
    account,
  );
}

function parseXlm(text) {
  const [w, f = ''] = String(text).split('.');
  return BigInt(w) * STROOPS + BigInt((f + '0000000').slice(0, 7));
}

/** The error code the contract returned, read from the simulation message. */
function contractError(message) {
  const m = /Error\(Contract, #(\d+)\)/.exec(String(message));
  return m ? Number(m[1]) : null;
}

async function build(account, to, stroops, signerKind) {
  const keys = loadKeys();
  const signer = signerKind === 'owner' ? keys.owner : keys.agent;
  const kind = signerKind === 'owner' ? 'Owner' : 'Agent';
  const source = await server.getAccount(keys.relayer.publicKey());
  // A second payment built before the first lands needs the next sequence number.
  for (let i = 0; i < Number(args['seq-offset']); i++) source.incrementSequenceNumber();
  const call = new Contract(XLM_SAC).call(
    'transfer',
    new Address(account).toScVal(),
    new Address(to).toScVal(),
    nativeToScVal(stroops, { type: 'i128' }),
  );
  const draft = new TransactionBuilder(source, { fee: '10000000', networkPassphrase: PASSPHRASE })
    .addOperation(call)
    .setTimeout(300)
    .build();

  // 1. Record: which authorizations does the transfer ask for?
  const recorded = await server.simulateTransaction(draft);
  if (rpc.Api.isSimulationError(recorded)) return { ok: false, stage: 'record', error: recorded.error };
  if (!recorded.result.auth.some((e) => entryAddress(e) === account)) {
    return { ok: false, stage: 'record', error: 'La simulación no pidió la firma de la cuenta' };
  }

  // 2. Sign them with the agent (or owner) key.
  const latest = await server.getLatestLedger();
  const validUntil = latest.sequence + 200;
  const signed = [];
  for (const e of recorded.result.auth) {
    signed.push(entryAddress(e) === account ? await signEntry(e, signer, kind, validUntil, account) : e);
  }
  const op = Operation.invokeHostFunction({ func: draft.operations[0].func, auth: signed });
  const source2 = await server.getAccount(keys.relayer.publicKey());
  for (let i = 0; i < Number(args['seq-offset']); i++) source2.incrementSequenceNumber();
  const signedTx = new TransactionBuilder(source2, { fee: '10000000', networkPassphrase: PASSPHRASE })
    .addOperation(op)
    .setTimeout(300)
    .build();

  // 3. Enforce: now the contract's __check_auth runs for real.
  const enforced = await server.simulateTransaction(signedTx);
  if (rpc.Api.isSimulationError(enforced)) {
    return { ok: false, stage: 'enforce', error: enforced.error, code: contractError(enforced.error) };
  }
  const final = rpc.assembleTransaction(signedTx, enforced).build();
  final.sign(keys.relayer);
  return { ok: true, tx: final };
}

async function prepare() {
  const { account, to, amount } = args;
  if (!account || !to || !amount) throw new Error('Uso: prepare --account C... --to G... --amount <XLM> [--as agent|owner] [--out archivo]');
  const r = await build(account, to, parseXlm(amount), args.as);
  if (!r.ok) {
    say({ ok: false, stage: r.stage, code: r.code ?? null, error: String(r.error).slice(0, 300) });
    return;
  }
  const out = args.out ?? join(HERE, '.last-tx.xdr');
  writeFileSync(out, r.tx.toXDR());
  say({ ok: true, hash: r.tx.hash().toString('hex'), file: out });
}

/** The contract error the ledger recorded for a failed transaction (same trick as tools/agent/wallet.js). */
function onchainErrorCode(txHash) {
  try {
    const meta = execFileSync('stellar', ['tx', 'fetch', 'meta', '--hash', txHash, '--network', 'testnet', '--output', 'json'], { encoding: 'utf8', maxBuffer: 20_000_000 });
    const m = /"contract":\s*(\d+)/.exec(meta);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

async function send() {
  const file = args.file ?? join(HERE, '.last-tx.xdr');
  const tx = TransactionBuilder.fromXDR(readFileSync(file, 'utf8'), PASSPHRASE);
  const sent = await server.sendTransaction(tx);
  if (sent.status === 'ERROR') {
    say({ ok: false, hash: sent.hash, status: 'ERROR', error: String(sent.errorResult?.toXDR?.('base64') ?? '').slice(0, 120) });
    return;
  }
  let res = await server.getTransaction(sent.hash);
  for (let i = 0; res.status === 'NOT_FOUND' && i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await server.getTransaction(sent.hash);
  }
  say({
    ok: res.status === 'SUCCESS',
    hash: sent.hash,
    status: res.status,
    ledger: res.ledger ?? null,
    code: res.status === 'FAILED' ? onchainErrorCode(sent.hash) : null,
  });
}

async function sim() {
  const { account, to, amount } = args;
  const r = await build(account, to, parseXlm(amount), args.as);
  say(r.ok ? { ok: true, verdict: 'accepted' } : { ok: false, stage: r.stage, code: r.code ?? null, error: String(r.error).slice(0, 300) });
}

const commands = { init, prepare, send, sim };
if (!commands[command]) {
  console.error('Comandos: init | prepare | send | sim');
  process.exit(64);
}
commands[command]().catch((e) => {
  say({ ok: false, error: String(e.message ?? e) });
  process.exit(1);
});
