// x402 "exact" client for a CrimsonSentry agent ACCOUNT (a contract address).
//
// Adapted from ExactStellarScheme.createPaymentPayload in @x402/stellar 2.20.0
// (Apache-2.0, https://github.com/coinbase/x402). The official client cannot pay
// from a contract account: it hands the wallet's `signAuthEntry` to the SDK, which
// builds a classic ed25519 signature from the payer's address and fails on a C...
// address ("invalid version byte"). This version signs the account's authorization
// entry with the account's own signature enum (Agent or Owner), which its
// `__check_auth` verifies, and keeps everything else the same: one invokeHostFunction
// operation calling transfer(from, to, amount), only the auth entries signed, and
// no fee or sequence number spent by the client.

import { contract, nativeToScVal, xdr, hash } from '@stellar/stellar-sdk';
import {
  getEstimatedLedgerCloseTimeSeconds, getNetworkPassphrase, getRpcClient, getRpcUrl, handleSimulationResult,
} from '@x402/stellar';

export class AgentAccountScheme {
  scheme = 'exact';

  /**
   * @param {{ account: string, keypair: import('@stellar/stellar-sdk').Keypair, kind?: 'Agent' | 'Owner', rpcConfig?: object }} opts
   *   account: the contract account paying (C...). keypair: the key that signs (agent by default).
   */
  constructor({ account, keypair, kind = 'Agent', rpcConfig }) {
    this.account = account;
    this.keypair = keypair;
    this.kind = kind;
    this.rpcConfig = rpcConfig;
    this.lastCost = null;
  }

  /** Signs the account's auth entry. Only the legacy address credentials are handled (what simulation returns today). */
  #authorizer() {
    return async (entry, _signerCallback, validUntil, networkPassphrase) => {
      const type = entry.credentials().switch().name;
      if (type !== 'sorobanCredentialsAddress') throw new Error(`credential type not handled: ${type}`);
      const creds = entry.credentials().address();
      creds.signatureExpirationLedger(validUntil);
      const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
        new xdr.HashIdPreimageSorobanAuthorization({
          networkId: hash(Buffer.from(networkPassphrase)),
          nonce: creds.nonce(),
          signatureExpirationLedger: validUntil,
          invocation: entry.rootInvocation(),
        }),
      );
      const signature = this.keypair.sign(hash(preimage.toXDR()));
      creds.signature(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(this.kind), xdr.ScVal.scvBytes(signature)]));
      return entry;
    };
  }

  async createPaymentPayload(x402Version, paymentRequirements) {
    const { network, payTo, asset, amount, extra, maxTimeoutSeconds } = paymentRequirements;
    if (paymentRequirements.scheme !== 'exact') throw new Error(`Unsupported scheme: ${paymentRequirements.scheme}`);
    if (!extra?.areFeesSponsored) throw new Error('Exact scheme requires areFeesSponsored to be true');

    const rpcServer = getRpcClient(network, this.rpcConfig);
    const { sequence } = await rpcServer.getLatestLedger();
    const maxLedger = sequence + Math.ceil(maxTimeoutSeconds / (await getEstimatedLedgerCloseTimeSeconds(network)));

    const tx = await contract.AssembledTransaction.build({
      contractId: asset,
      method: 'transfer',
      args: [
        nativeToScVal(this.account, { type: 'address' }), // from: the contract account
        nativeToScVal(payTo, { type: 'address' }),
        nativeToScVal(amount, { type: 'i128' }),
      ],
      networkPassphrase: getNetworkPassphrase(network),
      rpcUrl: getRpcUrl(network, this.rpcConfig),
      parseResultXdr: (r) => r,
    });
    handleSimulationResult(tx.simulation);
    let missing = tx.needsNonInvokerSigningBy();
    if (!missing.includes(this.account) || missing.length > 1) {
      throw new Error(`Expected to sign with [${this.account}], but got [${missing.join(', ')}]`);
    }

    await tx.signAuthEntries({ address: this.account, expiration: maxLedger, authorizeEntry: this.#authorizer() });
    await tx.simulate(); // enforce mode: the account's __check_auth runs here
    handleSimulationResult(tx.simulation);
    missing = tx.needsNonInvokerSigningBy();
    if (missing.length > 0) throw new Error(`unexpected signer(s) required: [${missing.join(', ')}]`);

    const resources = tx.simulation.transactionData.build().resources();
    this.lastCost = { minResourceFee: Number(tx.simulation.minResourceFee), instructions: resources.instructions() };
    return { x402Version, payload: { transaction: tx.built.toXDR() } };
  }
}
