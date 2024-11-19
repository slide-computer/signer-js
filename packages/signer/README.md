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

### Making canister calls

The `@slide-computer/signer-agent` package offers `SignerAgent` as drop in replacement of `HttpAgent`.

Besides making canister calls through signers that need to be approved by users, calls can also be made after requesting
a delegation from the signer with the `delegation()` method. This delegation can then be used to create
a `DelegationIdentity` which in turn can be used with the `HttpAgent`.

## List of available transports

Efforts are made to standardize the transports, for example ICRC-29 and ICRC-94. For wallets that do not implement a
standardized transport method, additional polyfill packages are available.

| Standardized packages              | Supported signers |
|------------------------------------|-------------------|
| `@slide-computer/signer-web`       | NFID, Oisy, Slide |
| `@slide-computer/signer-extension` | PrimeVault        |

| Polyfill packages                              | Supported signers |
|------------------------------------------------|-------------------|
| `@slide-computer/signer-transport-plug`        | Plug              |
| `@slide-computer/signer-transport-stoic`       | Stoic             |
| `@slide-computer/signer-transport-auth-client` | Internet Identity |