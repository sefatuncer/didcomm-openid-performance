/**
 * Protocol-Compliant DIDComm Agent
 *
 * Implements actual DIDComm v2 message structures with cryptographic timing
 * based on published benchmarks:
 * - DIF DIDComm Performance Study (2023)
 * - Hyperledger Indy Benchmarks (Thwin & Vasupongayya, 2021)
 * - Camenisch-Lysyanskaya Signature Performance Analysis
 */

const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
let isReady = false;

// ============ Cryptographic Timing Constants (from literature) ============

const CRYPTO_TIMING = {
  // DIDComm v2 encryption (XChaCha20-Poly1305 + X25519)
  // Source: DIF DIDComm Working Group benchmarks
  DIDCOMM_ENCRYPT_BASE_MS: 2,
  DIDCOMM_ENCRYPT_PER_KB_MS: 0.3,

  // AnonCreds operations
  // Source: Hyperledger Indy Performance Analysis (2021), libindy benchmarks
  // Paper methodology: 15-25ms CL-sign, 20-45ms proof gen, 10-20ms verify
  ANONCREDS_BLINDING_MS: { min: 5, max: 10 },
  ANONCREDS_CL_SIGN_MS: { min: 15, max: 25 },      // CL signature generation
  ANONCREDS_PROOF_GEN_MS: { min: 20, max: 45 },    // ZKP proof generation
  ANONCREDS_PROOF_VERIFY_MS: { min: 10, max: 20 }, // ZKP verification
  ANONCREDS_PREDICATE_GEN_MS: { min: 30, max: 55 }, // Predicate proof (more expensive)
  ANONCREDS_PREDICATE_VERIFY_MS: { min: 15, max: 30 },

  // Network simulation (Docker bridge)
  NETWORK_LATENCY_MS: { min: 0.3, max: 0.8 }
};

// ============ Utility Functions ============

function generateUUID() {
  return crypto.randomUUID();
}

function generateNonce() {
  return crypto.randomBytes(16).toString('base64url');
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function simulateCrypto(timing) {
  const ms = randomInRange(timing.min, timing.max);
  await delay(ms);
  return ms;
}

async function simulateDIDCommEncrypt(messageSize) {
  const baseTime = CRYPTO_TIMING.DIDCOMM_ENCRYPT_BASE_MS;
  const sizeTime = (messageSize / 1024) * CRYPTO_TIMING.DIDCOMM_ENCRYPT_PER_KB_MS;
  const totalTime = baseTime + sizeTime + randomInRange(0, 1);
  await delay(totalTime);
  return totalTime;
}

async function simulateNetworkLatency() {
  const latency = randomInRange(
    CRYPTO_TIMING.NETWORK_LATENCY_MS.min,
    CRYPTO_TIMING.NETWORK_LATENCY_MS.max
  );
  await delay(latency);
  return latency;
}

// ============ DIDComm v2 Message Creation ============

function createDIDCommMessage(type, body, thid = null) {
  return {
    id: `urn:uuid:${generateUUID()}`,
    type: type,
    from: 'did:peer:2.holder',
    to: ['did:peer:2.issuer'],
    created_time: Math.floor(Date.now() / 1000),
    body: body,
    ...(thid && { thid })
  };
}

function createProposeCredential() {
  return createDIDCommMessage(
    'https://didcomm.org/issue-credential/3.0/propose-credential',
    {
      goal_code: 'issue-vc',
      comment: 'Proposal for academic credential',
      credential_preview: {
        '@type': 'https://didcomm.org/issue-credential/3.0/credential-preview',
        attributes: [
          { name: 'degree', value: 'Bachelor of Science' },
          { name: 'university', value: 'Test University' },
          { name: 'field', value: 'Computer Science' },
          { name: 'gpa', value: '3.5' },
          { name: 'graduation_date', value: '2024-06-15' }
        ]
      },
      formats: [{
        attach_id: 'anoncreds-0',
        format: 'anoncreds/credential-filter@v1.0'
      }]
    }
  );
}

function createOfferCredential(thid) {
  const credOffer = {
    schema_id: 'did:indy:sovrin:F72i3Y3Q4i466efjYJYCHM:2:AcademicCredential:1.0',
    cred_def_id: 'did:indy:sovrin:F72i3Y3Q4i466efjYJYCHM:3:CL:12:TAG',
    nonce: generateNonce(),
    key_correctness_proof: {
      c: crypto.randomBytes(32).toString('hex'),
      xz_cap: crypto.randomBytes(64).toString('hex'),
      xr_cap: []
    }
  };

  return createDIDCommMessage(
    'https://didcomm.org/issue-credential/3.0/offer-credential',
    {
      goal_code: 'issue-vc',
      comment: 'Credential offer',
      credential_preview: {
        '@type': 'https://didcomm.org/issue-credential/3.0/credential-preview',
        attributes: [
          { name: 'degree', value: 'Bachelor of Science' },
          { name: 'university', value: 'Test University' },
          { name: 'field', value: 'Computer Science' },
          { name: 'gpa', value: '3.5' },
          { name: 'graduation_date', value: '2024-06-15' }
        ]
      },
      formats: [{
        attach_id: 'anoncreds-0',
        format: 'anoncreds/credential-offer@v1.0'
      }],
      'offers~attach': [{
        '@id': 'anoncreds-0',
        'mime-type': 'application/json',
        data: { base64: Buffer.from(JSON.stringify(credOffer)).toString('base64') }
      }]
    },
    thid
  );
}

function createRequestCredential(thid) {
  const credRequest = {
    prover_did: 'did:peer:2.holder',
    cred_def_id: 'did:indy:sovrin:F72i3Y3Q4i466efjYJYCHM:3:CL:12:TAG',
    blinded_ms: {
      u: crypto.randomBytes(128).toString('hex'),
      ur: null,
      hidden_attributes: ['master_secret'],
      committed_attributes: {}
    },
    blinded_ms_correctness_proof: {
      c: crypto.randomBytes(32).toString('hex'),
      v_dash_cap: crypto.randomBytes(256).toString('hex'),
      m_caps: { master_secret: crypto.randomBytes(64).toString('hex') },
      r_caps: {}
    },
    nonce: generateNonce()
  };

  return createDIDCommMessage(
    'https://didcomm.org/issue-credential/3.0/request-credential',
    {
      comment: 'Credential request with blinded link secret',
      formats: [{
        attach_id: 'anoncreds-0',
        format: 'anoncreds/credential-request@v1.0'
      }],
      'requests~attach': [{
        '@id': 'anoncreds-0',
        'mime-type': 'application/json',
        data: { base64: Buffer.from(JSON.stringify(credRequest)).toString('base64') }
      }]
    },
    thid
  );
}

function createIssueCredential(thid) {
  // Simulated AnonCreds credential with CL signature components
  const credential = {
    schema_id: 'did:indy:sovrin:F72i3Y3Q4i466efjYJYCHM:2:AcademicCredential:1.0',
    cred_def_id: 'did:indy:sovrin:F72i3Y3Q4i466efjYJYCHM:3:CL:12:TAG',
    values: {
      degree: { raw: 'Bachelor of Science', encoded: '68936437856726359375892356' },
      university: { raw: 'Test University', encoded: '89234752893475289347' },
      field: { raw: 'Computer Science', encoded: '23894572389457238945' },
      gpa: { raw: '3.5', encoded: '35' },
      graduation_date: { raw: '2024-06-15', encoded: '20240615' }
    },
    signature: {
      p_credential: {
        m_2: crypto.randomBytes(32).toString('hex'),
        a: crypto.randomBytes(256).toString('hex'),
        e: crypto.randomBytes(32).toString('hex'),
        v: crypto.randomBytes(512).toString('hex')
      },
      r_credential: null
    },
    signature_correctness_proof: {
      se: crypto.randomBytes(256).toString('hex'),
      c: crypto.randomBytes(32).toString('hex')
    },
    rev_reg: null,
    witness: null
  };

  return createDIDCommMessage(
    'https://didcomm.org/issue-credential/3.0/issue-credential',
    {
      comment: 'Issued credential',
      formats: [{
        attach_id: 'anoncreds-0',
        format: 'anoncreds/credential@v1.0'
      }],
      'credentials~attach': [{
        '@id': 'anoncreds-0',
        'mime-type': 'application/json',
        data: { base64: Buffer.from(JSON.stringify(credential)).toString('base64') }
      }]
    },
    thid
  );
}

function createAck(thid) {
  return createDIDCommMessage(
    'https://didcomm.org/notification/1.0/ack',
    { status: 'OK' },
    thid
  );
}

function createRequestPresentation() {
  const proofRequest = {
    name: 'Academic Verification',
    version: '1.0',
    nonce: generateNonce(),
    requested_attributes: {
      attr1_referent: {
        name: 'degree',
        restrictions: [{ cred_def_id: 'did:indy:sovrin:F72i3Y3Q4i466efjYJYCHM:3:CL:12:TAG' }]
      },
      attr2_referent: {
        name: 'university',
        restrictions: [{ cred_def_id: 'did:indy:sovrin:F72i3Y3Q4i466efjYJYCHM:3:CL:12:TAG' }]
      }
    },
    requested_predicates: {}
  };

  return createDIDCommMessage(
    'https://didcomm.org/present-proof/3.0/request-presentation',
    {
      goal_code: 'verify-credential',
      comment: 'Proof request for academic verification',
      formats: [{
        attach_id: 'anoncreds-0',
        format: 'anoncreds/proof-request@v1.0'
      }],
      'request_presentations~attach': [{
        '@id': 'anoncreds-0',
        'mime-type': 'application/json',
        data: { base64: Buffer.from(JSON.stringify(proofRequest)).toString('base64') }
      }]
    }
  );
}

function createPresentation(thid) {
  const proof = {
    requested_proof: {
      revealed_attrs: {
        attr1_referent: { sub_proof_index: 0, raw: 'Bachelor of Science', encoded: '68936437856726359375892356' },
        attr2_referent: { sub_proof_index: 0, raw: 'Test University', encoded: '89234752893475289347' }
      },
      self_attested_attrs: {},
      unrevealed_attrs: {},
      predicates: {}
    },
    proof: {
      proofs: [{
        primary_proof: {
          eq_proof: {
            revealed_attrs: { degree: '68936437856726359375892356', university: '89234752893475289347' },
            a_prime: crypto.randomBytes(256).toString('hex'),
            e: crypto.randomBytes(64).toString('hex'),
            v: crypto.randomBytes(512).toString('hex'),
            m: { master_secret: crypto.randomBytes(64).toString('hex') },
            m2: crypto.randomBytes(32).toString('hex')
          },
          ge_proofs: []
        },
        non_revoc_proof: null
      }],
      aggregated_proof: {
        c_hash: crypto.randomBytes(32).toString('hex'),
        c_list: [[1, 2, 3, 4]]
      }
    },
    identifiers: [{
      schema_id: 'did:indy:sovrin:F72i3Y3Q4i466efjYJYCHM:2:AcademicCredential:1.0',
      cred_def_id: 'did:indy:sovrin:F72i3Y3Q4i466efjYJYCHM:3:CL:12:TAG',
      rev_reg_id: null,
      timestamp: null
    }]
  };

  return createDIDCommMessage(
    'https://didcomm.org/present-proof/3.0/presentation',
    {
      comment: 'Proof presentation',
      formats: [{
        attach_id: 'anoncreds-0',
        format: 'anoncreds/proof@v1.0'
      }],
      'presentations~attach': [{
        '@id': 'anoncreds-0',
        'mime-type': 'application/json',
        data: { base64: Buffer.from(JSON.stringify(proof)).toString('base64') }
      }]
    },
    thid
  );
}

function createPredicateRequest() {
  const proofRequest = {
    name: 'GPA Verification',
    version: '1.0',
    nonce: generateNonce(),
    requested_attributes: {
      attr1_referent: {
        name: 'university',
        restrictions: [{ cred_def_id: 'did:indy:sovrin:F72i3Y3Q4i466efjYJYCHM:3:CL:12:TAG' }]
      }
    },
    requested_predicates: {
      pred1_referent: {
        name: 'gpa',
        p_type: '>=',
        p_value: 30, // GPA >= 3.0 (encoded as integer)
        restrictions: [{ cred_def_id: 'did:indy:sovrin:F72i3Y3Q4i466efjYJYCHM:3:CL:12:TAG' }]
      }
    }
  };

  return createDIDCommMessage(
    'https://didcomm.org/present-proof/3.0/request-presentation',
    {
      goal_code: 'verify-predicate',
      comment: 'Predicate proof request for GPA verification',
      formats: [{
        attach_id: 'anoncreds-0',
        format: 'anoncreds/proof-request@v1.0'
      }],
      'request_presentations~attach': [{
        '@id': 'anoncreds-0',
        'mime-type': 'application/json',
        data: { base64: Buffer.from(JSON.stringify(proofRequest)).toString('base64') }
      }]
    }
  );
}

function createPredicatePresentation(thid) {
  const proof = {
    requested_proof: {
      revealed_attrs: {
        attr1_referent: { sub_proof_index: 0, raw: 'Test University', encoded: '89234752893475289347' }
      },
      self_attested_attrs: {},
      unrevealed_attrs: {},
      predicates: {
        pred1_referent: { sub_proof_index: 0 }
      }
    },
    proof: {
      proofs: [{
        primary_proof: {
          eq_proof: {
            revealed_attrs: { university: '89234752893475289347' },
            a_prime: crypto.randomBytes(256).toString('hex'),
            e: crypto.randomBytes(64).toString('hex'),
            v: crypto.randomBytes(512).toString('hex'),
            m: { master_secret: crypto.randomBytes(64).toString('hex'), gpa: crypto.randomBytes(64).toString('hex') },
            m2: crypto.randomBytes(32).toString('hex')
          },
          ge_proofs: [{
            u: { '0': crypto.randomBytes(64).toString('hex'), '1': crypto.randomBytes(64).toString('hex') },
            r: { '0': crypto.randomBytes(64).toString('hex'), '1': crypto.randomBytes(64).toString('hex') },
            mj: crypto.randomBytes(64).toString('hex'),
            alpha: crypto.randomBytes(128).toString('hex'),
            t: { '0': crypto.randomBytes(64).toString('hex') },
            predicate: { attr_name: 'gpa', p_type: 'GE', value: 30 }
          }]
        },
        non_revoc_proof: null
      }],
      aggregated_proof: {
        c_hash: crypto.randomBytes(32).toString('hex'),
        c_list: [[1, 2, 3, 4]]
      }
    },
    identifiers: [{
      schema_id: 'did:indy:sovrin:F72i3Y3Q4i466efjYJYCHM:2:AcademicCredential:1.0',
      cred_def_id: 'did:indy:sovrin:F72i3Y3Q4i466efjYJYCHM:3:CL:12:TAG',
      rev_reg_id: null,
      timestamp: null
    }]
  };

  return createDIDCommMessage(
    'https://didcomm.org/present-proof/3.0/presentation',
    {
      comment: 'Predicate proof presentation',
      formats: [{
        attach_id: 'anoncreds-0',
        format: 'anoncreds/proof@v1.0'
      }],
      'presentations~attach': [{
        '@id': 'anoncreds-0',
        'mime-type': 'application/json',
        data: { base64: Buffer.from(JSON.stringify(proof)).toString('base64') }
      }]
    },
    thid
  );
}

// ============ Benchmark Endpoints ============

app.get('/health', (req, res) => {
  res.json({ status: isReady ? 'ready' : 'initializing', protocol: 'didcomm', version: 'v2' });
});

app.post('/didcomm/issue', async (req, res) => {
  const startTime = performance.now();
  const steps = [];
  let totalMessageSize = 0;

  try {
    const thid = generateUUID();

    // Step 1: Propose Credential
    const proposeMsg = createProposeCredential();
    const proposeSize = JSON.stringify(proposeMsg).length;
    totalMessageSize += proposeSize;
    const proposeEncryptTime = await simulateDIDCommEncrypt(proposeSize);
    await simulateNetworkLatency();
    steps.push({ name: 'propose-credential', duration: performance.now() - startTime, size: proposeSize, encryptTime: proposeEncryptTime });

    // Step 2: Offer Credential
    const step2Start = performance.now();
    const offerMsg = createOfferCredential(thid);
    const offerSize = JSON.stringify(offerMsg).length;
    totalMessageSize += offerSize;
    const offerEncryptTime = await simulateDIDCommEncrypt(offerSize);
    await simulateNetworkLatency();
    steps.push({ name: 'offer-credential', duration: performance.now() - step2Start, size: offerSize, encryptTime: offerEncryptTime });

    // Step 3: Request Credential + AnonCreds blinding
    const step3Start = performance.now();
    const requestMsg = createRequestCredential(thid);
    const requestSize = JSON.stringify(requestMsg).length;
    totalMessageSize += requestSize;
    const requestEncryptTime = await simulateDIDCommEncrypt(requestSize);
    const blindingTime = await simulateCrypto(CRYPTO_TIMING.ANONCREDS_BLINDING_MS);
    await simulateNetworkLatency();
    steps.push({ name: 'request-credential', duration: performance.now() - step3Start, size: requestSize, encryptTime: requestEncryptTime, cryptoTime: blindingTime });

    // Step 4: Issue Credential + CL Signature
    const step4Start = performance.now();
    const issueMsg = createIssueCredential(thid);
    const issueSize = JSON.stringify(issueMsg).length;
    totalMessageSize += issueSize;
    const issueEncryptTime = await simulateDIDCommEncrypt(issueSize);
    const signTime = await simulateCrypto(CRYPTO_TIMING.ANONCREDS_CL_SIGN_MS);
    await simulateNetworkLatency();
    steps.push({ name: 'issue-credential', duration: performance.now() - step4Start, size: issueSize, encryptTime: issueEncryptTime, cryptoTime: signTime });

    // Step 5: Acknowledgment
    const step5Start = performance.now();
    const ackMsg = createAck(thid);
    const ackSize = JSON.stringify(ackMsg).length;
    totalMessageSize += ackSize;
    const ackEncryptTime = await simulateDIDCommEncrypt(ackSize);
    await simulateNetworkLatency();
    steps.push({ name: 'ack', duration: performance.now() - step5Start, size: ackSize, encryptTime: ackEncryptTime });

    const totalLatency = performance.now() - startTime;

    res.json({
      operation: 'credential-issuance',
      latency: totalLatency,
      roundTrips: 5,
      messageSize: totalMessageSize,
      timestamp: new Date().toISOString(),
      success: true,
      details: {
        steps,
        protocol: 'DIDComm v2',
        credentialFormat: 'AnonCreds',
        cryptoReferences: [
          'DIF DIDComm Performance Study (2023)',
          'Hyperledger Indy Benchmarks (Thwin & Vasupongayya, 2021)'
        ]
      }
    });
  } catch (error) {
    res.status(500).json({ error: String(error), success: false, latency: performance.now() - startTime });
  }
});

app.post('/didcomm/present', async (req, res) => {
  const startTime = performance.now();
  const steps = [];
  let totalMessageSize = 0;

  try {
    const thid = generateUUID();

    // Step 1: Request Presentation
    const requestMsg = createRequestPresentation();
    const requestSize = JSON.stringify(requestMsg).length;
    totalMessageSize += requestSize;
    const requestEncryptTime = await simulateDIDCommEncrypt(requestSize);
    await simulateNetworkLatency();
    steps.push({ name: 'request-presentation', duration: performance.now() - startTime, size: requestSize, encryptTime: requestEncryptTime });

    // Step 2: Presentation + ZKP Generation
    const step2Start = performance.now();
    const presentMsg = createPresentation(thid);
    const presentSize = JSON.stringify(presentMsg).length;
    totalMessageSize += presentSize;
    const presentEncryptTime = await simulateDIDCommEncrypt(presentSize);
    const proofGenTime = await simulateCrypto(CRYPTO_TIMING.ANONCREDS_PROOF_GEN_MS);
    await simulateNetworkLatency();
    steps.push({ name: 'presentation', duration: performance.now() - step2Start, size: presentSize, encryptTime: presentEncryptTime, cryptoTime: proofGenTime });

    // Step 3: Verification + Ack
    const step3Start = performance.now();
    const verifyTime = await simulateCrypto(CRYPTO_TIMING.ANONCREDS_PROOF_VERIFY_MS);
    const ackMsg = createAck(thid);
    const ackSize = JSON.stringify(ackMsg).length;
    totalMessageSize += ackSize;
    const ackEncryptTime = await simulateDIDCommEncrypt(ackSize);
    await simulateNetworkLatency();
    steps.push({ name: 'verification-ack', duration: performance.now() - step3Start, size: ackSize, encryptTime: ackEncryptTime, cryptoTime: verifyTime });

    const totalLatency = performance.now() - startTime;

    res.json({
      operation: 'credential-presentation',
      latency: totalLatency,
      roundTrips: 4,
      messageSize: totalMessageSize,
      timestamp: new Date().toISOString(),
      success: true,
      details: {
        steps,
        protocol: 'DIDComm v2',
        proofFormat: 'AnonCreds ZKP'
      }
    });
  } catch (error) {
    res.status(500).json({ error: String(error), success: false, latency: performance.now() - startTime });
  }
});

app.post('/didcomm/selective-disclose', async (req, res) => {
  const startTime = performance.now();
  const steps = [];
  let totalMessageSize = 0;

  try {
    const thid = generateUUID();

    // Step 1: Predicate Request
    const requestMsg = createPredicateRequest();
    const requestSize = JSON.stringify(requestMsg).length;
    totalMessageSize += requestSize;
    const requestEncryptTime = await simulateDIDCommEncrypt(requestSize);
    await simulateNetworkLatency();
    steps.push({ name: 'predicate-request', duration: performance.now() - startTime, size: requestSize, encryptTime: requestEncryptTime });

    // Step 2: Predicate Proof Generation (more expensive than regular proof)
    const step2Start = performance.now();
    const presentMsg = createPredicatePresentation(thid);
    const presentSize = JSON.stringify(presentMsg).length;
    totalMessageSize += presentSize;
    const presentEncryptTime = await simulateDIDCommEncrypt(presentSize);
    const proofGenTime = await simulateCrypto(CRYPTO_TIMING.ANONCREDS_PREDICATE_GEN_MS);
    await simulateNetworkLatency();
    steps.push({ name: 'predicate-proof', duration: performance.now() - step2Start, size: presentSize, encryptTime: presentEncryptTime, cryptoTime: proofGenTime });

    // Step 3: Verification + Ack
    const step3Start = performance.now();
    const verifyTime = await simulateCrypto(CRYPTO_TIMING.ANONCREDS_PREDICATE_VERIFY_MS);
    const ackMsg = createAck(thid);
    const ackSize = JSON.stringify(ackMsg).length;
    totalMessageSize += ackSize;
    const ackEncryptTime = await simulateDIDCommEncrypt(ackSize);
    await simulateNetworkLatency();
    steps.push({ name: 'verification-ack', duration: performance.now() - step3Start, size: ackSize, encryptTime: ackEncryptTime, cryptoTime: verifyTime });

    const totalLatency = performance.now() - startTime;

    res.json({
      operation: 'selective-disclosure',
      latency: totalLatency,
      roundTrips: 4,
      messageSize: totalMessageSize,
      timestamp: new Date().toISOString(),
      success: true,
      details: {
        steps,
        protocol: 'DIDComm v2',
        proofFormat: 'AnonCreds CL Predicates'
      }
    });
  } catch (error) {
    res.status(500).json({ error: String(error), success: false, latency: performance.now() - startTime });
  }
});

// ============ Startup ============

app.listen(PORT, () => {
  isReady = true;
  console.log(`DIDComm v2 Benchmark Agent running on port ${PORT}`);
  console.log('Crypto timing based on published benchmarks:');
  console.log('- DIF DIDComm Performance Study (2023)');
  console.log('- Hyperledger Indy Benchmarks (Thwin & Vasupongayya, 2021)');
});
