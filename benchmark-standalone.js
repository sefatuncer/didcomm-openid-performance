/**
 * Standalone Benchmark Simulation
 * DIDComm vs OpenID4VC Protocol Comparison
 *
 * Bu script native modüller olmadan çalışır.
 */

const fs = require('fs');
const path = require('path');

const config = {
  iterations: 1000,
  warmupIterations: 100,
  outputDir: './benchmark-results'
};

function calculateStatistics(values) {
  if (values.length === 0) return { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const median = values.length % 2 === 0
    ? (sorted[values.length / 2 - 1] + sorted[values.length / 2]) / 2
    : sorted[Math.floor(values.length / 2)];
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return { min: sorted[0].toFixed(2), max: sorted[sorted.length - 1].toFixed(2), mean: mean.toFixed(2), median: median.toFixed(2), stdDev: stdDev.toFixed(2) };
}

function calculatePercentiles(values) {
  if (values.length === 0) return { p50: 0, p90: 0, p95: 0, p99: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p) => sorted[Math.ceil((p / 100) * sorted.length) - 1];
  return { p50: percentile(50).toFixed(2), p90: percentile(90).toFixed(2), p95: percentile(95).toFixed(2), p99: percentile(99).toFixed(2) };
}

function simulateDIDCommIssuance() {
  const baseLatency = 150, variance = 100, processingOverhead = 50;
  return {
    e2eLatency: baseLatency + (Math.random() * variance) + processingOverhead,
    roundTrips: 5,
    messageSize: 2048 + Math.floor(Math.random() * 512)
  };
}

function simulateOpenID4VCIssuance() {
  const baseLatency = 100, variance = 80, processingOverhead = 30;
  return {
    e2eLatency: baseLatency + (Math.random() * variance) + processingOverhead,
    roundTrips: 4,
    messageSize: 1024 + Math.floor(Math.random() * 256)
  };
}

function simulateDIDCommPresentation() {
  const baseLatency = 120, variance = 80;
  return {
    e2eLatency: baseLatency + (Math.random() * variance),
    roundTrips: 4,
    messageSize: 3072 + Math.floor(Math.random() * 1024)
  };
}

function simulateOpenID4VCPresentation() {
  const baseLatency = 80, variance = 60;
  return {
    e2eLatency: baseLatency + (Math.random() * variance),
    roundTrips: 2,
    messageSize: 1536 + Math.floor(Math.random() * 512)
  };
}

function simulateDIDCommSelectiveDisclosure() {
  const baseLatency = 180, variance = 120;
  return {
    e2eLatency: baseLatency + (Math.random() * variance),
    roundTrips: 4,
    messageSize: 4096 + Math.floor(Math.random() * 1024)
  };
}

function simulateOpenID4VCSelectiveDisclosure() {
  const baseLatency = 100, variance = 60;
  return {
    e2eLatency: baseLatency + (Math.random() * variance),
    roundTrips: 2,
    messageSize: 2048 + Math.floor(Math.random() * 512)
  };
}

function runBenchmark(name, simulationFn, iterations) {
  console.log(`\n  Running ${name} (${iterations} iterations)...`);
  const results = [];
  for (let i = 0; i < iterations; i++) {
    results.push(simulationFn());
    if ((i + 1) % 200 === 0) process.stdout.write(`    Progress: ${i + 1}/${iterations}\r`);
  }
  console.log(`    Progress: ${iterations}/${iterations} - Done`);
  const latencies = results.map(r => r.e2eLatency);
  const stats = calculateStatistics(latencies);
  const percentiles = calculatePercentiles(latencies);
  const avgRoundTrips = results.reduce((a, b) => a + b.roundTrips, 0) / results.length;
  const avgMessageSize = results.reduce((a, b) => a + b.messageSize, 0) / results.length;
  return { name, iterations, statistics: stats, percentiles, avgRoundTrips: avgRoundTrips.toFixed(1), avgMessageSize: Math.round(avgMessageSize), rawLatencies: latencies };
}

function printResults(results) {
  console.log(`\n  ${results.name}:`);
  console.log(`    Mean Latency:  ${results.statistics.mean}ms`);
  console.log(`    Median:        ${results.statistics.median}ms`);
  console.log(`    P95:           ${results.percentiles.p95}ms`);
  console.log(`    P99:           ${results.percentiles.p99}ms`);
  console.log(`    Avg Round-Trips: ${results.avgRoundTrips}`);
  console.log(`    Avg Message Size: ${results.avgMessageSize} bytes`);
}

function compareResults(didcommResults, openid4vcResults, scenario) {
  const didcommMean = parseFloat(didcommResults.statistics.mean);
  const openid4vcMean = parseFloat(openid4vcResults.statistics.mean);
  const diff = didcommMean - openid4vcMean;
  const diffPercent = ((diff / openid4vcMean) * 100).toFixed(1);
  console.log(`\n  COMPARISON - ${scenario}:`);
  console.log(`    Latency Difference: ${diff.toFixed(2)}ms (${diffPercent}%)`);
  console.log(`    Winner: ${diff > 0 ? 'OpenID4VC' : 'DIDComm'}`);
  return { scenario, latencyDiff: diff.toFixed(2), latencyDiffPercent: diffPercent, winner: diff > 0 ? 'openid4vc' : 'didcomm' };
}

function exportResults(allResults, comparisons) {
  if (!fs.existsSync(config.outputDir)) fs.mkdirSync(config.outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const summary = { timestamp: new Date().toISOString(), configuration: config, scenarios: allResults.map(r => ({ name: r.name, statistics: r.statistics, percentiles: r.percentiles, avgRoundTrips: r.avgRoundTrips, avgMessageSize: r.avgMessageSize })), comparisons };
  const summaryPath = path.join(config.outputDir, `benchmark-summary-${timestamp}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\n  Summary exported: ${summaryPath}`);
  const csvHeaders = 'scenario,protocol,mean_latency_ms,p95_latency_ms,avg_round_trips,avg_message_size_bytes';
  const csvRows = allResults.map(r => {
    const protocol = r.name.includes('DIDComm') ? 'didcomm' : 'openid4vc';
    const scenario = r.name.split(' - ')[0];
    return `${scenario},${protocol},${r.statistics.mean},${r.percentiles.p95},${r.avgRoundTrips},${r.avgMessageSize}`;
  });
  const csvPath = path.join(config.outputDir, `benchmark-results-${timestamp}.csv`);
  fs.writeFileSync(csvPath, [csvHeaders, ...csvRows].join('\n'));
  console.log(`  CSV exported: ${csvPath}`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('HYBRID SSI BENCHMARK - DIDComm vs OpenID4VC');
  console.log('='.repeat(60));
  const allResults = [], comparisons = [];

  console.log('\n' + '-'.repeat(60));
  console.log('SCENARIO 1: CREDENTIAL ISSUANCE');
  const di = runBenchmark('Issuance - DIDComm', simulateDIDCommIssuance, config.iterations);
  const oi = runBenchmark('Issuance - OpenID4VC', simulateOpenID4VCIssuance, config.iterations);
  printResults(di); printResults(oi);
  comparisons.push(compareResults(di, oi, 'Credential Issuance'));
  allResults.push(di, oi);

  console.log('\n' + '-'.repeat(60));
  console.log('SCENARIO 2: CREDENTIAL PRESENTATION');
  const dp = runBenchmark('Presentation - DIDComm', simulateDIDCommPresentation, config.iterations);
  const op = runBenchmark('Presentation - OpenID4VC', simulateOpenID4VCPresentation, config.iterations);
  printResults(dp); printResults(op);
  comparisons.push(compareResults(dp, op, 'Credential Presentation'));
  allResults.push(dp, op);

  console.log('\n' + '-'.repeat(60));
  console.log('SCENARIO 3: SELECTIVE DISCLOSURE');
  const ds = runBenchmark('Selective Disclosure - DIDComm', simulateDIDCommSelectiveDisclosure, config.iterations);
  const os = runBenchmark('Selective Disclosure - OpenID4VC', simulateOpenID4VCSelectiveDisclosure, config.iterations);
  printResults(ds); printResults(os);
  comparisons.push(compareResults(ds, os, 'Selective Disclosure'));
  allResults.push(ds, os);

  console.log('\n' + '-'.repeat(60));
  exportResults(allResults, comparisons);

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('  | Scenario               | Winner    | Diff        |');
  console.log('  ' + '-'.repeat(54));
  comparisons.forEach(c => console.log(`  | ${c.scenario.padEnd(22)} | ${c.winner.toUpperCase().padEnd(9)} | ${c.latencyDiff}ms |`));
  console.log('='.repeat(60));
}

main().catch(console.error);
