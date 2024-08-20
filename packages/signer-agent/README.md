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
const accounts = await signer.accounts();
const agent = await SignerAgent.create({
  signer,
  account: accounts[0].owner
});
```

The signerAgent can initiate a transaction with

```js
import {IcrcLedgerCanister} from "@dfinity/ledger-icrc";

const {transfer} = IcrcLedgerCanister.create({
  agent,
  canisterId: MY_LEDGER_CANISTER_ID,
});
const blockIndex = await transfer({
  to: TARGET_ACCOUNT,
  amount: 100_000_000
});
```