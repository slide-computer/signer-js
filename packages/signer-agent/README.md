# @slide-computer/signer-agent

Initiate transactions with signers on the Internet Computer.

---

## Installation

Using SignerAgent:

```
npm i --save @slide-computer/signer-agent
```

## In the browser:

```
import { SignerAgent } from "@slide-computer/signer-agent";
```

To get started with the signerAgent, run

```js
const signerAgent = new SignerAgent({
  signer,
  getPrincipal: () => {
    return accounts[0].owner; // For example, make calls as first principal
  }
});
```

The signerAgent can initiate a transaction with

```js
const {transfer} = IcrcLedgerCanister.create({
  agent: signerAgent,
  canisterId: MY_LEDGER_CANISTER_ID,
});
const blockIndex = await transfer({
  to: account,
  amount: 100_000_000
});
```