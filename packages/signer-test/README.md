# @slide-computer/signer-test

JavaScript and TypeScript library for signer tests on the Internet Computer.

---

## Installation

Using Agent transport:

```
npm i --save @slide-computer/signer-test
```

## In the browser:

```
import { AgentTransport } from "@slide-computer/signer-test";
```

To create an Agent transport, run

```js
const transport = await AgentTransport.create();
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