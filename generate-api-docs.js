const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { CHANGELOG_LINKS, buildCrossLinkCards } = require('./changelog-nav');

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
    output: 'api-reference/openapi.json',
    // Relocate this changelog alongside the release notes under /releases, split it
    // by year, and leave a placeholder behind in the API Reference tab.
    primaryChangelog: true,
    crossLinks: [CHANGELOG_LINKS.releases, CHANGELOG_LINKS.mobile]
  },
  {
    name: 'Partner API',
    source: 'https://api.nuwebgroup.com:8443/v1/partner/api-docs.json',
    output: '../mintlify-hub/partner-api-reference/openapi.json'
  }
];

const INTRO_FILENAME = 'introduction.mdx';
const CHANGELOG_FILENAME = 'changelog.mdx';
const RELEASES_DIR = 'releases';

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
      processSpec(specObject, outputDir, api);

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

function processSpec(spec, outputDir, api = {}) {
  const title = spec.info?.title || 'API Reference';
  const fullDescription = spec.info?.description || '';

  // Strip the repo prefix for link generation (links are relative to each site root)
  const siteRelativeDir = outputDir.replace(/^\.\.\/mintlify-hub\//, '');

  // 1. Build Map
  const endpointMap = buildEndpointMap(spec, siteRelativeDir);

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

  if (!changelogRaw) {
    console.log(`    📝 Generated Intro MDX`);
    return;
  }

  if (api.primaryChangelog) {
    // Relocated, year-split changelog that lives under /releases, leaving a placeholder
    // page behind in the API Reference tab (outputDir).
    generatePrimaryChangelog(changelogRaw, endpointMap, outputDir, api.crossLinks);
  } else {
    const changelogMdx = generateChangelogMdx(changelogRaw, endpointMap);
    fs.writeFileSync(path.join(outputDir, CHANGELOG_FILENAME), changelogMdx);
    console.log(`    📝 Generated Intro & Changelog MDX`);
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

function linkifyEndpoints(text, endpointMap) {
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
}

// Split a raw changelog description into its preamble and the dated entries that
// follow each "#### <date>" heading.
function parseChangelogEntries(rawText) {
  const sections = rawText.split('#### ');
  const preamble = sections[0].trim();
  const entries = [];

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    const firstNewLine = section.indexOf('\n');

    if (firstNewLine === -1) {
      entries.push({ dateLabel: section.trim(), content: '' });
    } else {
      entries.push({
        dateLabel: section.substring(0, firstNewLine).trim(),
        content: section.substring(firstNewLine).trim()
      });
    }
  }

  return { preamble, entries };
}

function renderChangelogUpdates(entries, endpointMap) {
  return entries.map(({ dateLabel, content }) => `
<Update label="${dateLabel}" description="">

${linkifyEndpoints(content, endpointMap)}

</Update>
`).join('');
}

// Derive the calendar year from a changelog date label (e.g. "27th April 2026").
// Falls back to the current year so any undated/odd entry stays on the main page.
function changelogYear(dateLabel, currentYear) {
  const year = new Date(String(dateLabel).replace(/(\d+)(st|nd|rd|th)/, '$1')).getFullYear();
  return Number.isNaN(year) ? currentYear : year;
}

function generateChangelogMdx(rawText, endpointMap) {
  const { preamble, entries } = parseChangelogEntries(rawText);

  return `---
title: "Changelog"
description: "Latest updates and changes to the API"
---

${preamble}

${renderChangelogUpdates(entries, endpointMap)}
`;
}

// Build the primary (Admin) API changelog the same way as the release notes: the
// current + previous calendar year on the main page (releases/api.mdx) with everything
// earlier split into per-year archives (releases/{year}-api.mdx). A placeholder page is
// left in the API Reference tab so its "Changelog" menu item still resolves.
function generatePrimaryChangelog(rawText, endpointMap, apiOutputDir, crossLinks) {
  const { preamble, entries } = parseChangelogEntries(rawText);

  const currentYear = new Date().getFullYear();
  const cutoffYear = currentYear - 1;

  const mainEntries = [];
  const archiveByYear = {};

  for (const entry of entries) {
    const year = changelogYear(entry.dateLabel, currentYear);
    if (year >= cutoffYear) {
      mainEntries.push(entry);
    } else {
      (archiveByYear[year] = archiveByYear[year] || []).push(entry);
    }
  }

  if (!fs.existsSync(RELEASES_DIR)) {
    fs.mkdirSync(RELEASES_DIR, { recursive: true });
  }

  // Main page → releases/api.mdx
  const mainMdx = `---
title: "API Changelog"
description: "Latest updates and changes to the API"
---

${buildCrossLinkCards(crossLinks)}

${preamble}

${renderChangelogUpdates(mainEntries, endpointMap)}
`;
  fs.writeFileSync(path.join(RELEASES_DIR, 'api.mdx'), mainMdx);

  // Per-year archives → releases/{year}-api.mdx
  const archiveYears = Object.keys(archiveByYear).map(Number).sort((a, b) => b - a);
  for (const year of archiveYears) {
    const archiveMdx = `---
title: "${year} API Updates"
description: "API changelog history for ${year}"
---

${renderChangelogUpdates(archiveByYear[year], endpointMap)}
`;
    fs.writeFileSync(path.join(RELEASES_DIR, `${year}-api.mdx`), archiveMdx);
  }

  // Placeholder in the API Reference tab → keeps the "Changelog" menu item and points
  // visitors to all three changelogs in their new shared home.
  const placeholderMdx = `---
title: "Changelog"
description: "Find our changelogs alongside the rest of our release notes"
---

Our API changelog now lives alongside the rest of our release notes.

${buildCrossLinkCards([CHANGELOG_LINKS.api, CHANGELOG_LINKS.releases, CHANGELOG_LINKS.mobile])}
`;
  fs.writeFileSync(path.join(apiOutputDir, CHANGELOG_FILENAME), placeholderMdx);

  console.log(`    📝 Generated API changelog → releases/api.mdx (+${archiveYears.length} archive year(s)) and placeholder in ${apiOutputDir}`);
}

function toKebabCase(str) {
  if (!str) return '';
  return str
    .match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
    .map(x => x.toLowerCase())
    .join('-');
}

main();
