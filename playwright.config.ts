import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	timeout: 15000,
	use: {
		browserName: 'chromium',
		headless: true,
	},
	webServer: {
		command: 'npx serve . --listen 3456 --no-clipboard',
		port: 3456,
		reuseExistingServer: true,
	},
});
