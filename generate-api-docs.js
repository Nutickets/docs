const fs = require('fs');
const path = require('path');
const axios = require('axios');

// --- CONFIGURATION ---
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
        const response = await axios.get(api.source, { timeout: 10000 });
        specObject = (typeof response.data === 'string') ? JSON.parse(response.data) : response.data;

        let derivedServerUrl = api.source.substring(0, api.source.lastIndexOf('/'));
        derivedServerUrl = derivedServerUrl.replace(/:\d+/, '');
        specObject.servers = [{ url: derivedServerUrl }];

      } else {
        console.log(`\n📂 Reading ${api.name}...`);
        const specContent = fs.readFileSync(api.source, 'utf8');
        specObject = JSON.parse(specContent);
      }

      // 2. SANITIZE SPEC (Fix React Style Errors)
      specObject = sanitizeSpec(specObject);

      // 3. SAVE LOCAL COPY
      const outputDir = path.dirname(api.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(api.output, JSON.stringify(specObject, null, 2));
      console.log(`    💾 Saved spec to: ${api.output}`);

      // 4. GENERATE MDX CONTENT
      processSpec(specObject, outputDir);

    } catch (error) {
      console.error(`❌ Failed to process ${api.name}: ${error.message}`);
    }
  }
  
  console.log('\n✨ Sync & Build complete.');
}

// --- HELPER: SANITIZER ---
function sanitizeSpec(obj) {
  if (typeof obj === 'string') {
    return obj
      .replace(/style="[^"]*"/gi, '')
      .replace(/style='[^']*'/gi, '');
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeSpec(item));
  }
  if (obj !== null && typeof obj === 'object') {
    const newObj = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[key] = sanitizeSpec(obj[key]);
      }
    }
    return newObj;
  }
  return obj;
}

// --- CONTENT GENERATORS ---

function processSpec(spec, outputDir) {
  const title = spec.info?.title || 'API Reference';
  const fullDescription = spec.info?.description || '';

  // 1. Build Map
  const endpointMap = buildEndpointMap(spec, outputDir);

  // 2. Split Description
  const splitRegex = /##\s?Changelog/i;
  const parts = fullDescription.split(splitRegex);

  const introText = parts[0].trim();
  const changelogRaw = parts.length > 1 ? parts[1].trim() : null;

  // 3. Generate MDX
  const introMdx = `---
title: "${title}"
description: "Overview of ${title}"
---

${introText || 'Welcome to the API documentation.'}
`;
  fs.writeFileSync(path.join(outputDir, INTRO_FILENAME), introMdx);

  if (changelogRaw) {
    const changelogMdx = generateChangelogMdx(changelogRaw, endpointMap);
    fs.writeFileSync(path.join(outputDir, CHANGELOG_FILENAME), changelogMdx);
    console.log(`    📝 Generated Intro & Changelog MDX`);
  } else {
    console.log(`    📝 Generated Intro MDX`);
  }
}

function buildEndpointMap(spec, outputDir) {
  const map = new Map();
  const baseUrlPath = '/' + outputDir.replace(/\\/g, '/').replace(/^\.\//, '');

  if (!spec.paths) return map;

  Object.keys(spec.paths).forEach(pathKey => {
    const methods = spec.paths[pathKey];
    Object.keys(methods).forEach(method => {
      const operation = methods[method];
      const methodUpper = method.toUpperCase();
      const lookupKey = `${methodUpper} ${pathKey}`; 
      
      // 1. Determine Tag (Subfolder)
      let tagSlug = '';
      if (operation.tags && operation.tags.length > 0) {
        tagSlug = toKebabCase(operation.tags[0]);
      }

      // 2. Determine Slug (SUMMARY ONLY)
      let opSlug = '';
      
      if (operation.summary) {
        // Priority 1: Use Summary (e.g. "Retrieve Wallet Transactions" -> "retrieve-wallet-transactions")
        opSlug = toKebabCase(operation.summary);
      } else {
        // Priority 2: Fallback to Method + Path (e.g. "get-wallets-transactions")
        const cleanPath = pathKey.replace(/[\/{}]/g, '-').replace(/^-|-$/g, '');
        opSlug = `${method.toLowerCase()}-${cleanPath}`;
      }

      // 3. Construct Link
      let link = baseUrlPath;
      if (tagSlug) link += `/${tagSlug}`;
      link += `/${opSlug}`;

      map.set(lookupKey, link);
    });
  });
  
  return map;
}

function generateChangelogMdx(rawText, endpointMap) {
  const sections = rawText.split('#### ');
  const preamble = sections[0].trim();
  let updatesHtml = '';

  const linkifyEndpoints = (text) => {
    const regex = /(`?)\b(GET|POST|PUT|DELETE|PATCH)\s+(\/[a-zA-Z0-9\/_{}-]+)\1/g;

    return text.replace(regex, (fullMatch, backtick, method, path) => {
      let link = null;

      // ATTEMPT 1: Exact Match
      if (endpointMap.has(`${method} ${path}`)) {
        link = endpointMap.get(`${method} ${path}`);
      }
      
      // ATTEMPT 2: Strip Version Prefix
      if (!link && path.startsWith('/v')) {
        const cleanPath = path.replace(/^\/v\d+/, '');
        if (endpointMap.has(`${method} ${cleanPath}`)) {
           link = endpointMap.get(`${method} ${cleanPath}`);
        }
      }

      // ATTEMPT 3: Append Common IDs
      if (!link) {
        const potentialIds = ['/{id}', '/{uuid}', '/{orderId}', '/{customerId}'];
        for (const suffix of potentialIds) {
           if (endpointMap.has(`${method} ${path}${suffix}`)) {
              link = endpointMap.get(`${method} ${path}${suffix}`);
              break;
           }
           const cleanPath = path.replace(/^\/v\d+/, '');
           if (endpointMap.has(`${method} ${cleanPath}${suffix}`)) {
              link = endpointMap.get(`${method} ${cleanPath}${suffix}`);
              break;
           }
        }
      }

      if (link) {
        return `[${method} ${path}](${link})`;
      }
      return fullMatch;
    });
  };

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

    const linkedContent = linkifyEndpoints(content);

    updatesHtml += `
<Update label="${dateLabel}" description="">

${linkedContent}

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

function toKebabCase(str) {
  if (!str) return '';
  return str
    .match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
    .map(x => x.toLowerCase())
    .join('-');
}

main();