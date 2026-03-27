import { type Page, expect, test } from '@playwright/test';

const BASE = 'http://localhost:3456/e2e/fixtures';

const setupPage = async (page: Page) => {
	await page.goto(`${BASE}/relying-party.html`);
};

const connectWeb = async (page: Page, context: any) => {
	await page.locator('#signer-url').evaluate(
		(el, url) => el.setAttribute('data-url', url),
		`${BASE}/auth-provider.html`,
	);
	await page.getByRole('button', { name: 'Connect Web' }).click();
	const signerPagePromise = context.waitForEvent('page');
	await page.getByRole('button', { name: 'Check Capabilities' }).click();
	const signerPage = await signerPagePromise;
	await signerPage.waitForLoadState();
	await expect(page.locator('#capabilities-output')).not.toBeEmpty();
};

const injectAuthExtension = (page: Page) =>
	page.evaluate(() => {
		window.addEventListener('icrc94:requestProvider', () => {
			window.dispatchEvent(
				new CustomEvent('icrc94:announceProvider', {
					detail: {
						uuid: 'e2e-auth-uuid',
						name: 'E2E Auth Provider',
						icon: 'data:image/svg+xml,test',
						rdns: 'com.test.auth',
						sendMessage: async (request: any) => {
							if (request.method === 'icrc25_supported_standards') {
								return {
									jsonrpc: '2.0',
									id: request.id,
									result: {
										supportedStandards: [
											{ name: 'ICRC-25', url: 'https://github.com/dfinity/wg-identity-authentication' },
											{ name: 'ICRC-34', url: 'https://github.com/dfinity/wg-identity-authentication' },
										],
									},
								};
							}
							return { jsonrpc: '2.0', id: request.id, error: { code: 2000, message: 'Not supported' } };
						},
						dismiss: async () => {},
					},
				}),
			);
		});
	});

const connectAuthExtension = async (page: Page, uuid: string) => {
	await injectAuthExtension(page);
	await page.locator('#extension-uuid').evaluate((el, uuid) => el.setAttribute('data-uuid', uuid), uuid);
	await page.getByRole('button', { name: 'Connect Extension' }).click();
	await expect(page.locator('#connect-extension-output')).toHaveText('"connected"', { useInnerText: true });
};

test.describe('Authentication provider', () => {
	test.describe('via web transport (ICRC-29)', () => {
		test('checks auth provider capabilities', async ({ page, context }) => {
			await setupPage(page);
			await connectWeb(page, context);
			const caps = JSON.parse(await page.locator('#capabilities-output').innerText());

			expect(caps.isAssetWallet).toBe(false);
			expect(caps.isAuthProvider).toBe(true);
			expect(caps.supportsFungibleTokens).toBe(false);
			expect(caps.standards).toContainEqual(expect.objectContaining({ name: 'ICRC-34' }));
			expect(caps.standards).not.toContainEqual(expect.objectContaining({ name: 'ICRC-27' }));
		});
	});

	test.describe('via extension transport (ICRC-94)', () => {
		test('checks auth provider capabilities', async ({ page }) => {
			await setupPage(page);
			await connectAuthExtension(page, 'e2e-auth-uuid');

			await page.getByRole('button', { name: 'Check Capabilities' }).click();
			const caps = JSON.parse(await page.locator('#capabilities-output').innerText());

			expect(caps.isAssetWallet).toBe(false);
			expect(caps.isAuthProvider).toBe(true);
			expect(caps.standards).toContainEqual(expect.objectContaining({ name: 'ICRC-34' }));
			expect(caps.standards).not.toContainEqual(expect.objectContaining({ name: 'ICRC-27' }));
		});
	});
});
