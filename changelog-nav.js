// Shared navigation between our three changelogs (Release Notes, Mobile App Updates,
// API Changelog). Both generators (generate-release-notes.js and generate-api-docs.js)
// import these so the cross-links, cards and date labels stay consistent across every page.

// All three changelogs live under /releases. `href`s are absolute site paths;
// `/releases` is the Release Notes index page (releases/index.mdx).
const CHANGELOG_LINKS = {
  releases: {
    title: 'Release Notes',
    icon: 'rocket',
    href: '/releases',
    body: 'New features across the web platform.',
  },
  mobile: {
    title: 'Mobile App Updates',
    icon: 'mobile-screen',
    href: '/releases/mobile',
    body: 'The latest from our mobile app suite.',
  },
  api: {
    title: 'API Changelog',
    icon: 'code',
    href: '/releases/api',
    body: 'Additions and changes to the REST API.',
  },
};

/**
 * Render a list of changelog links as a Mintlify CardGroup. Returns an empty string
 * when no links are supplied so callers can inject it unconditionally.
 */
function buildCrossLinkCards(links) {
  if (!links || links.length === 0) {
    return '';
  }

  const cards = links
    .map(
      (link) => `  <Card title="${link.title}" icon="${link.icon}" href="${link.href}">
    ${link.body}
  </Card>`
    )
    .join('\n');

  return `<CardGroup cols={${links.length}}>\n${cards}\n</CardGroup>`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Shorten the month in a changelog date label ("21st September 2026" → "21st Sep 2026"), returning
 * anything that isn't a day-month-year date unchanged. Already-short labels pass through as-is.
 */
function formatChangelogDate(label) {
  const match = String(label).trim().match(/^(\d{1,2}(?:st|nd|rd|th)?)\s+([A-Za-z]{3,})\.?\s+(\d{4})$/);
  if (!match) {
    return label;
  }

  const month = MONTHS.find((name) => name.toLowerCase().startsWith(match[2].toLowerCase()));
  if (!month) {
    return label;
  }

  return `${match[1]} ${month.slice(0, 3)} ${match[3]}`;
}

module.exports = { CHANGELOG_LINKS, buildCrossLinkCards, formatChangelogDate };
