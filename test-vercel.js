import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  let found = false;
  for (let i = 0; i < 15; i++) {
    console.log(`Navigating to https://rts-seven.vercel.app/ (Attempt ${i+1})`);
    await page.goto('https://rts-seven.vercel.app/', { waitUntil: 'networkidle' });

    // Wait to see if the new home profile button is present
    const profileBtn = page.locator('#home-btn-profile');
    try {
      await profileBtn.waitFor({ state: 'attached', timeout: 3000 });
      found = true;
      console.log("✅ Success! The new Vercel deployment is live (found #home-btn-profile).");
      
      // Click the profile button
      await profileBtn.click();
      console.log("Clicked Profile Button.");

      // Wait for the modal
      const modal = page.locator('#profile-modal');
      await modal.waitFor({ state: 'visible', timeout: 5000 });
      console.log("✅ Modal is visible.");

      // Click Login with empty credentials to trigger error
      await page.locator('#btn-auth-login').click();
      const errorMsg = page.locator('#auth-error');
      await errorMsg.waitFor({ state: 'visible', timeout: 2000 });
      const text = await errorMsg.textContent();
      console.log("✅ Caught Expected Validation Error: " + text);
      break;

    } catch (err) {
      console.log("Not found yet, waiting 5 seconds...");
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  if (!found) {
    console.error("❌ Test Failed. The deployment didn't go through or Vercel is failing to build.");
  }

  await browser.close();
})();
