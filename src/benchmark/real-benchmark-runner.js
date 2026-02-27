/**
 * Real Cryptographic Benchmark Runner
 *
 * Orchestrates benchmarks against real crypto agents with:
 * - Multiple iterations (default 1000)
 * - Warmup phase (default 100)
 * - Concurrent client testing
 * - Statistical analysis
 * - CSV and JSON output
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// ============ Configuration ============

const config = {
  iterations: parseInt(process.env.ITERATIONS) || 1000,
  warmupIterations: parseInt(process.env.WARMUP_ITERATIONS) || 100,
  concurrentClients: (process.env.CONCURRENT_CLIENTS || '1,5,10,20').split(',').map(n => parseInt(n)),
  didcommEndpoint: process.env.DIDCOMM_ENDPOINT || 'http://localhost:13000',
  openid4vcEndpoint: process.env.OPENID4VC_ENDPOINT || 'http://localhost:14000',
  outputDir: process.env.OUTPUT_DIR || './data/raw/real-benchmarks',
  outputFormat: (process.env.OUTPUT_FORMAT || 'csv,json').split(','),
  protocol: process.env.PROTOCOL || 'all', // 'didcomm', 'openid4vc', or 'all'
  scenario: process.env.SCENARIO || 'all' // 'issuance', 'presentation', 'selective-disclosure', or 'all'
};

// ============ HTTP Client ============

function httpPost(url, data = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(JSON.stringify(data));
    req.end();
  });
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

// ============ Statistics ============

function calculateStatistics(values) {
  if (values.length === 0) {
    return { mean: 0, sd: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0, ci95: [0, 0] };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = values.length;

  // Mean
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  // Standard Deviation
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (n - 1);
  const sd = Math.sqrt(variance);

  // Percentiles
  const percentile = (p) => {
    const index = Math.ceil((p / 100) * n) - 1;
    return sorted[Math.max(0, Math.min(index, n - 1))];
  };

  // 95% Confidence Interval
  const se = sd / Math.sqrt(n);
  const t = 1.96; // z-score for 95% CI (approximation for large n)
  const ci95 = [mean - t * se, mean + t * se];

  return {
    mean,
    sd,
    min: sorted[0],
    max: sorted[n - 1],
    p50: percentile(50),
    p95: percentile(95),
    p99: percentile(99),
    ci95,
    n
  };
}

function welchTTest(group1, group2) {
  const stats1 = calculateStatistics(group1);
  const stats2 = calculateStatistics(group2);

  const n1 = group1.length;
  const n2 = group2.length;

  // Welch's t-statistic
  const se = Math.sqrt((stats1.sd ** 2 / n1) + (stats2.sd ** 2 / n2));
  const t = (stats1.mean - stats2.mean) / se;

  // Welch-Satterthwaite degrees of freedom
  const num = ((stats1.sd ** 2 / n1) + (stats2.sd ** 2 / n2)) ** 2;
  const denom = ((stats1.sd ** 2 / n1) ** 2 / (n1 - 1)) + ((stats2.sd ** 2 / n2) ** 2 / (n2 - 1));
  const df = num / denom;

  // Two-tailed p-value approximation (using t-distribution)
  // For large df, this approximates the normal distribution
  const p = 2 * (1 - normalCDF(Math.abs(t)));

  return { t, df, p, stats1, stats2 };
}

function cohensD(group1, group2) {
  const stats1 = calculateStatistics(group1);
  const stats2 = calculateStatistics(group2);

  // Pooled standard deviation
  const n1 = group1.length;
  const n2 = group2.length;
  const pooledSD = Math.sqrt(
    ((n1 - 1) * stats1.sd ** 2 + (n2 - 1) * stats2.sd ** 2) / (n1 + n2 - 2)
  );

  const d = (stats1.mean - stats2.mean) / pooledSD;

  // Effect size interpretation
  let interpretation;
  const absD = Math.abs(d);
  if (absD < 0.2) interpretation = 'negligible';
  else if (absD < 0.5) interpretation = 'small';
  else if (absD < 0.8) interpretation = 'medium';
  else interpretation = 'large';

  return { d, interpretation };
}

// Normal CDF approximation
function normalCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

// ============ Benchmark Runner ============

async function waitForAgent(endpoint, maxRetries = 30) {
  console.log(`Waiting for agent at ${endpoint}...`);
  for (let i = 0; i < maxRetries; i++) {
    try {
      const health = await httpGet(`${endpoint}/health`);
      if (health.status === 'ready') {
        console.log(`Agent ready: ${endpoint}`);
        return true;
      }
    } catch (e) {
      // Agent not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Agent not ready after ${maxRetries} seconds: ${endpoint}`);
}

async function runBenchmark(endpoint, scenario, iterations, label) {
  const results = [];
  const errors = [];

  console.log(`\n[${label}] Running ${scenario} benchmark (${iterations} iterations)...`);

  const progressInterval = Math.max(1, Math.floor(iterations / 10));

  for (let i = 0; i < iterations; i++) {
    try {
      const result = await httpPost(`${endpoint}/${scenario}`);
      if (result.success) {
        results.push(result);
      } else {
        errors.push({ iteration: i, error: result.error });
      }
    } catch (error) {
      errors.push({ iteration: i, error: error.message });
    }

    if ((i + 1) % progressInterval === 0) {
      process.stdout.write(`  Progress: ${i + 1}/${iterations} (${Math.round((i + 1) / iterations * 100)}%)\r`);
    }
  }

  console.log(`\n[${label}] Completed: ${results.length} success, ${errors.length} errors`);

  return { results, errors };
}

async function runConcurrentBenchmark(endpoint, scenario, concurrency, iterations, label) {
  const results = [];
  const errors = [];
  const iterationsPerClient = Math.floor(iterations / concurrency);

  console.log(`\n[${label}] Running ${scenario} with ${concurrency} concurrent clients...`);
  console.log(`  Iterations per client: ${iterationsPerClient}`);

  const startTime = performance.now();

  // Create concurrent workers
  const workers = [];
  for (let c = 0; c < concurrency; c++) {
    workers.push((async () => {
      const clientResults = [];
      const clientErrors = [];

      for (let i = 0; i < iterationsPerClient; i++) {
        try {
          const result = await httpPost(`${endpoint}/${scenario}`);
          if (result.success) {
            clientResults.push(result);
          } else {
            clientErrors.push({ client: c, iteration: i, error: result.error });
          }
        } catch (error) {
          clientErrors.push({ client: c, iteration: i, error: error.message });
        }
      }

      return { results: clientResults, errors: clientErrors };
    })());
  }

  // Wait for all workers
  const workerResults = await Promise.all(workers);

  const totalTime = performance.now() - startTime;

  // Aggregate results
  for (const w of workerResults) {
    results.push(...w.results);
    errors.push(...w.errors);
  }

  const throughput = results.length / (totalTime / 1000);

  console.log(`[${label}] Concurrent benchmark completed:`);
  console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
  console.log(`  Throughput: ${throughput.toFixed(2)} ops/sec`);
  console.log(`  Success: ${results.length}, Errors: ${errors.length}`);

  return { results, errors, throughput, totalTime, concurrency };
}

// ============ Main Benchmark Orchestration ============

async function main() {
  console.log('========================================');
  console.log('Real Cryptographic Benchmark Runner');
  console.log('========================================\n');

  console.log('Configuration:');
  console.log(`  Iterations: ${config.iterations}`);
  console.log(`  Warmup: ${config.warmupIterations}`);
  console.log(`  Concurrent clients: ${config.concurrentClients.join(', ')}`);
  console.log(`  DIDComm endpoint: ${config.didcommEndpoint}`);
  console.log(`  OpenID4VC endpoint: ${config.openid4vcEndpoint}`);
  console.log(`  Output: ${config.outputDir}`);
  console.log();

  // Create output directory
  fs.mkdirSync(config.outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const allResults = {
    config,
    timestamp,
    benchmarks: {}
  };

  // Wait for agents
  const protocols = config.protocol === 'all'
    ? ['didcomm', 'openid4vc']
    : [config.protocol];

  for (const protocol of protocols) {
    const endpoint = protocol === 'didcomm' ? config.didcommEndpoint : config.openid4vcEndpoint;
    await waitForAgent(endpoint);
  }

  // Define scenarios
  const scenarios = config.scenario === 'all'
    ? ['issue', 'present', 'selective-disclose']
    : [config.scenario];

  const scenarioEndpoints = {
    'issue': { didcomm: 'didcomm/issue', openid4vc: 'openid4vc/issue' },
    'present': { didcomm: 'didcomm/present', openid4vc: 'openid4vc/present' },
    'selective-disclose': { didcomm: 'didcomm/selective-disclose', openid4vc: 'openid4vc/selective-disclose' }
  };

  // Run benchmarks for each protocol and scenario
  for (const scenario of scenarios) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Scenario: ${scenario.toUpperCase()}`);
    console.log('='.repeat(50));

    allResults.benchmarks[scenario] = {};

    for (const protocol of protocols) {
      const endpoint = protocol === 'didcomm' ? config.didcommEndpoint : config.openid4vcEndpoint;
      const scenarioPath = scenarioEndpoints[scenario][protocol];
      const label = `${protocol.toUpperCase()} ${scenario}`;

      // Warmup phase
      console.log(`\n[${label}] Warmup phase (${config.warmupIterations} iterations)...`);
      await runBenchmark(endpoint, scenarioPath, config.warmupIterations, `${label} WARMUP`);

      // Main benchmark (single client)
      const mainResult = await runBenchmark(
        endpoint,
        scenarioPath,
        config.iterations,
        label
      );

      // Extract latencies
      const latencies = mainResult.results.map(r => r.latency);
      const stats = calculateStatistics(latencies);

      allResults.benchmarks[scenario][protocol] = {
        singleClient: {
          stats,
          rawResults: mainResult.results,
          errors: mainResult.errors
        },
        concurrent: {}
      };

      console.log(`\n[${label}] Statistics (n=${stats.n}):`);
      console.log(`  Mean: ${stats.mean.toFixed(3)}ms`);
      console.log(`  SD: ${stats.sd.toFixed(3)}ms`);
      console.log(`  95% CI: [${stats.ci95[0].toFixed(3)}, ${stats.ci95[1].toFixed(3)}]ms`);
      console.log(`  P50: ${stats.p50.toFixed(3)}ms, P95: ${stats.p95.toFixed(3)}ms, P99: ${stats.p99.toFixed(3)}ms`);

      // Concurrent benchmarks
      for (const concurrency of config.concurrentClients) {
        if (concurrency === 1) continue; // Already done single client

        const concurrentResult = await runConcurrentBenchmark(
          endpoint,
          scenarioPath,
          concurrency,
          config.iterations,
          `${label} (${concurrency} clients)`
        );

        const concurrentLatencies = concurrentResult.results.map(r => r.latency);
        const concurrentStats = calculateStatistics(concurrentLatencies);

        allResults.benchmarks[scenario][protocol].concurrent[concurrency] = {
          stats: concurrentStats,
          throughput: concurrentResult.throughput,
          totalTime: concurrentResult.totalTime,
          errors: concurrentResult.errors.length
        };
      }
    }

    // Statistical comparison between protocols
    if (protocols.length === 2) {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`Statistical Comparison: ${scenario}`);
      console.log('='.repeat(50));

      const didcommLatencies = allResults.benchmarks[scenario].didcomm.singleClient.rawResults.map(r => r.latency);
      const openid4vcLatencies = allResults.benchmarks[scenario].openid4vc.singleClient.rawResults.map(r => r.latency);

      const tTest = welchTTest(didcommLatencies, openid4vcLatencies);
      const effectSize = cohensD(didcommLatencies, openid4vcLatencies);

      allResults.benchmarks[scenario].comparison = {
        welchTTest: { t: tTest.t, df: tTest.df, p: tTest.p },
        cohensD: effectSize,
        percentageDifference: ((tTest.stats1.mean - tTest.stats2.mean) / tTest.stats2.mean * 100)
      };

      console.log(`\nWelch's t-test:`);
      console.log(`  t = ${tTest.t.toFixed(4)}, df = ${tTest.df.toFixed(2)}, p = ${tTest.p.toExponential(4)}`);
      console.log(`  DIDComm mean: ${tTest.stats1.mean.toFixed(3)}ms`);
      console.log(`  OpenID4VC mean: ${tTest.stats2.mean.toFixed(3)}ms`);
      console.log(`  Difference: ${(tTest.stats1.mean - tTest.stats2.mean).toFixed(3)}ms (${allResults.benchmarks[scenario].comparison.percentageDifference.toFixed(1)}%)`);

      console.log(`\nCohen's d effect size:`);
      console.log(`  d = ${effectSize.d.toFixed(4)} (${effectSize.interpretation})`);

      if (tTest.p < 0.001) {
        console.log(`\nResult: Statistically significant difference (p < 0.001)`);
      } else if (tTest.p < 0.05) {
        console.log(`\nResult: Statistically significant difference (p < 0.05)`);
      } else {
        console.log(`\nResult: No statistically significant difference (p >= 0.05)`);
      }
    }
  }

  // Save results
  console.log(`\n${'='.repeat(50)}`);
  console.log('Saving Results');
  console.log('='.repeat(50));

  if (config.outputFormat.includes('json')) {
    const jsonPath = path.join(config.outputDir, `real-benchmark-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(allResults, null, 2));
    console.log(`JSON saved: ${jsonPath}`);
  }

  if (config.outputFormat.includes('csv')) {
    const csvPath = path.join(config.outputDir, `real-benchmark-${timestamp}.csv`);
    const csvRows = ['scenario,protocol,metric,value'];

    for (const [scenario, protocols] of Object.entries(allResults.benchmarks)) {
      for (const [protocol, data] of Object.entries(protocols)) {
        if (protocol === 'comparison') continue;

        const stats = data.singleClient.stats;
        csvRows.push(`${scenario},${protocol},mean,${stats.mean}`);
        csvRows.push(`${scenario},${protocol},sd,${stats.sd}`);
        csvRows.push(`${scenario},${protocol},p50,${stats.p50}`);
        csvRows.push(`${scenario},${protocol},p95,${stats.p95}`);
        csvRows.push(`${scenario},${protocol},p99,${stats.p99}`);
        csvRows.push(`${scenario},${protocol},ci95_lower,${stats.ci95[0]}`);
        csvRows.push(`${scenario},${protocol},ci95_upper,${stats.ci95[1]}`);
        csvRows.push(`${scenario},${protocol},n,${stats.n}`);
      }
    }

    fs.writeFileSync(csvPath, csvRows.join('\n'));
    console.log(`CSV saved: ${csvPath}`);
  }

  // Summary table
  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY TABLE');
  console.log('='.repeat(70));
  console.log('| Scenario            | Protocol   | Mean (ms) | SD (ms)  | P95 (ms) |');
  console.log('|---------------------|------------|-----------|----------|----------|');

  for (const [scenario, protocols] of Object.entries(allResults.benchmarks)) {
    for (const [protocol, data] of Object.entries(protocols)) {
      if (protocol === 'comparison') continue;
      const stats = data.singleClient.stats;
      console.log(`| ${scenario.padEnd(19)} | ${protocol.padEnd(10)} | ${stats.mean.toFixed(3).padStart(9)} | ${stats.sd.toFixed(3).padStart(8)} | ${stats.p95.toFixed(3).padStart(8)} |`);
    }
  }

  console.log('='.repeat(70));
  console.log('\nBenchmark completed successfully!');
}

// Run
main().catch(error => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
