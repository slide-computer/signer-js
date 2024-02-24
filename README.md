# @slide-computer/signer

Initiate transactions and authenticate on the Internet Computer.

---

## Installation

Using Signer:

```
npm i --save @slide-computer/signer
```

## Signer

### In the browser:

```
import { Signer } from "@slide-computer/signer";
```

To get started with the signerAgent, run

```js
let signerWindow;
const transport = new PostMessageTransport({
  origin: SIGNER_ORIGIN,
  getWindow: () => {
    if (!signerWindow || signerWindow.closed) {
      signerWindow = window.open(`${SIGNER_ORIGIN}/rpc`, SIGNER_WINDOW_NAME);
    }
    signerWindow.focus();
    return signerWindow;
  }
});
const signer = new Signer({transport});
```

The signer can request permissions and use these permissions to get principals with

```js
const permissions = await signer.requestPermissions([createGetPrincipalsPermissionScope()]);
const principals = await signer.getPrincipals();
```

## SignerAgent

Initiate transactions with the signer using the ICRC-49 standard.

### In the browser:

```
import { SignerAgent } from "@slide-computer/signer";
```

To get started with the signerAgent, run

```js
const signerAgent = await SignerAgent.create({
  signer,
  getPrincipal: () => {
    return principals[0]; // For example, make calls as first principal
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

## SignerClient

Simple interface based on [@dfinity/auth-client](https://www.npmjs.com/package/@dfinity/auth-client) to get your web
application authenticated with the signer using the ICRC-57 standard.

### In the browser:

```
import { SignerClient } from "@slide-computer/signer";
```

To get started with the signerClient, run

```js
const signerClient = await SignerClient.create({signer});
```

The signerClient can log in with

```js
signerClient.login({
  // 7 days in nanoseconds
  maxTimeToLive: BigInt(7 * 24 * 60 * 60 * 1000 * 1000 * 1000),
  onSuccess: async () => {
    handleAuthenticated(signerClient);
  },
});
```
