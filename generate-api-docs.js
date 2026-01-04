const fs = require('fs');
const path = require('path');
const axios = require('axios');

// --- CONFIGURATION ---
// 1. Define your APIs here.
// 2. Run 'node generate-api-docs.js' to sync and build.
// 3. Update 'docs.json' to point to the LOCAL 'output' paths.
const APIS = [
  {
    name: 'Webhooks API',
    source: 'https://api.nuwebgroup.com:8443/webhooks/api-docs.json',
    output: 'webhook-reference/openapi.json'
  },
  {
    name: 'Admin API',
    source: 'https://api.nuwebgroup.com:8443/v1/api-docs.json',
    output: 'api-reference/openapi.json'
  },
  {
    name: 'Partner API',
    source: 'https://api.nuwebgroup.com:8443/v1/partner/api-docs.json',
    output: 'partner-api-reference/openapi.json'
  }
];

const INTRO_FILENAME = 'introduction.mdx';
const CHANGELOG_FILENAME = 'changelog.mdx';

async function main() {
  console.log('🚀 Starting API Sync & Build...');

  for (const api of APIS) {
    try {
      let specObject;

      // 1. FETCH & FIX SPEC
      if (api.source.startsWith('http')) {
        console.log(`\n☁️  Fetching ${api.name}...`);
        console.log(`    Source: ${api.source}`);
        
        const response = await axios.get(api.source, { timeout: 10000 });
        specObject = (typeof response.data === 'string') ? JSON.parse(response.data) : response.data;

        // FIX: Derive the base Server URL (remove filename AND port)
        // 1. Remove filename: "https://...:8443/webhooks/api-docs.json" -> "https://...:8443/webhooks"
        let derivedServerUrl = api.source.substring(0, api.source.lastIndexOf('/'));
        
        // 2. Remove port number (e.g. :8443)
        // Replaces the first occurrence of ":digits" found in the URL authority
        derivedServerUrl = derivedServerUrl.replace(/:\d+/, '');

        console.log(`    🔧 Fixed Server URL: ${derivedServerUrl}`);
        
        // Force the spec to use this clean base URL
        specObject.servers = [{ url: derivedServerUrl }];

      } else {
        // Handle local source files if needed
        console.log(`\n📂 Reading ${api.name}...`);
        const specContent = fs.readFileSync(api.source, 'utf8');
        specObject = JSON.parse(specContent);
      }

      // 2. SAVE LOCAL COPY (For Mintlify)
      const outputDir = path.dirname(api.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(api.output, JSON.stringify(specObject, null, 2));
      console.log(`    💾 Saved spec to: ${api.output}`);

      // 3. GENERATE MDX CONTENT
      processSpec(specObject, outputDir);

    } catch (error) {
      console.error(`❌ Failed to process ${api.name}:`);
      if (error.response) {
        console.error(`   Status: ${error.response.status} - ${error.response.statusText}`);
      } else {
        console.error(`   Error: ${error.message}`);
      }
    }
  }
  
  console.log('\n✨ Sync & Build complete.');
}

// --- CONTENT GENERATORS ---

function processSpec(spec, outputDir) {
  const title = spec.info?.title || 'API Reference';
  const fullDescription = spec.info?.description || '';

  // Split Description
  const splitRegex = /##\s?Changelog/i;
  const parts = fullDescription.split(splitRegex);

  const introText = parts[0].trim();
  const changelogRaw = parts.length > 1 ? parts[1].trim() : null;

  // Generate Introduction.mdx
  const introMdx = `---
title: "${title}"
description: "Overview of ${title}"
---

${introText || 'Welcome to the API documentation.'}
`;
  fs.writeFileSync(path.join(outputDir, INTRO_FILENAME), introMdx);

  // Generate Changelog.mdx
  if (changelogRaw) {
    const changelogMdx = generateChangelogMdx(changelogRaw);
    fs.writeFileSync(path.join(outputDir, CHANGELOG_FILENAME), changelogMdx);
    console.log(`    📝 Generated Intro & Changelog MDX`);
  } else {
    console.log(`    📝 Generated Intro MDX`);
  }
}

function generateChangelogMdx(rawText) {
  const sections = rawText.split('#### ');
  const preamble = sections[0].trim();
  let updatesHtml = '';

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    const firstNewLine = section.indexOf('\n');
    let dateLabel = '';
    let content = '';

    if (firstNewLine === -1) {
      dateLabel = section.trim();
    } else {
      dateLabel = section.substring(0, firstNewLine).trim();
      content = section.substring(firstNewLine).trim();
    }

    updatesHtml += `
<Update label="${dateLabel}" description="">

${content}

</Update>
`;
  }

  return `---
title: "Changelog"
description: "Latest updates and changes to the API"
---

${preamble}

${updatesHtml}
`;
}

main();