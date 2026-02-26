/**
 * Mock OpenID4VC Agent for Kubernetes Benchmark
 * Simulates OpenID4VC protocol latencies
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;
const AGENT_LABEL = process.env.AGENT_LABEL || 'OpenID4VC-Agent';

// Metrics
let metrics = {
  issuanceCount: 0,
  presentationCount: 0,
  selectiveDisclosureCount: 0,
  totalLatency: 0
};

// Simulate processing delays
const simulateDelay = (baseMs, varianceMs) => {
  const delay = baseMs + Math.random() * varianceMs;
  return new Promise(resolve => setTimeout(resolve, delay));
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', agent: AGENT_LABEL, protocol: 'openid4vc' });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json(metrics);
});

// OpenID4VC Issuer Metadata
app.get('/.well-known/openid-credential-issuer', (req, res) => {
  res.json({
    credential_issuer: `http://${req.hostname}:${PORT}`,
    credential_endpoint: '/credential',
    token_endpoint: '/token',
    credentials_supported: [
      {
        format: 'vc+sd-jwt',
        id: 'AcademicDegree',
        cryptographic_binding_methods_supported: ['did:web', 'did:key'],
        credential_signing_alg_values_supported: ['ES256']
      }
    ]
  });
});

// OID4VCI: Credential Issuance (Pre-authorized code flow)
app.post('/openid4vc/issue', async (req, res) => {
  const start = Date.now();

  // Simulate 4 steps (fewer than DIDComm):
  // 1. Credential offer resolution
  await simulateDelay(15, 10);
  // 2. Token request
  await simulateDelay(25, 15);
  // 3. Credential request + key binding
  await simulateDelay(30, 20);
  // 4. Credential response (SD-JWT signing)
  await simulateDelay(35, 20);

  const credentialId = uuidv4();
  const latency = Date.now() - start;

  metrics.issuanceCount++;
  metrics.totalLatency += latency;

  res.json({
    credentialId,
    latency,
    roundTrips: 4,
    protocol: 'OID4VCI',
    format: 'vc+sd-jwt',
    messageSize: 1024 + Math.floor(Math.random() * 256)
  });
});

// OID4VP: Credential Presentation
app.post('/openid4vc/present', async (req, res) => {
  const start = Date.now();

  // Simulate 2 round-trips (much simpler than DIDComm):
  // 1. Authorization request + presentation definition
  await simulateDelay(30, 20);
  // 2. Authorization response with vp_token
  await simulateDelay(50, 30);

  const presentationId = uuidv4();
  const latency = Date.now() - start;

  metrics.presentationCount++;
  metrics.totalLatency += latency;

  res.json({
    presentationId,
    latency,
    roundTrips: 2,
    protocol: 'OID4VP',
    format: 'vp_token',
    verified: true,
    messageSize: 1536 + Math.floor(Math.random() * 512)
  });
});

// OID4VP: Selective Disclosure (SD-JWT)
app.post('/openid4vc/selective-disclose', async (req, res) => {
  const start = Date.now();

  // Simulate 2 round-trips with SD-JWT disclosure:
  // 1. Authorization request with selective claims
  await simulateDelay(35, 20);
  // 2. Authorization response with selected disclosures
  await simulateDelay(55, 35);

  const presentationId = uuidv4();
  const latency = Date.now() - start;

  metrics.selectiveDisclosureCount++;
  metrics.totalLatency += latency;

  res.json({
    presentationId,
    latency,
    roundTrips: 2,
    protocol: 'OID4VP',
    format: 'sd-jwt',
    disclosedClaims: 2,
    totalClaims: 5,
    verified: true,
    messageSize: 2048 + Math.floor(Math.random() * 512)
  });
});

app.listen(PORT, () => {
  console.log(`${AGENT_LABEL} listening on port ${PORT}`);
  console.log(`Protocol: OpenID4VC (OID4VCI + OID4VP)`);
  console.log(`Credential Format: SD-JWT`);
});
