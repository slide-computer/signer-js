> This package will be deprecated and replaced with `@slide-computer/signer-extension` once ICRC-94 is available.


# @slide-computer/signer-transport-plug

JavaScript and TypeScript library to communicate with Plug Wallet on the Internet Computer.

---

## Installation

Using Plug transport:

```
npm i --save @slide-computer/signer-transport-plug
```

## In the browser:

```
import { PlugTransport } from "@slide-computer/signer-transport-plug";
```

To create a Plug transport, run

```js
const transport = new PlugTransport();
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