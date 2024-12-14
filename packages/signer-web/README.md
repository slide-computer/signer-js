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
actionButton.onClick = async () => {
    // Must be established within a click handler
    // to avoid the signer popup from being blocked.
    const channel = await transport.establishChannel();
    const listener = channel.registerListener((response) => {
        // Process incoming responses
    });
    // Send outgoing requests
    channel.send(JSON_RPC_REQUEST);
}
```

### Channels must be established in a click handler

The following code will work fine without throwing an error:

```js
const transfer = async (amount) => {
    await icpActorSigner.transfer(targetAddress, amount);
}
transferButton.onClick = () => transfer(50000n);
```

But this code will throw an error:

```js
const transferFrom = async (amount) => {
    const allowance = await icpActorAnonymous.allowance(userAddress); // <- Issue
    if (allowance < amount) {
        await icpActorSigner.approve(amount - allowance);
    }
    await dappActor.transferWithAllowance(userAddress, amount);
}
swapButton.onClick = () => transferFrom(50000n);
```

In the second example, a function call with `await` has moved all the calls below outside the context of the click
handler.

In some browsers - particularly Safari - this means that the popup opened when the post message transport channel is
established will be **blocked**.

The post message transport's `detectNonClickEstablishment` option (default: true) detects this in all browsers and
throws an error to make sure this issue can be caught by a developer even if they're not using a browser that would have
blocked the popup.

There are multiple ways to fix this error:

1. Make the `await` function calls outside the click handler:
    ```js
    const allowance = await icpActorAnonymous.allowance(userAddress);
    const transferFrom = async (amount) => {
        if (allowance < amount) {
            await icpActorSigner.approve(amount - allowance);
        }
        await dappActor.transferWithAllowance(userAddress, amount);
    }
    swapButton.onClick = () => transferFrom(50000n);
    ```
2. Establish the transport channel first in your click handler:
    ```js
    const transferFrom = async (amount) => {
        await signer.openChannel(); // or: await agent.signer.openChannel();
        const allowance = await icpActorAnonymous.allowance(userAddress);
        if (allowance < amount) {
            await icpActorSigner.approve(amount - allowance);
        }
        await dappActor.transferWithAllowance(userAddress, amount);
    }
    swapButton.onClick = () => transferFrom(50000n);
    ```
3. Disable this error by setting `detectNonClickEstablishment` to `false`, be aware that this does not resolve the
   underlying issue of popups possibly being blocked in some browsers.
