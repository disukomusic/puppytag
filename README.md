# 🐾 puppytag

- tag bluesky posts for organization and filtering
- vote on relevant tags to improve the quality of the tag database
- ouppy

## How to Install

You can download the latest production builds from the [Releases](../../releases) page.

### Chrome / Edge / Brave
1. Download the `chrome-mv3-prod.zip` file from the latest release.
2. Extract the downloaded `.zip` file into a folder on your computer.
3. Open your browser and go to the extensions page:
    - Chrome: `chrome://extensions/`
    - Edge: `edge://extensions/`
    - Brave: `brave://extensions/`
4. Turn on **Developer mode** (usually a toggle in the top right corner).
5. Click the **Load unpacked** button.
6. Select the folder you extracted in step 2.

### Firefox

**Option A: Temporary Install (Standard Firefox)**
1. Download the `firefox-mv3-prod.zip` file from the latest release. *(Do not extract it)*
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox` in your URL bar.
3. Click the **Load Temporary Add-on...** button.
4. Select the downloaded `firefox-mv3-prod.zip` file.
   *Note: Temporary add-ons in standard Firefox are removed when you restart the browser.*

**Option B: Permanent Install (Firefox Developer Edition / Nightly)**
If you are using Firefox Developer Edition or Nightly, you can disable signature checks to install it permanently:
1. Type `about:config` in your URL bar and accept the risk warning.
2. Search for `xpinstall.signatures.required` and double-click it to set it to **false**.
3. Type `about:addons` in your URL bar to open the Add-ons Manager.
4. Click the gear icon near the top right and select **Install Add-on From File...**
5. Select the downloaded `firefox-mv3-prod.zip` file.
6. 
---

## Development

First, run the development server:

```bash
pnpm dev
```

Open your browser and load the appropriate development build (e.g., `build/chrome-mv3-dev`).

## Making production build

To manually create production bundles for both browsers:

```bash
pnpm run package:chrome
pnpm run package:firefox
```

# AI USAGE
AI GENERATED CODE ("VIBECODING") WAS USED TO ASSIST THE CREATION OF THIS PROJECT!