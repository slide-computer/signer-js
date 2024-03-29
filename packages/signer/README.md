# @slide-computer/signer

JavaScript and TypeScript library to interact with signers on the Internet Computer.

---

## Installation

Using Signer:

```
npm i --save @slide-computer/signer
```

## In the browser:

```
import { Signer } from "@slide-computer/signer";
```

To get started with the signer, run

```js
let signerWindow;
const transport = new PostMessageTransport({
  origin: SIGNER_ORIGIN,
  getWindow: () => {
    if (!signerWindow || signerWindow.closed) {
      signerWindow = window.open(`${SIGNER_ORIGIN}/rpc`, SIGNER_WINDOW_NAME);
    } else {
      signerWindow.focus();
    }
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