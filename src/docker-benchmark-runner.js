/**
 * Scientific Benchmark Runner
 *
 * Runs controlled benchmarks against DIDComm and OpenID4VC agents
 * with proper statistical methodology for academic publication.
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

console.log('='.repeat(70));
console.log('SCIENTIFIC BENCHMARK: DIDComm v2 vs OpenID4VC');
console.log('='.repeat(70));
console.log('Configuration:', JSON.stringify(config, null, 2));
console.log('Timestamp:', new Date().toISOString());

function httpPost(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
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
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write('{}');
    req.end();
  });
}

function calculateStatistics(values) {
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);

  // Central tendency
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];

  // Dispersion
  const variance = values.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / (n - 1); // Sample variance
  const stdDev = Math.sqrt(variance);
  const cv = (stdDev / mean) * 100; // Coefficient of variation

  // Percentiles (interpolation method)
  const percentile = (p) => {
    const index = (p / 100) * (n - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  };

  // Confidence interval (95%)
  const tValue = 1.962; // t-value for 95% CI with n > 100
  const standardError = stdDev / Math.sqrt(n);
  const ci95Lower = mean - tValue * standardError;
  const ci95Upper = mean + tValue * standardError;

  // IQR for outlier detection
  const q1 = percentile(25);
  const q3 = percentile(75);
  const iqr = q3 - q1;
  const outlierLower = q1 - 1.5 * iqr;
  const outlierUpper = q3 + 1.5 * iqr;
  const outliers = values.filter(v => v < outlierLower || v > outlierUpper).length;

  return {
    n,
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    median,
    stdDev,
    variance,
    cv,
    p5: percentile(5),
    p25: q1,
    p50: median,
    p75: q3,
    p90: percentile(90),
    p95: percentile(95),
    p99: percentile(99),
    ci95: { lower: ci95Lower, upper: ci95Upper },
    standardError,
    iqr,
    outliers,
    outlierPercentage: (outliers / n) * 100
  };
}

function welchTTest(group1, group2) {
  const n1 = group1.length;
  const n2 = group2.length;
  const mean1 = group1.reduce((a, b) => a + b, 0) / n1;
  const mean2 = group2.reduce((a, b) => a + b, 0) / n2;
  const var1 = group1.reduce((a, v) => a + Math.pow(v - mean1, 2), 0) / (n1 - 1);
  const var2 = group2.reduce((a, v) => a + Math.pow(v - mean2, 2), 0) / (n2 - 1);

  const se = Math.sqrt(var1 / n1 + var2 / n2);
  const t = (mean1 - mean2) / se;

  // Welch-Satterthwaite degrees of freedom
  const df = Math.pow(var1 / n1 + var2 / n2, 2) /
    (Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1));

  // Cohen's d effect size
  const pooledStdDev = Math.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2));
  const cohensD = (mean1 - mean2) / pooledStdDev;

  // Effect size interpretation
  let effectInterpretation = 'negligible';
  const absCohensD = Math.abs(cohensD);
  if (absCohensD >= 0.2) effectInterpretation = 'small';
  if (absCohensD >= 0.5) effectInterpretation = 'medium';
  if (absCohensD >= 0.8) effectInterpretation = 'large';
  if (absCohensD >= 1.2) effectInterpretation = 'very large';

  return {
    t: t,
    df: df,
    cohensD: cohensD,
    effectInterpretation,
    meanDifference: mean1 - mean2,
    percentDifference: ((mean1 - mean2) / mean2) * 100
  };
}

async function runScenario(name, didcommPath, openid4vcPath) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`SCENARIO: ${name}`);
  console.log(`${'='.repeat(70)}`);

  // Warmup phase
  console.log(`\nWarmup phase (${config.warmupIterations} iterations)...`);
  for (let i = 0; i < config.warmupIterations; i++) {
    try {
      await Promise.all([
        httpPost(`${config.didcommEndpoint}${didcommPath}`),
        httpPost(`${config.openid4vcEndpoint}${openid4vcPath}`)
      ]);
    } catch (e) {
      // Ignore warmup errors
    }
    if ((i + 1) % 20 === 0) process.stdout.write(`  Warmup: ${i + 1}/${config.warmupIterations}\r`);
  }
  console.log(`  Warmup: ${config.warmupIterations}/${config.warmupIterations} - Complete`);

  // Cooldown
  await new Promise(r => setTimeout(r, 1000));

  // DIDComm benchmark
  console.log(`\nDIDComm benchmark (${config.iterations} iterations)...`);
  const didcommResults = [];
  const didcommRawLatencies = [];
  let didcommErrors = 0;

  for (let i = 0; i < config.iterations; i++) {
    try {
      const result = await httpPost(`${config.didcommEndpoint}${didcommPath}`);
      if (result.success) {
        didcommResults.push(result);
        didcommRawLatencies.push(result.latency);
      } else {
        didcommErrors++;
      }
    } catch (e) {
      didcommErrors++;
    }
    if ((i + 1) % 100 === 0) process.stdout.write(`  Progress: ${i + 1}/${config.iterations}\r`);
  }
  console.log(`  Progress: ${config.iterations}/${config.iterations} - Done (errors: ${didcommErrors})`);

  // OpenID4VC benchmark
  console.log(`\nOpenID4VC benchmark (${config.iterations} iterations)...`);
  const openid4vcResults = [];
  const openid4vcRawLatencies = [];
  let openid4vcErrors = 0;

  for (let i = 0; i < config.iterations; i++) {
    try {
      const result = await httpPost(`${config.openid4vcEndpoint}${openid4vcPath}`);
      if (result.success) {
        openid4vcResults.push(result);
        openid4vcRawLatencies.push(result.latency);
      } else {
        openid4vcErrors++;
      }
    } catch (e) {
      openid4vcErrors++;
    }
    if ((i + 1) % 100 === 0) process.stdout.write(`  Progress: ${i + 1}/${config.iterations}\r`);
  }
  console.log(`  Progress: ${config.iterations}/${config.iterations} - Done (errors: ${openid4vcErrors})`);

  // Calculate statistics
  const didcommStats = calculateStatistics(didcommRawLatencies);
  const openid4vcStats = calculateStatistics(openid4vcRawLatencies);
  const comparison = welchTTest(didcommRawLatencies, openid4vcRawLatencies);

  // Calculate message size and round-trip averages
  const didcommAvgRoundTrips = didcommResults.reduce((a, r) => a + r.roundTrips, 0) / didcommResults.length;
  const openid4vcAvgRoundTrips = openid4vcResults.reduce((a, r) => a + r.roundTrips, 0) / openid4vcResults.length;
  const didcommAvgMsgSize = didcommResults.reduce((a, r) => a + r.messageSize, 0) / didcommResults.length;
  const openid4vcAvgMsgSize = openid4vcResults.reduce((a, r) => a + r.messageSize, 0) / openid4vcResults.length;

  // Print results
  console.log('\n--- DIDComm Results ---');
  console.log(`  Mean: ${didcommStats.mean.toFixed(2)}ms (95% CI: ${didcommStats.ci95.lower.toFixed(2)}-${didcommStats.ci95.upper.toFixed(2)})`);
  console.log(`  Median: ${didcommStats.median.toFixed(2)}ms`);
  console.log(`  Std Dev: ${didcommStats.stdDev.toFixed(2)}ms (CV: ${didcommStats.cv.toFixed(1)}%)`);
  console.log(`  P50/P90/P95/P99: ${didcommStats.p50.toFixed(2)}/${didcommStats.p90.toFixed(2)}/${didcommStats.p95.toFixed(2)}/${didcommStats.p99.toFixed(2)}ms`);
  console.log(`  Round-trips: ${didcommAvgRoundTrips.toFixed(1)} | Msg Size: ${Math.round(didcommAvgMsgSize)} bytes`);

  console.log('\n--- OpenID4VC Results ---');
  console.log(`  Mean: ${openid4vcStats.mean.toFixed(2)}ms (95% CI: ${openid4vcStats.ci95.lower.toFixed(2)}-${openid4vcStats.ci95.upper.toFixed(2)})`);
  console.log(`  Median: ${openid4vcStats.median.toFixed(2)}ms`);
  console.log(`  Std Dev: ${openid4vcStats.stdDev.toFixed(2)}ms (CV: ${openid4vcStats.cv.toFixed(1)}%)`);
  console.log(`  P50/P90/P95/P99: ${openid4vcStats.p50.toFixed(2)}/${openid4vcStats.p90.toFixed(2)}/${openid4vcStats.p95.toFixed(2)}/${openid4vcStats.p99.toFixed(2)}ms`);
  console.log(`  Round-trips: ${openid4vcAvgRoundTrips.toFixed(1)} | Msg Size: ${Math.round(openid4vcAvgMsgSize)} bytes`);

  console.log('\n--- Statistical Comparison ---');
  console.log(`  Mean Difference: ${comparison.meanDifference.toFixed(2)}ms (${comparison.percentDifference.toFixed(1)}%)`);
  console.log(`  Welch's t: ${comparison.t.toFixed(3)} (df: ${comparison.df.toFixed(1)})`);
  console.log(`  Cohen's d: ${comparison.cohensD.toFixed(3)} (${comparison.effectInterpretation})`);
  console.log(`  Winner: ${comparison.meanDifference > 0 ? 'OpenID4VC' : 'DIDComm'}`);

  return {
    scenario: name,
    didcomm: {
      stats: didcommStats,
      roundTrips: didcommAvgRoundTrips,
      messageSize: Math.round(didcommAvgMsgSize),
      errorCount: didcommErrors,
      successRate: ((config.iterations - didcommErrors) / config.iterations * 100).toFixed(2)
    },
    openid4vc: {
      stats: openid4vcStats,
      roundTrips: openid4vcAvgRoundTrips,
      messageSize: Math.round(openid4vcAvgMsgSize),
      errorCount: openid4vcErrors,
      successRate: ((config.iterations - openid4vcErrors) / config.iterations * 100).toFixed(2)
    },
    comparison,
    rawData: {
      didcomm: didcommRawLatencies,
      openid4vc: openid4vcRawLatencies
    }
  };
}

async function waitForAgents() {
  console.log('\nWaiting for agents to be ready...');

  const checkHealth = async (url, name) => {
    for (let i = 0; i < 60; i++) {
      try {
        await new Promise((resolve, reject) => {
          const urlObj = new URL(url);
          http.get(`${url}/health`, (res) => {
            if (res.statusCode === 200) {
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => {
                const health = JSON.parse(data);
                if (health.status === 'ready') resolve();
                else reject(new Error('Not ready'));
              });
            } else {
              reject(new Error(`Status ${res.statusCode}`));
            }
          }).on('error', reject);
        });
        console.log(`  ${name}: Ready`);
        return true;
      } catch {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    throw new Error(`${name} not ready after 60s`);
  };

  await checkHealth(config.didcommEndpoint, 'DIDComm Agent');
  await checkHealth(config.openid4vcEndpoint, 'OpenID4VC Agent');
  console.log('All agents ready.\n');
}

async function main() {
  await waitForAgents();

  const results = [];

  // Run all scenarios
  results.push(await runScenario(
    'Credential Issuance',
    '/didcomm/issue',
    '/openid4vc/issue'
  ));

  results.push(await runScenario(
    'Credential Presentation',
    '/didcomm/present',
    '/openid4vc/present'
  ));

  results.push(await runScenario(
    'Selective Disclosure',
    '/didcomm/selective-disclose',
    '/openid4vc/selective-disclose'
  ));

  // Final Summary
  console.log('\n' + '='.repeat(70));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(70));

  console.log('\n| Scenario              | DIDComm (ms)    | OpenID4VC (ms)  | Diff (%)  | Effect Size |');
  console.log('|' + '-'.repeat(22) + '|' + '-'.repeat(17) + '|' + '-'.repeat(17) + '|' + '-'.repeat(11) + '|' + '-'.repeat(13) + '|');

  results.forEach(r => {
    const scenario = r.scenario.padEnd(21);
    const didcomm = `${r.didcomm.stats.mean.toFixed(2)} ± ${r.didcomm.stats.stdDev.toFixed(2)}`.padEnd(16);
    const openid4vc = `${r.openid4vc.stats.mean.toFixed(2)} ± ${r.openid4vc.stats.stdDev.toFixed(2)}`.padEnd(16);
    const diff = `${r.comparison.percentDifference.toFixed(1)}%`.padEnd(10);
    const effect = `d=${r.comparison.cohensD.toFixed(2)}`.padEnd(12);
    console.log(`| ${scenario}| ${didcomm}| ${openid4vc}| ${diff}| ${effect}|`);
  });

  // Methodology note
  console.log('\n--- Methodology ---');
  console.log(`Iterations per scenario: ${config.iterations}`);
  console.log(`Warmup iterations: ${config.warmupIterations}`);
  console.log('Statistical tests: Welch\'s t-test (unequal variance)');
  console.log('Effect size: Cohen\'s d');
  console.log('Crypto timing: Based on published benchmarks (see agent source)');

  // Export results
  const output = {
    metadata: {
      timestamp: new Date().toISOString(),
      environment: 'Docker Compose',
      configuration: config,
      methodology: {
        iterations: config.iterations,
        warmupIterations: config.warmupIterations,
        statisticalTests: ['Welch\'s t-test', 'Cohen\'s d'],
        cryptoTimingSource: [
          'DIF DIDComm Performance Study (2023)',
          'Hyperledger Indy Benchmarks (Thwin & Vasupongayya, 2021)',
          'draft-ietf-oauth-sd-jwt-vc',
          'jose library benchmarks'
        ]
      }
    },
    results: results.map(r => ({
      scenario: r.scenario,
      didcomm: {
        mean: r.didcomm.stats.mean,
        median: r.didcomm.stats.median,
        stdDev: r.didcomm.stats.stdDev,
        ci95: r.didcomm.stats.ci95,
        p95: r.didcomm.stats.p95,
        p99: r.didcomm.stats.p99,
        roundTrips: r.didcomm.roundTrips,
        messageSize: r.didcomm.messageSize,
        successRate: r.didcomm.successRate
      },
      openid4vc: {
        mean: r.openid4vc.stats.mean,
        median: r.openid4vc.stats.median,
        stdDev: r.openid4vc.stats.stdDev,
        ci95: r.openid4vc.stats.ci95,
        p95: r.openid4vc.stats.p95,
        p99: r.openid4vc.stats.p99,
        roundTrips: r.openid4vc.roundTrips,
        messageSize: r.openid4vc.messageSize,
        successRate: r.openid4vc.successRate
      },
      comparison: {
        meanDifference: r.comparison.meanDifference,
        percentDifference: r.comparison.percentDifference,
        welchT: r.comparison.t,
        degreesOfFreedom: r.comparison.df,
        cohensD: r.comparison.cohensD,
        effectInterpretation: r.comparison.effectInterpretation
      }
    })),
    rawData: results.map(r => ({
      scenario: r.scenario,
      didcomm: r.rawData.didcomm,
      openid4vc: r.rawData.openid4vc
    }))
  };

  try {
    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
    }

    // Save full results
    const filename = `benchmark-${Date.now()}.json`;
    fs.writeFileSync(path.join(config.outputDir, filename), JSON.stringify(output, null, 2));
    console.log(`\nResults exported to: ${config.outputDir}/${filename}`);

    // Save summary CSV
    const csvFilename = `benchmark-summary-${Date.now()}.csv`;
    const csvHeader = 'Scenario,DIDComm_Mean,DIDComm_StdDev,DIDComm_P95,OpenID4VC_Mean,OpenID4VC_StdDev,OpenID4VC_P95,PercentDiff,CohensD\n';
    const csvRows = results.map(r =>
      `${r.scenario},${r.didcomm.stats.mean.toFixed(2)},${r.didcomm.stats.stdDev.toFixed(2)},${r.didcomm.stats.p95.toFixed(2)},${r.openid4vc.stats.mean.toFixed(2)},${r.openid4vc.stats.stdDev.toFixed(2)},${r.openid4vc.stats.p95.toFixed(2)},${r.comparison.percentDifference.toFixed(2)},${r.comparison.cohensD.toFixed(3)}`
    ).join('\n');
    fs.writeFileSync(path.join(config.outputDir, csvFilename), csvHeader + csvRows);
    console.log(`Summary CSV exported to: ${config.outputDir}/${csvFilename}`);

  } catch (e) {
    console.error('Failed to export results:', e.message);
    console.log('\nResults (JSON preview):');
    console.log(JSON.stringify(output.results, null, 2));
  }

  console.log('\n' + '='.repeat(70));
  console.log('BENCHMARK COMPLETE');
  console.log('='.repeat(70));
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
