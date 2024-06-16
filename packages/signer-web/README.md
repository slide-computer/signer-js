# @slide-computer/signer-web

JavaScript and TypeScript library to communicate with web signers on the Internet Computer.

---

## Installation

Using signer web:

```
npm i --save @slide-computer/signer-web
```

## In the browser:

```
import { PostMessageTransport } from "@slide-computer/signer-web";
```

To create an ICRC-29 post message transport, run

```js
const transport = new PostMessageTransport({
  openWindow: () => window.open(SIGNER_RPC_URL, SIGNER_WINDOW_NAME)
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
  // Process imcoming responses
})
// Send requests
channel.send(JSON_RPC_REQUEST);
```