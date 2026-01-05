# Nuweb Documentation

These docs are powered by Mintlify. We've added a few automations on top which are detailed below. To get started, make sure you run `npm install`.

1. Import release notes: `node generate-release-notes.js`

This will pull down all of our release notes from the public wiki document, parse and process them into MDX and update the mintlify `docs.json` file to set up the navigation. Release notes older than the previous full year will be added to an archive, grouped by year.

2. Import API documentation: `node generate-api-docs.js`

This will pull down our OpenAPI JSON files from all of our API docs (admin API, partner API, webhooks API - URLs are defined inside the `generate-api-docs.js` file), extract out the changelogs from the main body and publish to separate mintlify mdx files, and point the OpenAPI URLs to api.nuwebgroup.com (with the relevant path depending on which API it is).

NB: the script strips out the port off the URL in the final `openapi.json` file allowing us to point to the test/staging docs whilst compiling these docs for prod.

3. Build the documentation locally: `npx mint dev` or `mint dev` if you've installed the mint CLI globally.

There's some aliases to the above as well:

- `npm run gen` will run both generate commands (API docs and release notes)
- `npm run dev` will run both generate commands AND then build the documentation locally

The latter is only necessary if you aren't already running the local docs. After running any generation commands, commit the various `.mdx` and `openapi.json` files to the repo to publish the updates.

There's also a command to create missing pages based on the `docs.json` navigation config: `node scaffold-docs.js`