/**
 * Mock DIDComm Agent for Kubernetes Benchmark
 * Simulates DIDComm protocol latencies
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const AGENT_LABEL = process.env.AGENT_LABEL || 'DIDComm-Agent';

// Metrics
let metrics = {
  issuanceCount: 0,
  presentationCount: 0,
  selectiveDisclosureCount: 0,
  totalLatency: 0
};

// Simulate DIDComm processing delays
const simulateDelay = (baseMs, varianceMs) => {
  const delay = baseMs + Math.random() * varianceMs;
  return new Promise(resolve => setTimeout(resolve, delay));
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', agent: AGENT_LABEL, protocol: 'didcomm' });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json(metrics);
});

// DIDComm Connection Setup (simulated)
app.post('/didcomm/connect', async (req, res) => {
  const start = Date.now();
  // Simulate DID Exchange: 2 round-trips
  await simulateDelay(30, 20);
  const connectionId = uuidv4();
  const latency = Date.now() - start;
  res.json({
    connectionId,
    latency,
    roundTrips: 2,
    protocol: 'did-exchange/1.0'
  });
});

// Credential Issuance (Issue Credential Protocol v2)
app.post('/didcomm/issue', async (req, res) => {
  const start = Date.now();

  // Simulate 5 round-trips:
  // 1. propose-credential
  await simulateDelay(25, 15);
  // 2. offer-credential
  await simulateDelay(30, 20);
  // 3. request-credential
  await simulateDelay(25, 15);
  // 4. issue-credential (signing + AnonCreds)
  await simulateDelay(50, 30);
  // 5. ack
  await simulateDelay(15, 10);

  const credentialId = uuidv4();
  const latency = Date.now() - start;

  metrics.issuanceCount++;
  metrics.totalLatency += latency;

  res.json({
    credentialId,
    latency,
    roundTrips: 5,
    protocol: 'issue-credential/2.0',
    format: 'anoncreds',
    messageSize: 2048 + Math.floor(Math.random() * 512)
  });
});

// Credential Presentation (Present Proof Protocol v2)
app.post('/didcomm/present', async (req, res) => {
  const start = Date.now();

  // Simulate 4 round-trips:
  // 1. request-presentation
  await simulateDelay(25, 15);
  // 2. presentation (ZKP generation)
  await simulateDelay(60, 40);
  // 3. verify
  await simulateDelay(30, 20);
  // 4. ack
  await simulateDelay(15, 10);

  const presentationId = uuidv4();
  const latency = Date.now() - start;

  metrics.presentationCount++;
  metrics.totalLatency += latency;

  res.json({
    presentationId,
    latency,
    roundTrips: 4,
    protocol: 'present-proof/2.0',
    format: 'anoncreds',
    verified: true,
    messageSize: 3072 + Math.floor(Math.random() * 1024)
  });
});

// Selective Disclosure (AnonCreds predicates)
app.post('/didcomm/selective-disclose', async (req, res) => {
  const start = Date.now();

  // Simulate 4 round-trips with predicate proof:
  // 1. request-presentation with predicates
  await simulateDelay(30, 20);
  // 2. presentation with CL predicates (heavier ZKP)
  await simulateDelay(80, 50);
  // 3. verify predicates
  await simulateDelay(40, 25);
  // 4. ack
  await simulateDelay(15, 10);

  const presentationId = uuidv4();
  const latency = Date.now() - start;

  metrics.selectiveDisclosureCount++;
  metrics.totalLatency += latency;

  res.json({
    presentationId,
    latency,
    roundTrips: 4,
    protocol: 'present-proof/2.0',
    format: 'anoncreds-predicate',
    revealedAttributes: 2,
    predicates: 1,
    verified: true,
    messageSize: 4096 + Math.floor(Math.random() * 1024)
  });
});

app.listen(PORT, () => {
  console.log(`${AGENT_LABEL} listening on port ${PORT}`);
  console.log(`Protocol: DIDComm v2`);
  console.log(`Credential Format: AnonCreds`);
});
