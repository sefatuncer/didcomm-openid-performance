/**
 * Docker Benchmark Runner
 * Runs benchmarks against DIDComm and OpenID4VC agents in Docker
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const config = {
  iterations: parseInt(process.env.ITERATIONS) || 1000,
  warmupIterations: parseInt(process.env.WARMUP_ITERATIONS) || 100,
  didcommEndpoint: process.env.DIDCOMM_ENDPOINT || 'http://localhost:3000',
  openid4vcEndpoint: process.env.OPENID4VC_ENDPOINT || 'http://localhost:4000',
  outputDir: process.env.OUTPUT_DIR || '/results'
};

console.log('Benchmark Configuration:', config);

function httpPost(url) {
  return new Promise((resolve, reject) => {
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
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Parse error: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write('{}');
    req.end();
  });
}

function calculateStats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1];
  const p99 = sorted[Math.ceil(0.99 * sorted.length) - 1];
  const variance = values.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return {
    count: values.length,
    min: sorted[0].toFixed(2),
    max: sorted[sorted.length - 1].toFixed(2),
    mean: mean.toFixed(2),
    median: median.toFixed(2),
    p95: p95.toFixed(2),
    p99: p99.toFixed(2),
    stdDev: stdDev.toFixed(2)
  };
}

async function runScenario(name, didcommPath, openid4vcPath, iterations, warmup) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SCENARIO: ${name}`);
  console.log(`${'='.repeat(60)}`);

  // Warmup
  console.log(`Warming up (${warmup} iterations)...`);
  for (let i = 0; i < warmup; i++) {
    await Promise.all([
      httpPost(`${config.didcommEndpoint}${didcommPath}`),
      httpPost(`${config.openid4vcEndpoint}${openid4vcPath}`)
    ]);
  }

  // DIDComm benchmark
  console.log(`Running DIDComm benchmark (${iterations} iterations)...`);
  const didcommResults = [];
  for (let i = 0; i < iterations; i++) {
    const result = await httpPost(`${config.didcommEndpoint}${didcommPath}`);
    didcommResults.push(result);
    if ((i + 1) % 200 === 0) process.stdout.write(`  Progress: ${i + 1}/${iterations}\r`);
  }
  console.log(`  Progress: ${iterations}/${iterations} - Done`);

  // OpenID4VC benchmark
  console.log(`Running OpenID4VC benchmark (${iterations} iterations)...`);
  const openid4vcResults = [];
  for (let i = 0; i < iterations; i++) {
    const result = await httpPost(`${config.openid4vcEndpoint}${openid4vcPath}`);
    openid4vcResults.push(result);
    if ((i + 1) % 200 === 0) process.stdout.write(`  Progress: ${i + 1}/${iterations}\r`);
  }
  console.log(`  Progress: ${iterations}/${iterations} - Done`);

  // Calculate statistics
  const didcommLatencies = didcommResults.map(r => r.latency);
  const openid4vcLatencies = openid4vcResults.map(r => r.latency);

  const didcommStats = calculateStats(didcommLatencies);
  const openid4vcStats = calculateStats(openid4vcLatencies);

  // Calculate averages for other metrics
  const didcommAvgRoundTrips = didcommResults.reduce((a, r) => a + r.roundTrips, 0) / iterations;
  const openid4vcAvgRoundTrips = openid4vcResults.reduce((a, r) => a + r.roundTrips, 0) / iterations;
  const didcommAvgMsgSize = didcommResults.reduce((a, r) => a + r.messageSize, 0) / iterations;
  const openid4vcAvgMsgSize = openid4vcResults.reduce((a, r) => a + r.messageSize, 0) / iterations;

  // Print results
  console.log(`\nDIDComm Results:`);
  console.log(`  Mean Latency: ${didcommStats.mean}ms`);
  console.log(`  Median: ${didcommStats.median}ms`);
  console.log(`  P95: ${didcommStats.p95}ms | P99: ${didcommStats.p99}ms`);
  console.log(`  Avg Round-Trips: ${didcommAvgRoundTrips.toFixed(1)}`);
  console.log(`  Avg Message Size: ${Math.round(didcommAvgMsgSize)} bytes`);

  console.log(`\nOpenID4VC Results:`);
  console.log(`  Mean Latency: ${openid4vcStats.mean}ms`);
  console.log(`  Median: ${openid4vcStats.median}ms`);
  console.log(`  P95: ${openid4vcStats.p95}ms | P99: ${openid4vcStats.p99}ms`);
  console.log(`  Avg Round-Trips: ${openid4vcAvgRoundTrips.toFixed(1)}`);
  console.log(`  Avg Message Size: ${Math.round(openid4vcAvgMsgSize)} bytes`);

  // Comparison
  const latencyDiff = parseFloat(didcommStats.mean) - parseFloat(openid4vcStats.mean);
  const latencyDiffPercent = (latencyDiff / parseFloat(openid4vcStats.mean) * 100).toFixed(1);
  const winner = latencyDiff > 0 ? 'OpenID4VC' : 'DIDComm';

  console.log(`\nComparison:`);
  console.log(`  Latency Difference: ${latencyDiff.toFixed(2)}ms (${latencyDiffPercent}%)`);
  console.log(`  Winner: ${winner}`);

  return {
    scenario: name,
    didcomm: {
      stats: didcommStats,
      avgRoundTrips: didcommAvgRoundTrips.toFixed(1),
      avgMessageSize: Math.round(didcommAvgMsgSize)
    },
    openid4vc: {
      stats: openid4vcStats,
      avgRoundTrips: openid4vcAvgRoundTrips.toFixed(1),
      avgMessageSize: Math.round(openid4vcAvgMsgSize)
    },
    comparison: {
      latencyDiff: latencyDiff.toFixed(2),
      latencyDiffPercent,
      winner
    }
  };
}

async function waitForAgents() {
  console.log('Waiting for agents to be ready...');

  const checkHealth = async (url, name) => {
    for (let i = 0; i < 30; i++) {
      try {
        const urlObj = new URL(url);
        await new Promise((resolve, reject) => {
          http.get(`${url}/health`, (res) => {
            if (res.statusCode === 200) resolve();
            else reject();
          }).on('error', reject);
        });
        console.log(`  ${name}: Ready`);
        return true;
      } catch {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    throw new Error(`${name} not ready after 60s`);
  };

  await checkHealth(config.didcommEndpoint, 'DIDComm Agent');
  await checkHealth(config.openid4vcEndpoint, 'OpenID4VC Agent');
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('DOCKER BENCHMARK: DIDComm vs OpenID4VC');
  console.log('='.repeat(60));
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Environment: Docker Compose`);

  await waitForAgents();

  const results = [];

  // Scenario 1: Credential Issuance
  results.push(await runScenario(
    'Credential Issuance',
    '/didcomm/issue',
    '/openid4vc/issue',
    config.iterations,
    config.warmupIterations
  ));

  // Scenario 2: Credential Presentation
  results.push(await runScenario(
    'Credential Presentation',
    '/didcomm/present',
    '/openid4vc/present',
    config.iterations,
    config.warmupIterations
  ));

  // Scenario 3: Selective Disclosure
  results.push(await runScenario(
    'Selective Disclosure',
    '/didcomm/selective-disclose',
    '/openid4vc/selective-disclose',
    config.iterations,
    config.warmupIterations
  ));

  // Final Summary
  console.log('\n' + '='.repeat(60));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(60));
  console.log('\n| Scenario              | DIDComm   | OpenID4VC | Diff    | Winner    |');
  console.log('|' + '-'.repeat(21) + '|' + '-'.repeat(11) + '|' + '-'.repeat(11) + '|' + '-'.repeat(9) + '|' + '-'.repeat(11) + '|');

  results.forEach(r => {
    const scenario = r.scenario.padEnd(20);
    const didcomm = (r.didcomm.stats.mean + 'ms').padEnd(10);
    const openid4vc = (r.openid4vc.stats.mean + 'ms').padEnd(10);
    const diff = (r.comparison.latencyDiff + 'ms').padEnd(8);
    const winner = r.comparison.winner.padEnd(10);
    console.log(`| ${scenario}| ${didcomm}| ${openid4vc}| ${diff}| ${winner}|`);
  });

  // Export results
  const output = {
    timestamp: new Date().toISOString(),
    environment: 'Docker Compose',
    configuration: config,
    results
  };

  try {
    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
    }
    const filename = `benchmark-${Date.now()}.json`;
    fs.writeFileSync(path.join(config.outputDir, filename), JSON.stringify(output, null, 2));
    console.log(`\nResults exported to: ${config.outputDir}/${filename}`);
  } catch (e) {
    console.log('\nResults (JSON):');
    console.log(JSON.stringify(output, null, 2));
  }

  console.log('\n' + '='.repeat(60));
  console.log('BENCHMARK COMPLETE');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
