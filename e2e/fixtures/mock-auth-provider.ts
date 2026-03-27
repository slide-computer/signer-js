/**
 * Mock authentication provider signer page.
 * Supports: ICRC-25, ICRC-34 (delegation only, no accounts or canister calls)
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
							{ name: 'ICRC-34', url: 'https://github.com/dfinity/wg-identity-authentication' },
						],
					});
				case 'icrc25_permissions':
					return respond({
						scopes: [{ scope: { method: 'icrc34_delegation' }, state: 'granted' }],
					});
				default:
					return reject(2000, `Method ${method} not supported`);
			}
		});
	},
	onEstablishTimeout: () => {},
	onDisconnect: () => {},
});
