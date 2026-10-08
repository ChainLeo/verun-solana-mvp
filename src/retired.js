export const legacyRoutes = ['score', 'evaluate', 'validators', 'mint-sbt', 'revoke-sbt', 'sbt-status', 'sbt-list', 'config-check', 'funding-status'];
export function retired(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({ error: 'legacy_api_retired', message: 'VERUN uses paid opportunity scans through the ASP gateway. Validator, score and SBT APIs are retired.', documentation: '/docs.html' });
}
