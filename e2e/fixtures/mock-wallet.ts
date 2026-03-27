/**
 * Mock asset wallet signer page.
 * Supports: ICRC-25, ICRC-27, ICRC-49, ICRC-1
 */
import { HeartbeatServer } from '@icp-sdk/signer/web';

new HeartbeatServer({
	onEstablish: (origin, source) => {
		window.addEventListener('message', (event) => {
			if (event.origin !== origin || event.source !== source) return;
			const { id, method } = event.data || {};
			if (!id || !method) return;

			const respond = (result: unknown) =>
				(source as WindowProxy).postMessage({ jsonrpc: '2.0', id, result }, origin);
			const reject = (code: number, message: string) =>
				(source as WindowProxy).postMessage({ jsonrpc: '2.0', id, error: { code, message } }, origin);

			switch (method) {
				case 'icrc25_supported_standards':
					return respond({
						supportedStandards: [
							{ name: 'ICRC-25', url: 'https://github.com/dfinity/wg-identity-authentication' },
							{ name: 'ICRC-27', url: 'https://github.com/dfinity/wg-identity-authentication' },
							{ name: 'ICRC-49', url: 'https://github.com/dfinity/wg-identity-authentication' },
							{ name: 'ICRC-1', url: 'https://github.com/dfinity/ICRC-1' },
						],
					});
				case 'icrc25_permissions':
					return respond({
						scopes: [
							{ scope: { method: 'icrc27_accounts' }, state: 'granted' },
							{ scope: { method: 'icrc49_call_canister' }, state: 'ask_on_use' },
						],
					});
				case 'icrc25_request_permissions':
					return respond({
						scopes:
							event.data.params?.scopes?.map((s: { method: string }) => ({
								scope: s,
								state: 'granted',
							})) ?? [],
					});
				case 'icrc27_accounts':
					return respond({
						accounts: [
							{ owner: 'sgymv-uiaaa-aaaaa-aaaia-cai' },
							{
								owner: 'sgymv-uiaaa-aaaaa-aaaia-cai',
								subaccount: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE=',
							},
						],
					});
				case 'icrc49_call_canister': {
					// Echo back mock contentMap and certificate as base64.
					// A real signer would sign the call, submit it to the IC,
					// and return the CBOR content map + IC certificate.
					const params = event.data.params;
					return respond({
						contentMap: btoa(
							JSON.stringify({
								canisterId: params?.canisterId,
								sender: params?.sender,
								method: params?.method,
							}),
						),
						certificate: btoa('mock-certificate'),
					});
				}
				default:
					return reject(2000, `Method ${method} not supported`);
			}
		});
	},
	onEstablishTimeout: () => {},
	onDisconnect: () => {},
});
