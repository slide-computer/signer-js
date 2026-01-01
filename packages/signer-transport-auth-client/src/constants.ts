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
    name: "ICRC-34",
    url: "https://github.com/dfinity/ICRC/blob/main/ICRCs/ICRC-34/ICRC-34.md",
  },
];

export const scopes: Array<{
  scope: PermissionScope;
  state: PermissionState;
}> = [
  {
    scope: {
      method: "icrc34_delegation",
    },
    state: "granted",
  },
];
