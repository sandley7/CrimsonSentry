# CrimsonSentry — demo del agente

- Vault: [`CDXNZEYSITYUYBI4T5JDNLYBWPJ2LXSMW4D3KBJ25H4C2N734VV4KOIJ`](https://stellar.expert/explorer/testnet/contract/CDXNZEYSITYUYBI4T5JDNLYBWPJ2LXSMW4D3KBJ25H4C2N734VV4KOIJ)
- Agente: `GAYE3NNWPE3ORQFXZKQ65OHC7AECMGAUC7KENCHHCUC6TXKFKY7XA67L`
- Modo: cliente comprometido (envía aunque la simulación rechace)

| Paso | Intento | Resultado | Transacción |
|---|---|---|---|
| monto-minimo | 0.5 XLM → `GC6DTO…` | ⛔ **FAILED on-chain** — `Error(Contract, #12) UnderMinAmount` | [`6f7600d7…`](https://stellar.expert/explorer/testnet/tx/6f7600d7c09b0aca176c931a3adc8ab2d0227bccfd6169aece4d0ee5169b3191) |
| pago-valido | 3 XLM → `GC6DTO…` | ✅ SUCCESS | [`87d6ec78…`](https://stellar.expert/explorer/testnet/tx/87d6ec782a036cf9f01abd819727827e48a86aa45cb159356a84058e544bd49b) |
