// Shared navigation between our three changelogs (Release Notes, Mobile App Updates,
// API Changelog). Both generators (generate-release-notes.js and generate-api-docs.js)
// import these so the cross-links and cards stay consistent across every page.

// All three changelogs live under /releases. `href`s are absolute site paths;
// `/releases` is the Release Notes index page (releases/index.mdx).
const CHANGELOG_LINKS = {
  releases: {
    title: 'Release Notes',
    icon: 'rocket',
    href: '/releases',
    body: 'New features and improvements across the web platform.',
  },
  mobile: {
    title: 'Mobile App Updates',
    icon: 'mobile-screen',
    href: '/releases/mobile',
    body: 'The latest releases across our mobile app suite.',
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

module.exports = { CHANGELOG_LINKS, buildCrossLinkCards };
