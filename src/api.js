require('dotenv').config();
const express = require('express');
const path = require('path');
const { evaluateAgent, listValidators } = require('./evaluate');
const { anchorEvaluation } = require('./anchor');

const app = express();
app.use(express.json());

// Serve static frontend (index.html, docs.html, assets) when running locally.
app.use(express.static(path.join(__dirname, '..')));

app.get('/health', (_req, res) =>
  res.json({ ok: true, service: 'verun-solana-mvp', network: 'solana-devnet' })
);

app.get('/validators', (_req, res) =>
  res.json({
    validators: listValidators(),
    total: listValidators().length,
    consensus_required: 2,
    note: 'Pass validatorIds array in POST /evaluate to select validators. Min 2 required.',
  })
);

app.post('/score', async (req, res) => {
  const { agentId = 'agent', score = 0, operation = 'read', validatorIds = null } = req.body || {};
  const out = await evaluateAgent({ agentId, score: Number(score), operation, validatorIds });
  res.json(out);
});

app.post('/evaluate', async (req, res) => {
  try {
    const { agentId = 'agent', score = 0, operation = 'read', validatorIds = null } = req.body || {};
    const verdict = await evaluateAgent({ agentId, score: Number(score), operation, validatorIds });
    let anchor = null;
    try {
      anchor = await anchorEvaluation({
        type: 'verun-evaluation',
        agentId,
        score: Number(score),
        operation,
        consensus: verdict.consensus,
        permitted: verdict.permitted,
        validators: verdict.validators_used.map((v) => v.id),
        ts: verdict.ts,
      });
    } catch (anchorErr) {
      anchor = { error: anchorErr.message, status: 'anchor_failed' };
    }
    res.json({ success: true, verdict, anchor });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

// Local-only convenience: /api/* routing for the same handlers, so the
// `npm run api` server matches the Vercel layout 1:1.
app.get('/api/health',         require('../api/health'));
app.get('/api/validators',     require('../api/validators'));
app.get('/api/config-check',   require('../api/config-check'));
app.get('/api/funding-status', require('../api/funding-status'));
app.post('/api/score',         require('../api/score'));
app.post('/api/evaluate',      require('../api/evaluate'));
app.post('/api/mint-sbt',      require('../api/mint-sbt'));
app.post('/api/revoke-sbt',    require('../api/revoke-sbt'));
app.get('/api/sbt-status',     require('../api/sbt-status'));
app.get('/api/sbt-list',       require('../api/sbt-list'));

const PORT = process.env.PORT || 3010;
if (require.main === module) {
  app.listen(PORT, () => console.log(`verun-solana-mvp API on :${PORT}`));
}

module.exports = app;
