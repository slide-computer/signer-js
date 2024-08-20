# @slide-computer/signer-transport-auth-client

JavaScript and TypeScript library to communicate with Internet Identity on the Internet Computer.

---

## Installation

Using AuthClientTransport:

```
npm i --save @slide-computer/signer-transport-auth-client
```

## In the browser:

```
import { AuthClientTransport } from "@slide-computer/signer-transport-auth-client";
```

To create an AuthClient transport, run

```js
const transport = await AuthClientTransport.create();
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
