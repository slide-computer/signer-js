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

const icpLedger = IcrcLedgerCanister.create({
    agent,
    canisterId: ICP_LEDGER_CANISTER_ID,
});
const blockIndex = await icpLedger.transfer({
    to: TARGET_ACCOUNT,
    amount: 100_000_000
});
```

The signerAgent can automatically batch calls with

```js
import {IcrcLedgerCanister} from "@dfinity/ledger-icrc";

const icpLedger = IcrcLedgerCanister.create({
    agent,
    canisterId: ICP_LEDGER_CANISTER_ID,
});
const ckBtcLedger = IcrcLedgerCanister.create({
    agent,
    canisterId: CK_BTC_LEDGER_CANISTER_ID,
});

// If a signer does not support batch calls, signerAgent will 
// automatically fallback to executing the calls one by one.
const [icpBlockIndex, ckBtcBlockIndex] = await Promise.all([
    icpLedger.approve({
        spender: TARGET_ACCOUNT,
        amount: 70_000_000
    }),
    ckBtcLedger.approve({
        spender: TARGET_ACCOUNT,
        amount: 1_000_000
    })
]);
```

For more advanced use cases, the signerAgent can also manually batch calls with

```js
import {IcrcLedgerCanister} from "@dfinity/ledger-icrc";

const icpLedger = IcrcLedgerCanister.create({
    agent,
    canisterId: ICP_LEDGER_CANISTER_ID,
});
const ckBtcLedger = IcrcLedgerCanister.create({
    agent,
    canisterId: CK_BTC_LEDGER_CANISTER_ID,
});

agent.batch(); // Below execution of calls needs to be triggered manually

const icpBlockIndexPromise = icpLedger.approve({
    spender: TARGET_ACCOUNT,
    amount: 70_000_000
});
const ckBtcBlockIndexPromise = ckBtcLedger.approve({
    spender: TARGET_ACCOUNT,
    amount: 1_000_000
});

agent.batch() // Indicate that below calls should be executed by the signer after the above

const swapResultPromise = backendActor.swapTokens(swapId);

// Trigger execution of all the above scheduled calls
// 
// If a signer does not support batch calls, signerAgent will 
// automatically fallback to executing the calls one by one.
await agent.execute();

// Get individual results
const icpBlockIndex = await icpBlockIndexPromise;
const ckBtcBlockIndex = await ckBtcBlockIndexPromise;
const swapResult = await swapResultPromise;
```


