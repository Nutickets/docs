const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
const DOCS_CONFIG_PATH = 'docs.json';

// The template for new files
const getTemplate = (title) => `---
title: "${title}"
description: "Documentation for ${title}"
---

<Warning>
**Work in Progress**

This page is currently a placeholder. The content for **${title}** has not been written yet.
</Warning>

## Overview

Coming soon.
`;

async function main() {
  console.log('🏗️  Starting Docs Scaffolder...');

  if (!fs.existsSync(DOCS_CONFIG_PATH)) {
    console.error(`❌ Could not find ${DOCS_CONFIG_PATH}`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(DOCS_CONFIG_PATH, 'utf8'));
  const pages = new Set();

  // 1. Recursive function to collect all page paths
  function collectPages(items) {
    if (!items) return;
    const entries = Array.isArray(items) ? items : [items];

    entries.forEach(entry => {
      // If it's a string, it's a page path
      if (typeof entry === 'string') {
        pages.add(entry);
      }
      // If it's an object with a 'page' property (less common but possible)
      else if (typeof entry === 'object' && entry.page) {
        pages.add(entry.page);
      }
      
      // Recurse into common Mintlify grouping structures
      if (entry.pages) collectPages(entry.pages);
      if (entry.groups) collectPages(entry.groups);
      if (entry.tabs) collectPages(entry.tabs);
    });
  }

  // Handle both array-style and tab-style navigation
  if (config.navigation) {
    collectPages(config.navigation);
  }

  console.log(`🔍 Found ${pages.size} pages in configuration.`);

  // 2. Process each page
  let createdCount = 0;
  
  pages.forEach(pagePath => {
    // Mintlify pages often lack extensions in config, defaulting to .mdx
    const filePath = pagePath.endsWith('.mdx') ? pagePath : `${pagePath}.mdx`;
    const fullPath = path.join(__dirname, filePath);
    const dirName = path.dirname(fullPath);

    // Skip external links (starting with http)
    if (pagePath.startsWith('http')) return;

    if (!fs.existsSync(fullPath)) {
      // A. Create Directory if missing
      if (!fs.existsSync(dirName)) {
        fs.mkdirSync(dirName, { recursive: true });
      }

      // B. Generate Title from Filename
      // e.g. "api-reference/get-user" -> "Get User"
      const basename = path.basename(filePath, '.mdx');
      const prettyTitle = basename
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      // C. Write File
      fs.writeFileSync(fullPath, getTemplate(prettyTitle));
      console.log(`   ✅ Created missing page: ${filePath}`);
      createdCount++;
    }
  });

  if (createdCount === 0) {
    console.log('✨ All pages already exist. No changes made.');
  } else {
    console.log(`\n🎉 Created ${createdCount} missing pages.`);
  }
}

main();