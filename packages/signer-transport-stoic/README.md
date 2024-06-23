# @slide-computer/signer-transport-auth-client

JavaScript and TypeScript library to communicate with Stoic Wallet on the Internet Computer.

---

## Installation

Using Stoic transport:

```
npm i --save @slide-computer/signer-transport-stoic
```

## In the browser:

```
import { StoicTransport } from "@slide-computer/signer-transport-stoic";
```

To create a Stoic transport, run

```js
const transport = await StoicTransport.create();
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