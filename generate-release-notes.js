require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const sharp = require('sharp'); // <--- New Dependency for compression
const { CHANGELOG_LINKS, buildCrossLinkCards } = require('./changelog-nav');

// --- CONFIGURATION ---
const TINYPNG_API_KEY = process.env.TINYPNG_API_KEY;
const SHARE_ID = '5450e24b-d6cd-48c9-a315-a9037dba31f1';
const API_BASE_URL = 'https://wiki.nutickets.com/api';

// File Paths
const DOCS_JSON_PATH = 'docs.json';
const OUTPUT_DIR = 'releases';
const MDX_PREFIX = 'releases';
const IMAGES_DIR = 'images/releases';
const VIDEOS_DIR = 'videos/releases';

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

        // Mobile content (only for releases that have it) — one entry per dated chunk
        if (update.mobileChunks && update.mobileChunks.length > 0) {
            for (const chunk of update.mobileChunks) {
                const chunkYear = chunk.dateObj.getFullYear();
                if (isNaN(chunkYear)) continue;

                const mobileUpdate = {
                    label: chunk.label,
                    description: update.description,
                    content: chunk.content,
                    dateObj: chunk.dateObj
                };
                if (chunkYear >= cutoffYear) {
                    mobileMain.push(mobileUpdate);
                } else {
                    if (!mobileArchiveByYear[chunkYear]) mobileArchiveByYear[chunkYear] = [];
                    mobileArchiveByYear[chunkYear].push(mobileUpdate);
                }
            }
        }
    });

    // Mobile chunks can carry their own dates that differ from the release date,
    // so re-sort each mobile bucket by the chunk's own date.
    mobileMain.sort((a, b) => b.dateObj - a.dateObj);
    Object.values(mobileArchiveByYear).forEach(arr => arr.sort((a, b) => b.dateObj - a.dateObj));

    // 5. Ensure Directories Exist
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
    if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });

    // 6. Generate Files

    // A. Web Release Notes (Index)
    await generateMdxFile(
        webMain,
        path.join(OUTPUT_DIR, 'index.mdx'),
        "Release Notes",
        `Latest product updates from ${cutoffYear}/${currentYear}`,
        [CHANGELOG_LINKS.mobile, CHANGELOG_LINKS.api],
        true
    );

    // B. Mobile App Updates
    await generateMdxFile(
        mobileMain,
        path.join(OUTPUT_DIR, 'mobile.mdx'),
        "Mobile App Updates",
        `Latest mobile app updates from ${cutoffYear}/${currentYear}`,
        [CHANGELOG_LINKS.releases, CHANGELOG_LINKS.api]
    );

    // C. Web Archives
    const webArchiveYears = Object.keys(webArchiveByYear).sort((a, b) => b - a);

    for (const year of webArchiveYears) {
        await generateMdxFile(
            webArchiveByYear[year],
            path.join(OUTPUT_DIR, `${year}.mdx`),
            `${year} Updates`,
            `Release history for ${year}`,
            undefined,
            true
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

// --- VIDEO DOWNLOADER (RAW, NO COMPRESSION) ---

/**
 * Mirror a video upload locally. Outline serializes videos as plain links to signed
 * S3 URLs that expire after ~1 hour, so the file must be downloaded to survive.
 * Saved as-is — sharp only handles images, and re-encoding video here is unnecessary.
 * Deliberately not added to `newlyDownloadedImages` (the TinyPNG pass is image-only).
 */
async function downloadVideo(url) {
    try {
        const urlObj = new URL(url);

        // Hash ONLY the pathname so the cache survives the rotating S3 signature.
        const hash = crypto.createHash('md5').update(urlObj.pathname).digest('hex');

        let ext = path.extname(urlObj.pathname).toLowerCase();
        if (!ext || ext.length > 5) ext = '.mp4';

        const filename = `${hash}${ext}`;
        const localPath = path.join(VIDEOS_DIR, filename);
        const publicPath = `/${VIDEOS_DIR}/${filename}`;

        // CACHE CHECK: If file exists, skip download
        if (fs.existsSync(localPath)) {
            return publicPath;
        }

        const response = await axios({
            url,
            method: 'GET',
            responseType: 'arraybuffer'
        });

        fs.writeFileSync(localPath, response.data);
        return publicPath;

    } catch (e) {
        console.warn(`⚠️ Failed to download video: ${url}. Keeping remote link.`);
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

    // The API changelog is produced by generate-api-docs.js (which runs first) and lives
    // alongside these files under /releases. Detect its pages so they slot into the same
    // navigation: the main page joins "Product Updates" and each earlier year gets an
    // "API Archive" entry, mirroring the web/mobile treatment.
    const apiMainExists = fs.existsSync(path.join(OUTPUT_DIR, 'api.mdx'));
    const apiArchiveYears = fs.existsSync(OUTPUT_DIR)
        ? fs.readdirSync(OUTPUT_DIR)
            .map(file => (file.match(/^(\d{4})-api\.mdx$/) || [])[1])
            .filter(Boolean)
            .sort((a, b) => b - a)
        : [];

    const productUpdatePages = [
        `${MDX_PREFIX}/index`,
        `${MDX_PREFIX}/mobile`
    ];
    if (apiMainExists) {
        productUpdatePages.push(`${MDX_PREFIX}/api`);
    }

    const newGroups = [
        {
            group: "Product Updates",
            pages: productUpdatePages
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

    if (apiArchiveYears.length > 0) {
        newGroups.push({
            group: "API Archive",
            pages: apiArchiveYears.map(year => `${MDX_PREFIX}/${year}-api`)
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

// Internal doc-link prefixes worth preserving across regenerations: the platform/mobile
// guides plus the auto-generated API and webhook reference pages.
const PRESERVED_LINK_PREFIXES = ['/core-platform/', '/mobile-apps/', '/api-reference/', '/webhook-reference/'];

function extractDocLinks(content) {
    const links = [];
    const linkRegex = /\[([^\]]+?)\]\((\/[^)]+?)\)/g;
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
        const text = match[1];
        const url = match[2];
        if (PRESERVED_LINK_PREFIXES.some(prefix => url.startsWith(prefix))) {
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

// Matches an "API" section heading at any level (with or without a leading emoji),
// e.g. "## 🧑‍💻 API", "# API Updates", "### API".
const API_SECTION_HEADING = /^(#{1,6})\s+(.*)$/;

function isApiHeading(headingText) {
    const cleaned = headingText.replace(/[^a-z ]/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();
    return cleaned === 'api' || cleaned === 'api updates' || cleaned === 'api changes';
}

// A placeholder API section merely points readers to the API changelog and carries no
// real content (no bullet list). These made sense when releases were circulated as
// standalone documents, but are redundant now the API changelog is its own page.
// Sections with genuine content (e.g. pre-2022 API changes the changelog defers to)
// are left untouched.
function isApiPlaceholderBody(body) {
    const text = body.trim();
    const hasBullets = /^\s*[*-]\s+/m.test(text);
    return !hasBullets && (text === '' || /changelog/i.test(text));
}

function stripApiPlaceholderSection(content) {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const heading = lines[i].match(API_SECTION_HEADING);
        if (!heading || !isApiHeading(heading[2])) continue;

        const level = heading[1].length;

        // The section runs until the next heading of the same or higher level (or EOF).
        let end = lines.length;
        for (let j = i + 1; j < lines.length; j++) {
            const sibling = lines[j].match(/^(#{1,6})\s+/);
            if (sibling && sibling[1].length <= level) {
                end = j;
                break;
            }
        }

        if (isApiPlaceholderBody(lines.slice(i + 1, end).join('\n'))) {
            lines.splice(i, end - i);
            // Re-scan in case a document contains more than one such section.
            return stripApiPlaceholderSection(lines.join('\n'));
        }
    }

    return content;
}

// Matches a trailing " - <date>" suffix on a mobile subsection header,
// e.g. "Box Office Pro 3.4.2 → 3.5.0 - 16th March 2026"
const MOBILE_HEADER_DATE_SUFFIX = /\s+-\s+(\d+(?:st|nd|rd|th)?\s+\w+\s+\d{4})\s*$/;

function parseMobileChunks(mobileContent, fallbackLabel, fallbackDateObj) {
    if (!mobileContent || !mobileContent.trim()) return [];

    // Split on each ### header; preamble (if any) ends up in sections[0].
    const sections = mobileContent.split(/(?=^###\s)/m);

    const byDate = new Map();
    const addChunk = (label, dateObj, content) => {
        if (!byDate.has(label)) {
            byDate.set(label, { label, dateObj, chunks: [] });
        }
        byDate.get(label).chunks.push(content);
    };

    for (const section of sections) {
        if (!section.trim()) continue;

        if (section.startsWith('###')) {
            const lineEnd = section.indexOf('\n');
            const headerLine = lineEnd === -1 ? section : section.substring(0, lineEnd);
            const body = lineEnd === -1 ? '' : section.substring(lineEnd);
            const headerText = headerLine.replace(/^###\s*/, '').trim();
            const dateMatch = headerText.match(MOBILE_HEADER_DATE_SUFFIX);

            if (dateMatch) {
                const dateStr = dateMatch[1];
                const cleanHeader = headerText.replace(MOBILE_HEADER_DATE_SUFFIX, '').trim();
                addChunk(dateStr, parseDateString(dateStr), `### ${cleanHeader}${body}`);
            } else {
                addChunk(fallbackLabel, fallbackDateObj, `### ${headerText}${body}`);
            }
        } else {
            // Preamble (content before the first ### header) — bucket under the release date.
            addChunk(fallbackLabel, fallbackDateObj, section);
        }
    }

    // Sections retain their original trailing whitespace from the lookahead split,
    // so concatenate with no separator to avoid injecting extra blank lines.
    return [...byDate.values()].map(({ label, dateObj, chunks }) => ({
        label,
        dateObj,
        content: chunks.join('').trim()
    }));
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
        const cleanedWebContent = stripApiPlaceholderSection(webContent).trim();
        const mobileChunks = parseMobileChunks(mobileContent, releaseDateStr, releaseDateObj);

        updates.push({
            label: releaseDateStr,
            description: `Release ${releaseVersion}`,
            content: cleanedWebContent,
            mobileChunks,
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
                    mobileChunks: [],
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

// --- ACCORDION GROUPING (web release notes) ---

// An H3 line (### …) but not an H4+ (#### …). H3s mark feature subsections.
const H3_LINE = /^###(?!#)\s+(.*)$/;
// Any markdown heading — used to detect where an H3 section's body ends.
const ANY_HEADING_LINE = /^#{1,6}\s+/;
// A fenced code block delimiter.
const CODE_FENCE = /^\s*```/;

/**
 * Reduce a processed H3 line to its plain display title. By this stage the heading may
 * carry bold markers from the source (e.g. "### **Pricing history**") and/or transplanted
 * doc links (e.g. "### [Dynamic pricing](/core-platform/...)"); both are stripped because
 * a Mintlify accordion title is plain text. Any docs link a feature name carried is
 * intentionally dropped here — in-bullet links in the body are untouched.
 */
function headingTitle(line) {
    return line
        .replace(H3_LINE, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → their text
        .replace(/\[([A-Z]{2,}-\d+)\]/g, '')      // bare ticket references
        .replace(/[*_`]/g, '')                     // emphasis / code marks
        .replace(/\\([{}<>])/g, '$1')              // undo escaping
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Render one run of feature subsections as a Mintlify <AccordionGroup>. Accordions are
 * open by default so the changelog stays readable while gaining clear per-feature grouping.
 *
 * @param {Array<{ title: string, body: string }>} accordions
 */
function renderAccordionGroup(accordions) {
    const blocks = accordions.map(({ title, body }) => {
        const safeTitle = title.replace(/"/g, '&quot;');
        return `<Accordion title="${safeTitle}" defaultOpen>\n\n${body}\n\n</Accordion>`;
    });
    return `\n<AccordionGroup>\n\n${blocks.join('\n\n')}\n\n</AccordionGroup>\n`;
}

/**
 * Wrap each run of consecutive H3 feature subsections into a collapsible <AccordionGroup>.
 * Top-level section headings (already #### by this point) and flat bullet lists are left
 * untouched. Code fences are skipped so a "###" inside a code sample is never mistaken for
 * a heading.
 */
function groupHeadingsIntoAccordions(content) {
    const lines = content.split('\n');
    const out = [];
    let inFence = false;
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (CODE_FENCE.test(line)) {
            inFence = !inFence;
            out.push(line);
            i++;
            continue;
        }

        if (!inFence && H3_LINE.test(line)) {
            const accordions = [];

            // Collect every consecutive H3 section into one group.
            while (i < lines.length && H3_LINE.test(lines[i])) {
                const title = headingTitle(lines[i]);
                i++;

                // The body runs until the next heading (H3 → next accordion, anything
                // else → end of group) or EOF, staying code-fence aware throughout.
                const bodyLines = [];
                let bodyFence = false;
                while (i < lines.length) {
                    const bodyLine = lines[i];
                    if (CODE_FENCE.test(bodyLine)) {
                        bodyFence = !bodyFence;
                        bodyLines.push(bodyLine);
                        i++;
                        continue;
                    }
                    if (!bodyFence && ANY_HEADING_LINE.test(bodyLine)) {
                        break;
                    }
                    bodyLines.push(bodyLine);
                    i++;
                }

                accordions.push({ title, body: bodyLines.join('\n').trim() });
            }

            out.push(renderAccordionGroup(accordions));
            continue;
        }

        out.push(line);
        i++;
    }

    return out.join('\n');
}

async function generateMdxFile(updates, filePath, title, description, crossLinks, enableAccordions = false) {
    // Parse existing file to preserve manually-added links
    const existingBlocks = parseExistingMdx(filePath);
    let preservedCount = 0;

    let mdxContent = `---
title: "${title}"
description: "${description}"
---\n\n`;

    // Cross-links to our other changelogs, rendered as cards at the top of the page.
    const crossLinkCards = buildCrossLinkCards(crossLinks);
    if (crossLinkCards) {
        mdxContent += `${crossLinkCards}\n\n`;
    }

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

        // --- PRE-PROCESS: DOWNLOAD VIDEOS ---
        // Outline emits video uploads as plain links — [name.mp4 WxH](signed-url), no leading "!" —
        // so they bypass the image regex above. Detect by extension and mirror locally.
        const videoLinkRegex = /(?<!!)\[[^\]]*?\]\((https?:\/\/[^)\s]+?\.(?:mp4|mov|webm|m4v)(?:\?[^)\s]*)?)\)/gi;
        const videoUrls = new Set();
        let videoMatch;
        while ((videoMatch = videoLinkRegex.exec(rawContent)) !== null) {
            videoUrls.add(videoMatch[1]);
        }
        for (const url of videoUrls) {
            urlMap[url] = await downloadVideo(url);
        }

        // --- STANDARD PROCESSING ---
        const parts = rawContent.split(/(```[\s\S]*?```)/g);

        let processedContent = parts.map(part => {
            if (part.startsWith('```')) {
                return part;
            }

            let text = part;

            // 1. TRANSFORM HEADERS
            // Top-level sections (# / ##) collapse to H4. H3 feature subsections are
            // left intact here when accordions are enabled (the web changelog) so
            // groupHeadingsIntoAccordions() can wrap each run below; otherwise they
            // flatten to bold, matching the long-standing mobile/API treatment.
            text = text
                .replace(/^#\s+(.*$)/gm, '\n#### $1')
                .replace(/^##\s+(.*$)/gm, '\n#### $1');
            if (!enableAccordions) {
                text = text.replace(/^###\s+(.*$)/gm, '\n**$1**');
            }

            // 2. ESCAPE SPECIAL CHARS
            text = text.replace(/([^\\])([{}])/g, '$1\\$2');
            text = text.replace(/<(?!https?:|\/?(Note|Tip|Warning|Info|Success|Danger|Frame|img|br|video|Accordion|AccordionGroup))/g, '\\<');

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

            // 5b. FORMAT VIDEOS (embed inline using the local copy)
            // Mintlify has no Video component; a standard HTML5 <video> tag renders inline.
            // No aspect-video class — that forces 16:9 and would crop non-widescreen recordings.
            text = text.replace(/(?<!!)\[[^\]]*?\]\((https?:\/\/[^)\s]+?\.(?:mp4|mov|webm|m4v)(?:\?[^)\s]*)?)\)/gi, (match, url) => {
                const safeUrl = urlMap[url] || url;
                return `\n\n<Frame><video controls className="w-full rounded-xl" src="${safeUrl}"></video></Frame>\n\n`;
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

        // Group H3 feature subsections into collapsible accordions (web changelog only).
        // Runs after link transplant: in-bullet doc links are already re-applied, and any
        // link the transplant placed on a feature heading is dropped with the heading markup
        // (accordion titles are plain text).
        if (enableAccordions) {
            processedContent = groupHeadingsIntoAccordions(processedContent);
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

if (require.main === module) {
    main();
}

module.exports = { headingTitle, renderAccordionGroup, groupHeadingsIntoAccordions };
