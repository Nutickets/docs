require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const sharp = require('sharp'); // <--- New Dependency for compression

// --- CONFIGURATION ---
const TINYPNG_API_KEY = process.env.TINYPNG_API_KEY;
const SHARE_ID = '5450e24b-d6cd-48c9-a315-a9037dba31f1';
const API_BASE_URL = 'https://wiki.nutickets.com/api';

// File Paths
const DOCS_JSON_PATH = 'docs.json';
const OUTPUT_DIR = 'releases';
const MDX_PREFIX = 'releases';
const IMAGES_DIR = 'images/releases';

// Track newly downloaded images this run (for TinyPNG pass)
const newlyDownloadedImages = new Set();

async function main() {
  console.log('🚀 Starting Smart Release Notes Generation (Compressed)...');

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
    console.log('\n✅ Download complete. Processing images and content...');

    // 3. Sort by Date
    allUpdates.sort((a, b) => b.dateObj - a.dateObj);

    // 4. Split into web/mobile and current/archive
    const currentYear = new Date().getFullYear();
    const cutoffYear = currentYear - 1;

    const webMain = [];
    const mobileMain = [];
    const webArchiveByYear = {};
    const mobileArchiveByYear = {};

    allUpdates.forEach(update => {
        const updateYear = update.dateObj.getFullYear();
        if (isNaN(updateYear)) return;

        const isCurrent = updateYear >= cutoffYear;

        // Web content (always present)
        if (update.content) {
            if (isCurrent) {
                webMain.push(update);
            } else {
                if (!webArchiveByYear[updateYear]) webArchiveByYear[updateYear] = [];
                webArchiveByYear[updateYear].push(update);
            }
        }

        // Mobile content (only for releases that have it)
        if (update.mobileContent) {
            const mobileUpdate = {
                label: update.label,
                description: update.description,
                content: update.mobileContent,
                dateObj: update.dateObj
            };
            if (isCurrent) {
                mobileMain.push(mobileUpdate);
            } else {
                if (!mobileArchiveByYear[updateYear]) mobileArchiveByYear[updateYear] = [];
                mobileArchiveByYear[updateYear].push(mobileUpdate);
            }
        }
    });

    // 5. Ensure Directories Exist
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

    // 6. Generate Files

    // A. Web Release Notes (Index)
    await generateMdxFile(
        webMain,
        path.join(OUTPUT_DIR, 'index.mdx'),
        "Release Notes",
        `Latest product updates from ${cutoffYear}/${currentYear}`
    );

    // B. Mobile App Updates
    await generateMdxFile(
        mobileMain,
        path.join(OUTPUT_DIR, 'mobile.mdx'),
        "Mobile App Updates",
        `Latest mobile app updates from ${cutoffYear}/${currentYear}`
    );

    // C. Web Archives
    const webArchiveYears = Object.keys(webArchiveByYear).sort((a, b) => b - a);

    for (const year of webArchiveYears) {
        await generateMdxFile(
            webArchiveByYear[year],
            path.join(OUTPUT_DIR, `${year}.mdx`),
            `${year} Updates`,
            `Release history for ${year}`
        );
    }

    // D. Mobile Archives
    const mobileArchiveYears = Object.keys(mobileArchiveByYear).sort((a, b) => b - a);

    for (const year of mobileArchiveYears) {
        await generateMdxFile(
            mobileArchiveByYear[year],
            path.join(OUTPUT_DIR, `${year}-mobile.mdx`),
            `${year} Mobile Updates`,
            `Mobile app release history for ${year}`
        );
    }

    // 7. Update docs.json
    updateDocsJson(webArchiveYears, mobileArchiveYears);

    // 8. TinyPNG compression (bonus - non-blocking)
    await tinypngCompressAll();

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// --- IMAGE DOWNLOADER (WITH COMPRESSION) ---

async function downloadImage(url) {
    try {
        const urlObj = new URL(url);

        // Hash ONLY the pathname to allow permanent caching (ignores query params/signatures)
        const hash = crypto.createHash('md5').update(urlObj.pathname).digest('hex');

        let ext = path.extname(urlObj.pathname).toLowerCase();
        if (!ext || ext.length > 5) ext = '.png';

        const filename = `${hash}${ext}`;
        const localPath = path.join(IMAGES_DIR, filename);
        const publicPath = `/${IMAGES_DIR}/${filename}`;

        // CACHE CHECK: If file exists, skip download
        if (fs.existsSync(localPath)) {
            return publicPath;
        }

        // Fetch image as a buffer
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'arraybuffer'
        });

        // COMPRESSION LOGIC
        const imagePipeline = sharp(response.data);
        const metadata = await imagePipeline.metadata();

        if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
            // MozJPEG provides excellent compression with virtually no visual loss
            await imagePipeline
                .jpeg({ mozjpeg: true, quality: 90 })
                .toFile(localPath);
        }
        else if (metadata.format === 'png') {
            // Maximum compression level (9) + adaptive filtering for lossless optimization
            await imagePipeline
                .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
                .toFile(localPath);
        }
        else {
            // Fallback for GIFs/WebP: just save the buffer directly
            fs.writeFileSync(localPath, response.data);
        }

        newlyDownloadedImages.add(localPath);
        return publicPath;

    } catch (e) {
        console.warn(`⚠️ Failed to download/compress image: ${url}. Keeping remote link.`);
        return url;
    }
}

// --- TINYPNG COMPRESSION (BONUS LAYER) ---

async function tinypngCompressAll() {
    if (!TINYPNG_API_KEY) {
        console.log('⏭️  TinyPNG: No API key found (TINYPNG_API_KEY). Skipping.');
        return;
    }

    if (newlyDownloadedImages.size === 0) {
        console.log('⏭️  TinyPNG: No new images to compress. Skipping.');
        return;
    }

    const files = [...newlyDownloadedImages];
    console.log(`\n🐼 TinyPNG: Compressing ${files.length} new image(s)...`);

    const failed = [];
    let compressed = 0;
    let totalSaved = 0;

    for (const filePath of files) {
        const file = path.basename(filePath);
        try {
            const originalBuffer = fs.readFileSync(filePath);
            const originalSize = originalBuffer.length;

            // Upload to TinyPNG
            const shrinkRes = await axios.post('https://api.tinify.com/shrink', originalBuffer, {
                auth: { username: 'api', password: TINYPNG_API_KEY },
                headers: { 'Content-Type': 'application/octet-stream' },
                maxBodyLength: Infinity
            });

            const outputUrl = shrinkRes.data.output.url;
            const compressedSize = shrinkRes.data.output.size;

            // Only download if TinyPNG actually reduced the size
            if (compressedSize < originalSize) {
                const downloadRes = await axios.get(outputUrl, {
                    responseType: 'arraybuffer',
                    auth: { username: 'api', password: TINYPNG_API_KEY }
                });
                fs.writeFileSync(filePath, downloadRes.data);
                const saved = originalSize - compressedSize;
                totalSaved += saved;
                compressed++;
                process.stdout.write('.');
            } else {
                process.stdout.write('=');
            }
        } catch (e) {
            const reason = e.response?.data ? Buffer.from(e.response.data).toString() : e.message;
            failed.push({ file, reason });
            process.stdout.write('x');
        }
    }

    console.log('');

    if (compressed > 0) {
        console.log(`✅ TinyPNG: Compressed ${compressed}/${files.length} image(s), saved ${(totalSaved / 1024).toFixed(1)} KB total.`);
    } else {
        console.log(`ℹ️  TinyPNG: No images were further reduced.`);
    }

    if (failed.length > 0) {
        console.warn(`⚠️  TinyPNG: ${failed.length} image(s) failed:`);
        failed.forEach(({ file, reason }) => {
            console.warn(`   - ${file}: ${reason}`);
        });
    }
}

// --- CONFIG UPDATER ---

function updateDocsJson(webArchiveYears, mobileArchiveYears) {
    if (!fs.existsSync(DOCS_JSON_PATH)) {
        console.warn(`⚠️ Could not find ${DOCS_JSON_PATH}.`);
        return;
    }

    const docsConfig = JSON.parse(fs.readFileSync(DOCS_JSON_PATH, 'utf8'));

    const newGroups = [
        {
            group: "Product Updates",
            pages: [
                `${MDX_PREFIX}/index`,
                `${MDX_PREFIX}/mobile`
            ]
        }
    ];

    if (webArchiveYears.length > 0) {
        newGroups.push({
            group: "Web Archive",
            pages: webArchiveYears.map(year => `${MDX_PREFIX}/${year}`)
        });
    }

    if (mobileArchiveYears.length > 0) {
        newGroups.push({
            group: "Mobile Archive",
            pages: mobileArchiveYears.map(year => `${MDX_PREFIX}/${year}-mobile`)
        });
    }

    console.log('🔄 Updating docs.json navigation...');

    const nav = docsConfig.navigation;
    let found = false;

    if (nav.tabs) {
        const releasesTab = nav.tabs.find(tab => tab.tab === 'Releases');
        if (releasesTab) {
            releasesTab.groups = newGroups;
            found = true;
            console.log('✅ Found existing "Releases" tab and updated it.');
        }
    }

    if (!found) {
        console.log('➕ "Releases" tab not found. Creating it...');

        const newTab = {
            tab: "Releases",
            groups: newGroups
        };

        if (nav.tabs) {
            nav.tabs.push(newTab);
        }
    }

    fs.writeFileSync(DOCS_JSON_PATH, JSON.stringify(docsConfig, null, 2));
    console.log(`✅ ${DOCS_JSON_PATH} updated successfully.`);
}

// --- LINK PRESERVATION ---

function normalizeLabel(label) {
    // Strip stray formatting characters (e.g. "20th January 2026**" → "20th January 2026")
    return label.replace(/[*]+$/g, '').trim();
}

function parseExistingMdx(filePath) {
    if (!fs.existsSync(filePath)) return {};

    const content = fs.readFileSync(filePath, 'utf8');
    const blocks = {};

    const updateRegex = /<Update\s+label="([^"]*?)"\s+description="([^"]*?)">\s*([\s\S]*?)\s*<\/Update>/g;
    let match;

    while ((match = updateRegex.exec(content)) !== null) {
        const key = `${normalizeLabel(match[1])}|${match[2]}`;
        blocks[key] = match[3].trim();
    }

    return blocks;
}

function extractDocLinks(content) {
    const links = [];
    const linkRegex = /\[([^\]]+?)\]\((\/[^)]+?)\)/g;
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
        const text = match[1];
        const url = match[2];
        if (url.startsWith('/core-platform/') || url.startsWith('/mobile-apps/')) {
            // Capture surrounding context to identify the correct position later.
            // Strip links from context so it matches plain-text regenerated content.
            const ctxSize = 40;
            const before = content.substring(Math.max(0, match.index - ctxSize), match.index)
                .replace(/\[([^\]]*?)\]\([^)]*?\)/g, '$1');
            const after = content.substring(match.index + match[0].length, match.index + match[0].length + ctxSize)
                .replace(/\[([^\]]*?)\]\([^)]*?\)/g, '$1');
            links.push({ text, url, full: match[0], before, after });
        }
    }
    return links;
}

function isInsideProtected(content, pos, textLen) {
    // Check if position falls inside an existing markdown link or HTML attribute
    const protectedPattern = /\[[^\]]*?\]\([^)]*?\)|(?:caption|alt|src|href)="[^"]*?"/g;
    let match;
    while ((match = protectedPattern.exec(content)) !== null) {
        if (pos >= match.index && pos + textLen <= match.index + match[0].length) return true;
        if (match.index > pos) break;
    }
    return false;
}

function transplantLinks(newContent, existingContent) {
    const docLinks = extractDocLinks(existingContent);
    if (docLinks.length === 0) return { content: newContent, count: 0 };

    // Sort by text length descending so "Charity donations" is processed before "donations"
    docLinks.sort((a, b) => b.text.length - a.text.length);

    let result = newContent;
    let transplanted = 0;

    for (const link of docLinks) {
        // Skip if this exact link already exists at the right spot
        if (result.includes(link.full)) {
            // Check context to see if it's actually the same usage
            const idx = result.indexOf(link.full);
            const nearbyBefore = result.substring(Math.max(0, idx - 40), idx);
            if (link.before.length > 5 && nearbyBefore.includes(link.before.substring(link.before.length - 10))) {
                continue;
            }
        }

        // Find the anchor text in the new content by matching surrounding context
        let bestPos = -1;
        let bestScore = 0;
        let searchFrom = 0;

        while (searchFrom < result.length) {
            const pos = result.indexOf(link.text, searchFrom);
            if (pos === -1) break;
            searchFrom = pos + 1;

            // Skip if inside a protected zone (existing link or HTML attribute)
            if (isInsideProtected(result, pos, link.text.length)) continue;

            // Score based on how much surrounding context matches
            const beforeSnippet = result.substring(Math.max(0, pos - 40), pos);
            const afterSnippet = result.substring(pos + link.text.length, pos + link.text.length + 40);

            let score = 0;
            // Check how many trailing chars of "before" context match
            for (let i = 1; i <= Math.min(link.before.length, beforeSnippet.length); i++) {
                if (link.before[link.before.length - i] === beforeSnippet[beforeSnippet.length - i]) score++;
                else break;
            }
            // Check how many leading chars of "after" context match
            for (let i = 0; i < Math.min(link.after.length, afterSnippet.length); i++) {
                if (link.after[i] === afterSnippet[i]) score++;
                else break;
            }

            if (score > bestScore) {
                bestScore = score;
                bestPos = pos;
            }
        }

        if (bestPos !== -1) {
            result = result.substring(0, bestPos) + link.full + result.substring(bestPos + link.text.length);
            transplanted++;
        }
    }

    return { content: result, count: transplanted };
}

// --- HELPER FUNCTIONS ---

// Matches: # 📱 Mobile Apps, ## -📱 Mobile Apps, # 📱Mobile apps, etc.
const MOBILE_SECTION_REGEX = /^#{1,2}\s*-?\s*📱\s*Mobile Apps?\s*$/im;

function splitMobileContent(content) {
    const match = MOBILE_SECTION_REGEX.exec(content);
    if (!match) return { webContent: content, mobileContent: '' };

    const mobileStart = match.index;
    const afterMobile = content.substring(mobileStart + match[0].length);

    // Find the next same-or-higher-level header (# or ##) to end the mobile section
    const nextHeaderMatch = afterMobile.match(/^#{1,2}\s+/m);
    let mobileEnd;
    if (nextHeaderMatch) {
        mobileEnd = mobileStart + match[0].length + nextHeaderMatch.index;
    } else {
        mobileEnd = content.length;
    }

    const mobileContent = content.substring(mobileStart + match[0].length, mobileEnd).trim();
    const webContent = (content.substring(0, mobileStart) + content.substring(mobileEnd)).trim();

    return { webContent, mobileContent };
}

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
        const { webContent, mobileContent } = splitMobileContent(mainContent);

        updates.push({
            label: releaseDateStr,
            description: `Release ${releaseVersion}`,
            content: webContent,
            mobileContent: mobileContent || null,
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
                    mobileContent: null,
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

async function generateMdxFile(updates, filePath, title, description) {
    // Parse existing file to preserve manually-added links
    const existingBlocks = parseExistingMdx(filePath);
    let preservedCount = 0;

    let mdxContent = `---
title: "${title}"
description: "${description}"
---\n\n`;

    // Process updates sequentially
    for (const update of updates) {
        let rawContent = update.content;

        // --- PRE-PROCESS: DOWNLOAD IMAGES ---
        const imgRegex = /!\[.*?\]\(([^)\s"]+)(?:.*?)?\)/g;
        const urlsToDownload = new Set();
        let match;
        while ((match = imgRegex.exec(rawContent)) !== null) {
            urlsToDownload.add(match[1]);
        }

        const urlMap = {};
        for (const url of urlsToDownload) {
            urlMap[url] = await downloadImage(url);
        }

        // --- STANDARD PROCESSING ---
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

            // 5. FORMAT IMAGES (Use Local Paths)
            text = text.replace(/!\[(.*?)\]\(([^)\s"]+)(?:\s+"(.*?)")?\)/g, (match, alt, url, title) => {
                const safeUrl = urlMap[url] || url;

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

        // Check if existing block has manually-added links worth preserving
        const key = `${normalizeLabel(update.label)}|${update.description}`;
        const existingContent = existingBlocks[key];

        if (existingContent) {
            // Transplant any manually-added doc links from the existing content into the new content
            const { content: linkedContent, count } = transplantLinks(processedContent, existingContent);
            processedContent = linkedContent;
            if (count > 0) {
                preservedCount += count;
            }
        }

        mdxContent += `
<Update label="${update.label}" description="${update.description}">

${processedContent}

</Update>
`;
    }

    fs.writeFileSync(filePath, mdxContent);
    if (preservedCount > 0) {
        console.log(`✅ Generated: ${filePath} (${preservedCount} link(s) preserved)`);
    } else {
        console.log(`✅ Generated: ${filePath}`);
    }
}

main();
