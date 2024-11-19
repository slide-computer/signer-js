# @slide-computer/signer-extension

JavaScript and TypeScript library to communicate with browser extension signers on the Internet Computer.

---

## Installation

Using signer extension:

```
npm i --save @slide-computer/signer-extension
```

## In the browser:

```
import { BrowserExtensionTransport } from "@slide-computer/signer-extension";
```

To create an ICRC-94 browser extension transport, run

```js
const transport = await BrowserExtensionTransport.findTransport({
    // Globally unique identifier of the browser extension wallet you want to connect with
    uuid: 'b5ec333c-8854-47bd-be77-74059e0c64d6'
});
```

Either use with `@slide-computer/signer`

```js
const signer = new Signer({transport});
```

Or directly in your custom implementation

```js
const channel = await transport.establishChannel();
const listener = channel.registerListener((response) => {
    // Process incoming responses
});
// Send outgoing requests
channel.send(JSON_RPC_REQUEST);
```

To discover all available installed browser extension signers for a user to choose from, run

```js
const providerDetails = await BrowserExtensionTransport.discover();
const providerDetail = await askUserToChoose(providerDetails);
const transport = new BrowserExtensionTransport({providerDetail});
```