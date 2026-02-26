/**
 * Concurrent Client Benchmark
 * Tests scalability under varying client loads
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const config = {
  didcommEndpoint: process.env.DIDCOMM_ENDPOINT || 'http://localhost:3100',
  openid4vcEndpoint: process.env.OPENID4VC_ENDPOINT || 'http://localhost:4100',
  iterationsPerClient: 50,
  clientCounts: [1, 5, 10, 20],
  outputDir: './benchmark-results'
};

function httpPost(url) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - start;
        try {
          const parsed = JSON.parse(data);
          resolve({ ...parsed, totalLatency: latency });
        } catch (e) {
          reject(new Error(`Parse error: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.write('{}');
    req.end();
  });
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runConcurrentTest(protocol, endpoint, path, clientCount, iterationsPerClient) {
  const allLatencies = [];
  const errors = [];
  const startTime = Date.now();

  // Create client promises
  const clientPromises = [];
  for (let c = 0; c < clientCount; c++) {
    clientPromises.push((async () => {
      const clientLatencies = [];
      for (let i = 0; i < iterationsPerClient; i++) {
        try {
          const result = await httpPost(`${endpoint}${path}`);
          clientLatencies.push(result.totalLatency);
        } catch (e) {
          errors.push(e.message);
        }
      }
      return clientLatencies;
    })());
  }

  // Run all clients concurrently
  const results = await Promise.all(clientPromises);
  results.forEach(latencies => allLatencies.push(...latencies));

  const totalTime = Date.now() - startTime;
  const throughput = (allLatencies.length / (totalTime / 1000)).toFixed(2);

  return {
    protocol,
    clientCount,
    iterationsPerClient,
    totalRequests: clientCount * iterationsPerClient,
    successfulRequests: allLatencies.length,
    errors: errors.length,
    totalTimeMs: totalTime,
    throughput: parseFloat(throughput),
    latency: {
      mean: mean(allLatencies).toFixed(2),
      p50: percentile(allLatencies, 50).toFixed(2),
      p95: percentile(allLatencies, 95).toFixed(2),
      p99: percentile(allLatencies, 99).toFixed(2)
    }
  };
}

async function waitForAgents() {
  console.log('Checking agent availability...');

  const checkHealth = async (url, name) => {
    try {
      await new Promise((resolve, reject) => {
        http.get(`${url}/health`, (res) => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`Status ${res.statusCode}`));
        }).on('error', reject);
      });
      console.log(`  ${name}: OK`);
      return true;
    } catch (e) {
      console.log(`  ${name}: FAILED - ${e.message}`);
      return false;
    }
  };

  const didcommOk = await checkHealth(config.didcommEndpoint, 'DIDComm');
  const openidOk = await checkHealth(config.openid4vcEndpoint, 'OpenID4VC');

  if (!didcommOk || !openidOk) {
    console.error('\nAgents not available. Start them with: docker compose up -d');
    process.exit(1);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('CONCURRENT CLIENT BENCHMARK');
  console.log('DIDComm vs OpenID4VC Scalability Analysis');
  console.log('='.repeat(60));
  console.log(`\nConfiguration:`);
  console.log(`  Iterations per client: ${config.iterationsPerClient}`);
  console.log(`  Client counts: ${config.clientCounts.join(', ')}`);

  await waitForAgents();

  const allResults = {
    didcomm: { issuance: [], presentation: [] },
    openid4vc: { issuance: [], presentation: [] }
  };

  for (const clientCount of config.clientCounts) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TESTING WITH ${clientCount} CONCURRENT CLIENT(S)`);
    console.log('='.repeat(60));

    // DIDComm Issuance
    console.log(`\n[DIDComm] Issuance (${clientCount} clients)...`);
    const di = await runConcurrentTest('DIDComm', config.didcommEndpoint, '/didcomm/issue', clientCount, config.iterationsPerClient);
    allResults.didcomm.issuance.push(di);
    console.log(`  Throughput: ${di.throughput} ops/sec, Mean: ${di.latency.mean}ms, P95: ${di.latency.p95}ms`);

    // OpenID4VC Issuance
    console.log(`[OpenID4VC] Issuance (${clientCount} clients)...`);
    const oi = await runConcurrentTest('OpenID4VC', config.openid4vcEndpoint, '/openid4vc/issue', clientCount, config.iterationsPerClient);
    allResults.openid4vc.issuance.push(oi);
    console.log(`  Throughput: ${oi.throughput} ops/sec, Mean: ${oi.latency.mean}ms, P95: ${oi.latency.p95}ms`);

    // DIDComm Presentation
    console.log(`[DIDComm] Presentation (${clientCount} clients)...`);
    const dp = await runConcurrentTest('DIDComm', config.didcommEndpoint, '/didcomm/present', clientCount, config.iterationsPerClient);
    allResults.didcomm.presentation.push(dp);
    console.log(`  Throughput: ${dp.throughput} ops/sec, Mean: ${dp.latency.mean}ms, P95: ${dp.latency.p95}ms`);

    // OpenID4VC Presentation
    console.log(`[OpenID4VC] Presentation (${clientCount} clients)...`);
    const op = await runConcurrentTest('OpenID4VC', config.openid4vcEndpoint, '/openid4vc/present', clientCount, config.iterationsPerClient);
    allResults.openid4vc.presentation.push(op);
    console.log(`  Throughput: ${op.throughput} ops/sec, Mean: ${op.latency.mean}ms, P95: ${op.latency.p95}ms`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SCALABILITY SUMMARY');
  console.log('='.repeat(60));

  console.log('\n--- Issuance Throughput (ops/sec) ---');
  console.log('| Clients | DIDComm | OpenID4VC | Ratio |');
  console.log('|---------|---------|-----------|-------|');
  for (let i = 0; i < config.clientCounts.length; i++) {
    const di = allResults.didcomm.issuance[i];
    const oi = allResults.openid4vc.issuance[i];
    const ratio = (oi.throughput / di.throughput).toFixed(2);
    console.log(`| ${di.clientCount.toString().padStart(7)} | ${di.throughput.toString().padStart(7)} | ${oi.throughput.toString().padStart(9)} | ${ratio.padStart(5)}x |`);
  }

  console.log('\n--- Presentation Throughput (ops/sec) ---');
  console.log('| Clients | DIDComm | OpenID4VC | Ratio |');
  console.log('|---------|---------|-----------|-------|');
  for (let i = 0; i < config.clientCounts.length; i++) {
    const dp = allResults.didcomm.presentation[i];
    const op = allResults.openid4vc.presentation[i];
    const ratio = (op.throughput / dp.throughput).toFixed(2);
    console.log(`| ${dp.clientCount.toString().padStart(7)} | ${dp.throughput.toString().padStart(7)} | ${op.throughput.toString().padStart(9)} | ${ratio.padStart(5)}x |`);
  }

  console.log('\n--- Latency Under Load (P95) ---');
  console.log('| Clients | DIDComm Issue | OID4VC Issue | DIDComm Pres | OID4VC Pres |');
  console.log('|---------|---------------|--------------|--------------|-------------|');
  for (let i = 0; i < config.clientCounts.length; i++) {
    const di = allResults.didcomm.issuance[i];
    const oi = allResults.openid4vc.issuance[i];
    const dp = allResults.didcomm.presentation[i];
    const op = allResults.openid4vc.presentation[i];
    console.log(`| ${di.clientCount.toString().padStart(7)} | ${(di.latency.p95 + 'ms').padStart(13)} | ${(oi.latency.p95 + 'ms').padStart(12)} | ${(dp.latency.p95 + 'ms').padStart(12)} | ${(op.latency.p95 + 'ms').padStart(11)} |`);
  }

  // Export results
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }
  const outputPath = path.join(config.outputDir, `concurrent-benchmark-${Date.now()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    configuration: config,
    results: allResults
  }, null, 2));
  console.log(`\nResults exported to: ${outputPath}`);
}

main().catch(console.error);
