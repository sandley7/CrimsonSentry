// Read-only access to Stellar testnet for the CrimsonSentry tools.
//
// Nothing in this module signs or submits transactions and it never touches
// secret keys: contract reads are simulations through Stellar RPC, and account
// data comes from Horizon.

import { contract, rpc, xdr, Asset, Networks, StrKey } from '@stellar/stellar-sdk';

// This module also runs in the browser (the public demo reuses it), so it only
// uses APIs that Node and browsers share: fetch and WebCrypto.
async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const NETWORKS = {
  testnet: {
    name: 'testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    passphrase: Networks.TESTNET,
    expertUrl: 'https://stellar.expert/explorer/testnet',
  },
};

export const STROOPS_PER_XLM = 10_000_000n;
export const LEDGERS_PER_DAY = 17_280;

/** Connects to a known network and refuses to continue if the RPC reports a different one. */
export async function connect(networkName = 'testnet') {
  const net = NETWORKS[networkName];
  if (!net) {
    throw new Error(`Red desconocida "${networkName}". Estas herramientas solo operan en: ${Object.keys(NETWORKS).join(', ')}`);
  }
  const server = new rpc.Server(net.rpcUrl);
  const { passphrase } = await server.getNetwork();
  if (passphrase !== net.passphrase) {
    throw new Error(`El RPC ${net.rpcUrl} no es ${net.name} (passphrase: "${passphrase}"). Abortando.`);
  }
  return { ...net, server };
}

/** GET a Horizon path. Returns null on 404, retries on 429/5xx. */
export async function horizon(conn, path, { retries = 2 } = {}) {
  const url = path.startsWith('http') ? path : `${conn.horizonUrl}${path}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (res.status === 404) return null;
    if (res.ok) return res.json();
    if (attempt >= retries || !(res.status === 429 || res.status >= 500)) {
      throw new Error(`Horizon ${res.status} en ${url}`);
    }
    await new Promise((r) => setTimeout(r, 1_000 * (attempt + 1)));
  }
}

/** Calls the vault's read-only get_status() through a simulation (no keys, no fees). */
export async function getVaultStatus(conn, vaultId) {
  const client = await contract.Client.from({
    contractId: vaultId,
    networkPassphrase: conn.passphrase,
    rpcUrl: conn.rpcUrl,
  });
  const tx = await client.get_status();
  const status = tx.result;
  // An agent account (architecture B, contracts/agent-account) has no `agent` address: the agent is an
  // ed25519 key kept in the contract's storage. Derive the classic address of that same key, so the checks
  // that look at the agent's own funds and signers still apply: if the key also controls a funded classic
  // account, a leaked key moves that money without going through the policy.
  if (status.agent === undefined && status.owner !== undefined) {
    const { agentKey } = await getAccountKeys(conn, vaultId);
    if (agentKey) {
      status.agent = StrKey.encodeEd25519PublicKey(Uint8Array.from(agentKey));
      status.isAccount = true;
    }
  }
  return status;
}

/** The raw ed25519 keys an agent account keeps in its instance storage (null when absent). */
export async function getAccountKeys(conn, contractId) {
  try {
    const inst = await conn.server.getContractData(contractId, xdr.ScVal.scvLedgerKeyContractInstance());
    const storage = inst.val.contractData.val.instance.storage ?? [];
    // In SDK 17 a symbol is an XdrString and a byte string an object holding the bytes in `.value`.
    const bytes = (name) => {
      const entry = storage.find((e) => e.key.type === 'scvVec' && String(e.key.vec?.[0]?.sym) === name);
      return entry?.val?.bytes?.value ?? null;
    };
    return { agentKey: bytes('AgentKey'), ownerKey: bytes('OwnerKey') };
  } catch {
    return { agentKey: null, ownerKey: null };
  }
}

/** On-chain facts about the contract itself: code hash and how long the instance stays live. */
export async function getContractInfo(conn, vaultId) {
  const [wasm, latest] = await Promise.all([
    conn.server.getContractWasmByContractId(vaultId),
    conn.server.getLatestLedger(),
  ]);
  let liveUntil = null;
  try {
    const inst = await conn.server.getContractData(vaultId, xdr.ScVal.scvLedgerKeyContractInstance());
    liveUntil = inst.liveUntilLedgerSeq ?? null;
  } catch {
    liveUntil = null; // archived or missing
  }
  return {
    wasmSha256: await sha256Hex(wasm),
    wasmSize: wasm.length,
    liveUntil,
    latestLedger: latest.sequence,
  };
}

export function nativeSacId(conn) {
  return Asset.native().contractId(conn.passphrase);
}

/** Current base reserve in stroops, from the latest closed ledger. */
export async function getBaseReserve(conn) {
  const page = await horizon(conn, '/ledgers?order=desc&limit=1');
  return BigInt(page._embedded.records[0].base_reserve_in_stroops);
}

export async function getAccount(conn, accountId) {
  return horizon(conn, `/accounts/${accountId}`);
}

/** Recent transactions (including failed ones) and operations touching an account. */
export async function getActivity(conn, accountId, limit = 200) {
  const [txs, ops] = await Promise.all([
    horizon(conn, `/accounts/${accountId}/transactions?include_failed=true&order=desc&limit=${limit}`),
    horizon(conn, `/accounts/${accountId}/operations?order=desc&limit=${limit}`),
  ]);
  return {
    transactions: txs?._embedded.records ?? [],
    operations: ops?._embedded.records ?? [],
  };
}

/** Formats stroops (bigint | number | string) as XLM with thousands separators. */
export function xlm(stroops) {
  const v = BigInt(stroops);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / STROOPS_PER_XLM;
  const frac = (abs % STROOPS_PER_XLM).toString().padStart(7, '0').replace(/0+$/, '');
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${wholeStr}${frac ? '.' + frac.slice(0, 2) : ''} XLM`;
}

/** Parses a Horizon decimal amount ("9999.9657908") into stroops. */
export function toStroops(amount) {
  const [whole, frac = ''] = String(amount).split('.');
  return BigInt(whole) * STROOPS_PER_XLM + BigInt((frac + '0000000').slice(0, 7));
}
