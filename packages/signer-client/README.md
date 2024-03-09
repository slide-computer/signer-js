# @slide-computer/signer-client

Authenticate with signers on the Internet Computer.

---

## Installation

Using SignerClient:

```
npm i --save @slide-computer/signer
```

## In the browser:

```
import { SignerClient } from "@slide-computer/signer-client";
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
