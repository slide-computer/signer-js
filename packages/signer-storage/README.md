# @slide-computer/signer-storage

Storage implementation for signer library on the Internet Computer.

---

## Installation

Using SignerStorage:

```
npm i --save @slide-computer/signer-storage
```

## Note

Supports storing both `ECDSAKeyIdentity` and `Ed25519KeyIdentity`. The `ECDSAKeyIdentity` is highly recommended over
the `Ed25519KeyIdentity` due to insecure plain text storage of the latter. Additionally, this library also supports
storing a `DelegationChain`.

There are two storage implementations `IdbStorage` and legacy `LocalStorage`, the `ECDSAKeyIdentity` can only be stored
in `IdbStorage` implementation.