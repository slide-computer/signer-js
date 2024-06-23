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
// Create transport with e.g. "@slide-computer/signer-web"
const signer = new Signer({transport});
```

Make sure to connect before using signer if the transport requires a connection

```js
if (transport.connection && !transport.connection.connected) {
  await transport.connection.connect();
}
```

The signer can for example get accounts with

```js
const accounts = await signer.accounts();
```

Optionally, the permission can be requested beforehand to get accounts

```js
const permissions = await signer.requestPermissions([createAccountsPermissionScope()]);
```