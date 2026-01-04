const fs = require('fs');
const path = require('path');
const axios = require('axios');

// --- CONFIGURATION ---
const SHARE_ID = '5450e24b-d6cd-48c9-a315-a9037dba31f1';
const API_BASE_URL = 'https://wiki.nutickets.com/api';

// File Paths
const DOCS_JSON_PATH = 'docs.json'; 
const OUTPUT_DIR = 'releases';  // <--- Renamed directory
const MDX_PREFIX = 'releases';  // <--- Renamed prefix in docs.json

async function main() {
  console.log('🚀 Starting Smart Release Notes Generation...');

  try {
    // 1. Fetch Data
    const headers = { 
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/json'
    };

    console.log(`📡 Fetching shared tree...`);
    const shareRes = await axios.post(`${API_BASE_URL}/shares.info`, { id: SHARE_ID }, { headers });
    const releases = shareRes.data.data.sharedTree.children;

    if (!releases || releases.length === 0) return;

    let allUpdates = [];

    // 2. Iterate and Parse
    for (const doc of releases) {
        process.stdout.write(`.`); 
        try {
            const contentRes = await axios.post(`${API_BASE_URL}/documents.info`, {
                id: doc.id,
                shareId: SHARE_ID
            }, { headers });
            
            const docData = contentRes.data.data;
            allUpdates = [...allUpdates, ...parseReleaseDocument(doc.title, docData.text)];
        } catch (err) {
            // silent fail
        }
    }
    console.log('\n✅ Download complete.');

    // 3. Sort by Date
    allUpdates.sort((a, b) => b.dateObj - a.dateObj);

    // 4. Split Data
    const currentYear = new Date().getFullYear();
    const cutoffYear = currentYear - 1; 

    const mainUpdates = [];
    const archiveUpdatesByYear = {};

    allUpdates.forEach(update => {
        const updateYear = update.dateObj.getFullYear();
        if (isNaN(updateYear)) return;

        if (updateYear >= cutoffYear) {
            mainUpdates.push(update);
        } else {
            if (!archiveUpdatesByYear[updateYear]) archiveUpdatesByYear[updateYear] = [];
            archiveUpdatesByYear[updateYear].push(update);
        }
    });

    // 5. Generate Files
    if (!fs.existsSync(OUTPUT_DIR)){
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // A. Main Page (Index)
    generateMdxFile(
        mainUpdates, 
        path.join(OUTPUT_DIR, 'index.mdx'), 
        "Release Notes", 
        `Latest updates from ${cutoffYear} - ${currentYear}`
    );

    // B. Archives
    const archiveYears = Object.keys(archiveUpdatesByYear).sort((a, b) => b - a); 

    archiveYears.forEach(year => {
        generateMdxFile(
            archiveUpdatesByYear[year], 
            path.join(OUTPUT_DIR, `${year}.mdx`), 
            `${year} Archive`, 
            `Release history for ${year}`
        );
    });

    // 6. Update docs.json
    updateDocsJson(archiveYears);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// --- CONFIG UPDATER ---

function updateDocsJson(archiveYears) {
    if (!fs.existsSync(DOCS_JSON_PATH)) {
        console.warn(`⚠️ Could not find ${DOCS_JSON_PATH}.`);
        return;
    }

    const docsConfig = JSON.parse(fs.readFileSync(DOCS_JSON_PATH, 'utf8'));

    // Construct Page Structure
    const archivePages = archiveYears.map(year => `${MDX_PREFIX}/${year}`);
    
    const newPagesStructure = [
        `${MDX_PREFIX}/index` 
    ];

    if (archivePages.length > 0) {
        newPagesStructure.push({
            group: 'Archive',
            pages: archivePages
        });
    }

    console.log('🔄 Updating docs.json navigation...');

    let found = false;
    
    function scanAndReplace(items) {
        if (!items || !Array.isArray(items)) return;

        items.forEach(item => {
            if (item.groups) {
                scanAndReplace(item.groups);
            }
            // Group: "Product Updates"
            else if (item.group === 'Product Updates') {
                item.pages = newPagesStructure;
                found = true;
                console.log('✅ Found existing "Product Updates" group and updated it.');
            }
            else if (item.pages && Array.isArray(item.pages)) {
                const hasSubGroups = item.pages.some(p => typeof p === 'object');
                if (hasSubGroups) scanAndReplace(item.pages);
            }
        });
    }

    const nav = docsConfig.navigation;
    if (nav.tabs) scanAndReplace(nav.tabs);
    else if (Array.isArray(nav)) scanAndReplace(nav);

    if (!found) {
        console.log('➕ "Product Updates" group not found. Creating a new Tab...');
        
        // Tab: "Releases", Group: "Product Updates"
        const newTab = {
            tab: "Releases",
            groups: [
                {
                    group: "Product Updates", 
                    pages: newPagesStructure
                }
            ]
        };

        if (nav.tabs) {
            nav.tabs.push(newTab);
        } else if (Array.isArray(nav)) {
            nav.push({
                group: "Product Updates",
                pages: newPagesStructure
            });
        }
    }

    fs.writeFileSync(DOCS_JSON_PATH, JSON.stringify(docsConfig, null, 2));
    console.log(`✅ ${DOCS_JSON_PATH} updated successfully.`);
}

// --- HELPER FUNCTIONS ---

function parseReleaseDocument(title, markdown) {
    const updates = [];
    const titleRegex = /(R\d+):.*?-\s*(.*)/;
    const titleMatch = title.match(titleRegex);

    let releaseVersion = 'Unknown';
    let releaseDateStr = 'Unknown';
    let releaseDateObj = new Date(0);

    if (titleMatch) {
        releaseVersion = titleMatch[1];
        releaseDateStr = titleMatch[2].trim();
        releaseDateObj = parseDateString(releaseDateStr);
    }

    const splitParts = markdown.split(/##\s*.*Patch Notes/i);
    const mainContent = splitParts[0].trim();
    const patchContent = splitParts.length > 1 ? splitParts[1].trim() : '';

    if (mainContent) {
        updates.push({
            label: releaseDateStr,
            description: `Release ${releaseVersion}`,
            content: mainContent,
            dateObj: releaseDateObj
        });
    }

    if (patchContent) {
        const patchSections = patchContent.split(/(?=###\s)/); 
        patchSections.forEach(section => {
            const cleanSection = section.trim();
            if (!cleanSection.startsWith('###')) return;
            
            const headerEndIndex = cleanSection.indexOf('\n');
            if (headerEndIndex === -1) return;
            
            const header = cleanSection.substring(0, headerEndIndex).replace(/^###\s*/, '').trim();
            const body = cleanSection.substring(headerEndIndex).trim();
            const patchMatch = header.match(/(R\w+)\s*-\s*(.*)/);

            if (patchMatch) {
                updates.push({
                    label: patchMatch[2],
                    description: `Patch ${patchMatch[1]}`,
                    content: body,
                    dateObj: parseDateString(patchMatch[2])
                });
            }
        });
    }
    return updates;
}

function parseDateString(dateStr) {
    if (!dateStr) return new Date(0);
    return new Date(dateStr.replace(/(\d+)(st|nd|rd|th)/, '$1'));
}

function generateMdxFile(updates, filePath, title, description) {
    let mdxContent = `---
title: "${title}"
description: "${description}"
---\n\n`;

    updates.forEach(update => {
        let rawContent = update.content;

        // STEP A: SPLIT BY CODE BLOCKS
        const parts = rawContent.split(/(```[\s\S]*?```)/g);

        let processedContent = parts.map(part => {
            if (part.startsWith('```')) {
                return part;
            }

            let text = part;

            // 1. TRANSFORM HEADERS
            text = text
                .replace(/^#\s+(.*$)/gm, '\n#### $1')   
                .replace(/^##\s+(.*$)/gm, '\n#### $1')  
                .replace(/^###\s+(.*$)/gm, '\n**$1**'); 

            // 2. ESCAPE SPECIAL CHARS
            text = text.replace(/([^\\])([{}])/g, '$1\\$2');
            text = text.replace(/<(?!https?:|\/?(Note|Tip|Warning|Info|Success|Danger|Frame|img|br))/g, '\\<'); 

            // 3. CONVERT OUTLINE CALLOUTS
            text = text.replace(/:::(\w+)\s+([\s\S]*?):::/g, (match, type, content) => {
                let component = 'Note'; 
                const cleanText = content.trim();
                switch(type.toLowerCase()) {
                    case 'tip': case 'success': component = 'Tip'; break;
                    case 'warning': case 'danger': component = 'Warning'; break;
                    default: component = 'Note'; break;
                }
                return `\n<${component}>\n${cleanText}\n</${component}>\n`;
            });

            // 4. LINKIFY TICKETS
            text = text.replace(/\\?\[([A-Z]{2,}-\d+(?:\s*&\s*[A-Z]{2,}-\d+)*)\\?\]/g, (match, inner) => {
                const tickets = inner.split('&').map(t => t.trim());
                const links = tickets.map(ticket => `[${ticket}](https://linear.app/nuweb-group/issue/${ticket})`);
                return `[${links.join(' & ')}]`;
            });

            // 5. FORMAT IMAGES
            text = text.replace(/!\[(.*?)\]\(([^)\s"]+)(?:\s+"(.*?)")?\)/g, (match, alt, url, title) => {
                const safeUrl = url; 
                let candidateCaption = title || '';
                if (candidateCaption.trim().startsWith('=')) candidateCaption = ''; 
                if (!candidateCaption && alt) candidateCaption = alt;

                const safeAlt = alt ? alt.replace(/"/g, '&quot;') : '';
                const safeCaption = candidateCaption ? candidateCaption.replace(/"/g, '&quot;') : '';

                if (safeCaption) {
                    return `\n\n<Frame caption="${safeCaption}"><img src="${safeUrl}" alt="${safeAlt}" /></Frame>\n\n`;
                }
                return `\n\n<Frame><img src="${safeUrl}" alt="${safeAlt}" /></Frame>\n\n`;
            });

            // 6. FIX BACK-TO-BACK IMAGES
            text = text.replace(/<\/Frame>\s*<Frame/g, '</Frame>\n\n<br />\n\n<Frame');

            // 7. CLEANUP ARTIFACTS
            text = text.replace(/\\n/g, '\n');
            text = text.replace(/^\s*\\\s*$/gm, '');

            return text;
        }).join('');

        mdxContent += `
<Update label="${update.label}" description="${update.description}">

${processedContent}

</Update>
`;
    });

    fs.writeFileSync(filePath, mdxContent);
    console.log(`✅ Generated: ${filePath}`);
}

main();