import type {
  PermissionScope,
  PermissionState,
  SupportedStandard,
} from "@slide-computer/signer";

export const supportedStandards: SupportedStandard[] = [
  {
    name: "ICRC-25",
    url: "https://github.com/dfinity/ICRC/blob/main/ICRCs/ICRC-25/ICRC-25.md",
  },
  {
    name: "ICRC-27",
    url: "https://github.com/dfinity/ICRC/blob/main/ICRCs/ICRC-27/ICRC-27.md",
  },
  {
    name: "ICRC-34",
    url: "https://github.com/dfinity/ICRC/blob/main/ICRCs/ICRC-34/ICRC-34.md",
  },
  {
    name: "ICRC-49",
    url: "https://github.com/dfinity/ICRC/blob/main/ICRCs/ICRC-49/ICRC-49.md",
  },
];

export const scopes: Array<{
  scope: PermissionScope;
  state: PermissionState;
}> = [
  {
    scope: {
      method: "icrc27_accounts",
    },
    state: "granted",
  },
  {
    scope: {
      method: "icrc34_delegation",
    },
    state: "granted",
  },
  {
    scope: {
      method: "icrc49_call_canister",
    },
    state: "granted",
  },
];
