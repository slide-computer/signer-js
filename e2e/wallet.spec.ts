import { type Page, expect, test } from '@playwright/test';

const BASE = 'http://localhost:3456/e2e/fixtures';

const setupPage = async (page: Page) => {
	await page.goto(`${BASE}/relying-party.html`);
};

const connectWeb = async (page: Page, context: any) => {
	await page.locator('#signer-url').evaluate((el, url) => el.setAttribute('data-url', url), `${BASE}/wallet.html`);
	await page.getByRole('button', { name: 'Connect Web' }).click();
	// The popup opens when the first RPC call triggers openChannel()
	// so we click Check Capabilities and wait for the popup to appear
	const signerPagePromise = context.waitForEvent('page');
	await page.getByRole('button', { name: 'Check Capabilities' }).click();
	const signerPage = await signerPagePromise;
	await signerPage.waitForLoadState();
	await expect(page.locator('#capabilities-output')).not.toBeEmpty();
};

const injectWalletExtension = (page: Page) =>
	page.evaluate(() => {
		window.addEventListener('icrc94:requestProvider', () => {
			window.dispatchEvent(
				new CustomEvent('icrc94:announceProvider', {
					detail: {
						uuid: 'e2e-wallet-uuid',
						name: 'E2E Wallet',
						icon: 'data:image/svg+xml,test',
						rdns: 'com.test.e2e',
						sendMessage: async (request: any) => {
							const respond = (result: any) => ({ jsonrpc: '2.0', id: request.id, result });
							switch (request.method) {
								case 'icrc25_supported_standards':
									return respond({
										supportedStandards: [
											{ name: 'ICRC-25', url: 'https://github.com/dfinity/wg-identity-authentication' },
											{ name: 'ICRC-27', url: 'https://github.com/dfinity/wg-identity-authentication' },
											{ name: 'ICRC-49', url: 'https://github.com/dfinity/wg-identity-authentication' },
											{ name: 'ICRC-1', url: 'https://github.com/dfinity/ICRC-1' },
										],
									});
								case 'icrc25_request_permissions':
									return respond({
										scopes: request.params?.scopes?.map((s: any) => ({ scope: s, state: 'granted' })) ?? [],
									});
								case 'icrc27_accounts':
									return respond({
										accounts: [
											{ owner: 'sgymv-uiaaa-aaaaa-aaaia-cai' },
											{ owner: 'sgymv-uiaaa-aaaaa-aaaia-cai', subaccount: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE=' },
										],
									});
								case 'icrc49_call_canister':
									return respond({
										contentMap: btoa(JSON.stringify({
											canisterId: request.params?.canisterId,
											sender: request.params?.sender,
											method: request.params?.method,
										})),
										certificate: btoa('mock-certificate'),
									});
								default:
									return { jsonrpc: '2.0', id: request.id, error: { code: 2000, message: 'Not supported' } };
							}
						},
						dismiss: async () => {},
					},
				}),
			);
		});
	});

const connectExtension = async (page: Page, uuid: string) => {
	await injectWalletExtension(page);
	await page.locator('#extension-uuid').evaluate((el, uuid) => el.setAttribute('data-uuid', uuid), uuid);
	await page.getByRole('button', { name: 'Connect Extension' }).click();
	await expect(page.locator('#connect-extension-output')).toHaveText('"connected"', { useInnerText: true });
};

test.describe('Asset wallet', () => {
	test.describe('via web transport (ICRC-29)', () => {
		test('checks wallet capabilities', async ({ page, context }) => {
			await setupPage(page);
			await connectWeb(page, context);
			// connectWeb already clicks Check Capabilities to trigger the popup
			const caps = JSON.parse(await page.locator('#capabilities-output').innerText());

			expect(caps.isAssetWallet).toBe(true);
			expect(caps.isAuthProvider).toBe(false);
			expect(caps.supportsFungibleTokens).toBe(true);
		});

		test('gets accounts', async ({ page, context }) => {
			await setupPage(page);
			await connectWeb(page, context);

			await page.getByRole('button', { name: 'Get Accounts' }).click();
			await expect(page.locator('#accounts-output')).not.toBeEmpty();
			const accounts = JSON.parse(await page.locator('#accounts-output').innerText());

			expect(accounts).toHaveLength(2);
			expect(accounts[0].owner).toBeDefined();
			expect(accounts[1].subaccount).toBeDefined();
		});

		test('requests permissions', async ({ page, context }) => {
			await setupPage(page);
			await connectWeb(page, context);

			await page.locator('#permission-scopes').evaluate(
				(el, scopes) => el.setAttribute('data-scopes', JSON.stringify(scopes)),
				[{ method: 'icrc27_accounts' }, { method: 'icrc49_call_canister' }],
			);
			await page.getByRole('button', { name: 'Request Permissions' }).click();
			await expect(page.locator('#permissions-output')).not.toBeEmpty();
			const permissions = JSON.parse(await page.locator('#permissions-output').innerText());

			expect(permissions).toHaveLength(2);
			expect(permissions[0].state).toBe('granted');
		});

		test('calls a canister', async ({ page, context }) => {
			await setupPage(page);
			await connectWeb(page, context);

			await page.locator('#call-params').evaluate(
				(el, params) => el.setAttribute('data-params', JSON.stringify(params)),
				{
					canisterId: 'ryjl3-tyaaa-aaaaa-aaaba-cai',
					sender: 'sgymv-uiaaa-aaaaa-aaaia-cai',
					method: 'icrc1_transfer',
					arg: btoa('mock-arg'),
				},
			);
			await page.getByRole('button', { name: 'Call Canister' }).click();
			await expect(page.locator('#call-output')).not.toBeEmpty();
			const result = JSON.parse(await page.locator('#call-output').innerText());

			expect(result.contentMap).toBeDefined();
			expect(result.certificate).toBeDefined();
			const contentMap = JSON.parse(atob(result.contentMap));
			expect(contentMap.canisterId).toBe('ryjl3-tyaaa-aaaaa-aaaba-cai');
			expect(contentMap.method).toBe('icrc1_transfer');
		});
	});

	test.describe('via extension transport (ICRC-94)', () => {
		test('discovers installed extensions', async ({ page }) => {
			await setupPage(page);
			await injectWalletExtension(page);

			await page.getByRole('button', { name: 'Discover Extensions' }).click();
			await expect(page.locator('#extensions-output')).not.toBeEmpty();
			const providers = JSON.parse(await page.locator('#extensions-output').innerText());

			expect(providers).toEqual([{ uuid: 'e2e-wallet-uuid', name: 'E2E Wallet' }]);
		});

		test('checks wallet capabilities', async ({ page }) => {
			await setupPage(page);
			await connectExtension(page, 'e2e-wallet-uuid');

			await page.getByRole('button', { name: 'Check Capabilities' }).click();
			await expect(page.locator('#capabilities-output')).not.toBeEmpty();
			const caps = JSON.parse(await page.locator('#capabilities-output').innerText());

			expect(caps.isAssetWallet).toBe(true);
			expect(caps.isAuthProvider).toBe(false);
		});

		test('gets accounts', async ({ page }) => {
			await setupPage(page);
			await connectExtension(page, 'e2e-wallet-uuid');

			await page.getByRole('button', { name: 'Get Accounts' }).click();
			await expect(page.locator('#accounts-output')).not.toBeEmpty();
			const accounts = JSON.parse(await page.locator('#accounts-output').innerText());

			expect(accounts).toHaveLength(2);
			expect(accounts[0].owner).toBeDefined();
		});

		test('calls a canister', async ({ page }) => {
			await setupPage(page);
			await connectExtension(page, 'e2e-wallet-uuid');

			await page.locator('#call-params').evaluate(
				(el, params) => el.setAttribute('data-params', JSON.stringify(params)),
				{
					canisterId: 'ryjl3-tyaaa-aaaaa-aaaba-cai',
					sender: 'sgymv-uiaaa-aaaaa-aaaia-cai',
					method: 'icrc1_transfer',
					arg: btoa('mock-arg'),
				},
			);
			await page.getByRole('button', { name: 'Call Canister' }).click();
			await expect(page.locator('#call-output')).not.toBeEmpty();
			const result = JSON.parse(await page.locator('#call-output').innerText());

			const contentMap = JSON.parse(atob(result.contentMap));
			expect(contentMap.canisterId).toBe('ryjl3-tyaaa-aaaaa-aaaba-cai');
			expect(contentMap.method).toBe('icrc1_transfer');
		});
	});
});
