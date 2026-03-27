import { Principal } from '@icp-sdk/core/principal';
import { Signer } from '@icp-sdk/signer';
import { BrowserExtensionTransport } from '@icp-sdk/signer/extension';
import { PostMessageTransport } from '@icp-sdk/signer/web';

let activeSigner: Signer | undefined;

// Connect to web signer
document.getElementById('connect-web')!.addEventListener('click', () => {
	const url = document.getElementById('signer-url')!.getAttribute('data-url')!;
	const transport = new PostMessageTransport({
		url,
		establishTimeout: 5000,
		statusPollingRate: 50,
		detectNonClickEstablishment: false,
	});
	activeSigner = new Signer({ transport });
});

// Discover extensions
document.getElementById('discover-extensions')!.addEventListener('click', async () => {
	const providers = await BrowserExtensionTransport.discover({ discoveryDuration: 200 });
	document.getElementById('extensions-output')!.textContent = JSON.stringify(
		providers.map((p) => ({ uuid: p.uuid, name: p.name })),
	);
});

// Connect to extension
document.getElementById('connect-extension')!.addEventListener('click', async () => {
	const uuid = document.getElementById('extension-uuid')!.getAttribute('data-uuid')!;
	const transport = await BrowserExtensionTransport.findTransport({ uuid, discoveryDuration: 200 });
	activeSigner = new Signer({ transport });
	document.getElementById('connect-extension-output')!.textContent = JSON.stringify('connected');
});

// Check capabilities
document.getElementById('check-capabilities')!.addEventListener('click', async () => {
	const standards = await activeSigner!.getSupportedStandards();
	document.getElementById('capabilities-output')!.textContent = JSON.stringify({
		standards,
		isAssetWallet:
			standards.some((s) => s.name === 'ICRC-27') && standards.some((s) => s.name === 'ICRC-49'),
		isAuthProvider: standards.some((s) => s.name === 'ICRC-34'),
		supportsFungibleTokens: standards.some((s) => s.name === 'ICRC-1'),
	});
});

// Get accounts
document.getElementById('get-accounts')!.addEventListener('click', async () => {
	const accounts = await activeSigner!.getAccounts();
	document.getElementById('accounts-output')!.textContent = JSON.stringify(
		accounts.map((a) => ({
			owner: a.owner.toText(),
			subaccount: a.subaccount ? btoa(String.fromCharCode(...a.subaccount)) : undefined,
		})),
	);
});

// Request permissions
document.getElementById('request-permissions')!.addEventListener('click', async () => {
	const scopes = JSON.parse(
		document.getElementById('permission-scopes')!.getAttribute('data-scopes')!,
	);
	const result = await activeSigner!.requestPermissions(scopes);
	document.getElementById('permissions-output')!.textContent = JSON.stringify(result);
});

// Call canister
document.getElementById('call-canister')!.addEventListener('click', async () => {
	const params = JSON.parse(
		document.getElementById('call-params')!.getAttribute('data-params')!,
	);
	const result = await activeSigner!.callCanister({
		canisterId: Principal.fromText(params.canisterId),
		sender: Principal.fromText(params.sender),
		method: params.method,
		arg: new Uint8Array(
			atob(params.arg)
				.split('')
				.map((c) => c.charCodeAt(0)),
		),
	});
	document.getElementById('call-output')!.textContent = JSON.stringify({
		contentMap: btoa(String.fromCharCode(...result.contentMap)),
		certificate: btoa(String.fromCharCode(...result.certificate)),
	});
});
