#!/usr/bin/env python3
"""
Real Cryptographic Benchmark Statistical Analysis

Analyzes benchmark results with:
- Descriptive statistics (mean, SD, CI)
- Welch's t-test for protocol comparison
- Cohen's d effect size
- Mann-Whitney U test (non-parametric)
- Percentile distributions
- Visualization exports

Usage:
    python scripts/real-analysis.py data/raw/real-benchmarks/real-benchmark-*.json
"""

import json
import sys
import os
from pathlib import Path
from datetime import datetime
import math

# Try to import optional dependencies
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    print("Warning: numpy not available, using pure Python fallback")

try:
    from scipy import stats
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False
    print("Warning: scipy not available, using pure Python fallback")


def calculate_statistics(values):
    """Calculate descriptive statistics for a list of values."""
    if not values:
        return {
            'mean': 0, 'sd': 0, 'min': 0, 'max': 0,
            'p50': 0, 'p95': 0, 'p99': 0, 'ci95': (0, 0), 'n': 0
        }

    n = len(values)
    sorted_values = sorted(values)

    # Mean
    mean = sum(values) / n

    # Standard deviation (sample)
    if n > 1:
        variance = sum((x - mean) ** 2 for x in values) / (n - 1)
        sd = math.sqrt(variance)
    else:
        sd = 0

    # Percentiles
    def percentile(p):
        idx = math.ceil((p / 100) * n) - 1
        return sorted_values[max(0, min(idx, n - 1))]

    # 95% Confidence Interval
    se = sd / math.sqrt(n) if n > 0 else 0
    t_value = 1.96  # z-score for 95% CI
    ci95 = (mean - t_value * se, mean + t_value * se)

    return {
        'mean': mean,
        'sd': sd,
        'min': sorted_values[0],
        'max': sorted_values[-1],
        'p50': percentile(50),
        'p95': percentile(95),
        'p99': percentile(99),
        'ci95': ci95,
        'n': n
    }


def welch_t_test(group1, group2):
    """Perform Welch's t-test for two independent samples."""
    if HAS_SCIPY:
        t_stat, p_value = stats.ttest_ind(group1, group2, equal_var=False)
        # Calculate degrees of freedom using Welch-Satterthwaite
        n1, n2 = len(group1), len(group2)
        var1, var2 = np.var(group1, ddof=1), np.var(group2, ddof=1)
        num = (var1/n1 + var2/n2) ** 2
        denom = (var1/n1)**2/(n1-1) + (var2/n2)**2/(n2-1)
        df = num / denom
        return {'t': t_stat, 'p': p_value, 'df': df}

    # Pure Python fallback
    stats1 = calculate_statistics(group1)
    stats2 = calculate_statistics(group2)

    n1, n2 = len(group1), len(group2)

    # Welch's t-statistic
    se = math.sqrt((stats1['sd']**2 / n1) + (stats2['sd']**2 / n2))
    if se == 0:
        return {'t': 0, 'p': 1.0, 'df': n1 + n2 - 2}

    t = (stats1['mean'] - stats2['mean']) / se

    # Welch-Satterthwaite degrees of freedom
    num = ((stats1['sd']**2 / n1) + (stats2['sd']**2 / n2)) ** 2
    denom = ((stats1['sd']**2 / n1)**2 / (n1-1)) + ((stats2['sd']**2 / n2)**2 / (n2-1))
    df = num / denom if denom > 0 else n1 + n2 - 2

    # Approximate p-value using normal distribution
    p = 2 * (1 - normal_cdf(abs(t)))

    return {'t': t, 'p': p, 'df': df}


def mann_whitney_u(group1, group2):
    """Perform Mann-Whitney U test (non-parametric)."""
    if HAS_SCIPY:
        u_stat, p_value = stats.mannwhitneyu(group1, group2, alternative='two-sided')
        return {'U': u_stat, 'p': p_value}

    # Pure Python fallback
    n1, n2 = len(group1), len(group2)

    # Combine and rank
    combined = [(v, 0) for v in group1] + [(v, 1) for v in group2]
    combined.sort(key=lambda x: x[0])

    # Assign ranks
    ranks = {}
    for i, (value, _) in enumerate(combined, 1):
        if value not in ranks:
            ranks[value] = []
        ranks[value].append(i)

    # Average ranks for ties
    avg_ranks = {v: sum(r) / len(r) for v, r in ranks.items()}

    # Calculate R1 (sum of ranks for group 1)
    R1 = sum(avg_ranks[v] for v in group1)

    # Calculate U
    U1 = R1 - (n1 * (n1 + 1)) / 2
    U2 = n1 * n2 - U1
    U = min(U1, U2)

    # Normal approximation for large samples
    mean_U = n1 * n2 / 2
    std_U = math.sqrt(n1 * n2 * (n1 + n2 + 1) / 12)
    z = (U - mean_U) / std_U if std_U > 0 else 0
    p = 2 * (1 - normal_cdf(abs(z)))

    return {'U': U, 'p': p, 'z': z}


def cohens_d(group1, group2):
    """Calculate Cohen's d effect size."""
    stats1 = calculate_statistics(group1)
    stats2 = calculate_statistics(group2)

    n1, n2 = len(group1), len(group2)

    # Pooled standard deviation
    pooled_var = ((n1 - 1) * stats1['sd']**2 + (n2 - 1) * stats2['sd']**2) / (n1 + n2 - 2)
    pooled_sd = math.sqrt(pooled_var)

    if pooled_sd == 0:
        return {'d': 0, 'interpretation': 'undefined'}

    d = (stats1['mean'] - stats2['mean']) / pooled_sd

    # Interpretation
    abs_d = abs(d)
    if abs_d < 0.2:
        interpretation = 'negligible'
    elif abs_d < 0.5:
        interpretation = 'small'
    elif abs_d < 0.8:
        interpretation = 'medium'
    else:
        interpretation = 'large'

    return {'d': d, 'interpretation': interpretation}


def normal_cdf(x):
    """Approximate normal CDF using Abramowitz and Stegun formula."""
    t = 1 / (1 + 0.2316419 * abs(x))
    d = 0.3989423 * math.exp(-x * x / 2)
    p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
    return 1 - p if x > 0 else p


def extract_latencies(benchmark_data, scenario, protocol):
    """Extract latencies from benchmark results."""
    try:
        results = benchmark_data['benchmarks'][scenario][protocol]['singleClient']['rawResults']
        return [r['latency'] for r in results if r.get('success', True)]
    except (KeyError, TypeError):
        return []


def analyze_benchmark(input_file):
    """Analyze a benchmark JSON file."""
    print(f"\n{'='*70}")
    print(f"Analyzing: {input_file}")
    print('='*70)

    with open(input_file, 'r') as f:
        data = json.load(f)

    config = data.get('config', {})
    timestamp = data.get('timestamp', 'unknown')

    print(f"\nBenchmark Configuration:")
    print(f"  Timestamp: {timestamp}")
    print(f"  Iterations: {config.get('iterations', 'N/A')}")
    print(f"  Warmup: {config.get('warmupIterations', 'N/A')}")

    results = {
        'timestamp': timestamp,
        'config': config,
        'scenarios': {}
    }

    scenarios = ['issue', 'present', 'selective-disclose']
    protocols = ['didcomm', 'openid4vc']

    for scenario in scenarios:
        if scenario not in data.get('benchmarks', {}):
            continue

        print(f"\n{'-'*50}")
        print(f"Scenario: {scenario.upper()}")
        print('-'*50)

        scenario_results = {'protocols': {}, 'comparison': None}

        latencies = {}
        for protocol in protocols:
            lat = extract_latencies(data, scenario, protocol)
            if lat:
                latencies[protocol] = lat
                stats = calculate_statistics(lat)
                scenario_results['protocols'][protocol] = stats

                print(f"\n{protocol.upper()} Statistics (n={stats['n']}):")
                print(f"  Mean:  {stats['mean']:.3f} ms")
                print(f"  SD:    {stats['sd']:.3f} ms")
                print(f"  Min:   {stats['min']:.3f} ms")
                print(f"  Max:   {stats['max']:.3f} ms")
                print(f"  P50:   {stats['p50']:.3f} ms")
                print(f"  P95:   {stats['p95']:.3f} ms")
                print(f"  P99:   {stats['p99']:.3f} ms")
                print(f"  95% CI: [{stats['ci95'][0]:.3f}, {stats['ci95'][1]:.3f}] ms")

        # Statistical comparison
        if len(latencies) == 2:
            print(f"\n{'~'*50}")
            print("STATISTICAL COMPARISON: DIDComm vs OpenID4VC")
            print('~'*50)

            g1 = latencies['didcomm']
            g2 = latencies['openid4vc']

            # Welch's t-test
            t_result = welch_t_test(g1, g2)
            print(f"\nWelch's t-test:")
            print(f"  t = {t_result['t']:.4f}")
            print(f"  df = {t_result['df']:.2f}")
            print(f"  p = {t_result['p']:.2e}")

            if t_result['p'] < 0.001:
                sig = "*** (p < 0.001)"
            elif t_result['p'] < 0.01:
                sig = "** (p < 0.01)"
            elif t_result['p'] < 0.05:
                sig = "* (p < 0.05)"
            else:
                sig = "ns (p >= 0.05)"
            print(f"  Significance: {sig}")

            # Mann-Whitney U test
            mw_result = mann_whitney_u(g1, g2)
            print(f"\nMann-Whitney U test:")
            print(f"  U = {mw_result['U']:.2f}")
            print(f"  p = {mw_result['p']:.2e}")

            # Cohen's d
            d_result = cohens_d(g1, g2)
            print(f"\nCohen's d effect size:")
            print(f"  d = {d_result['d']:.4f}")
            print(f"  Interpretation: {d_result['interpretation']}")

            # Percentage difference
            mean_diff = scenario_results['protocols']['didcomm']['mean'] - scenario_results['protocols']['openid4vc']['mean']
            pct_diff = (mean_diff / scenario_results['protocols']['openid4vc']['mean']) * 100
            print(f"\nPerformance Difference:")
            print(f"  Absolute: {mean_diff:.3f} ms")
            print(f"  Relative: {pct_diff:.1f}%")
            print(f"  OpenID4VC is {abs(pct_diff):.1f}% {'faster' if pct_diff > 0 else 'slower'} than DIDComm")

            scenario_results['comparison'] = {
                'welch_t_test': t_result,
                'mann_whitney_u': mw_result,
                'cohens_d': d_result,
                'mean_difference_ms': mean_diff,
                'percentage_difference': pct_diff
            }

        results['scenarios'][scenario] = scenario_results

    return results


def generate_latex_table(results):
    """Generate LaTeX table for paper."""
    print("\n" + "="*70)
    print("LaTeX TABLE (for paper)")
    print("="*70)

    latex = r"""
\begin{table}[htbp]
\centering
\caption{Protocol Performance Comparison (Real Cryptographic Operations)}
\label{tab:real-crypto-results}
\begin{tabular}{llrrrrr}
\toprule
\textbf{Scenario} & \textbf{Protocol} & \textbf{Mean (ms)} & \textbf{SD} & \textbf{P95} & \textbf{$\Delta$\%} \\
\midrule
"""

    for scenario, data in results.get('scenarios', {}).items():
        for i, (protocol, stats) in enumerate(data.get('protocols', {}).items()):
            scenario_name = scenario.replace('-', ' ').title() if i == 0 else ''
            delta = ''
            if protocol == 'openid4vc' and data.get('comparison'):
                delta = f"{-data['comparison']['percentage_difference']:.1f}\\%"

            latex += f"{scenario_name} & {protocol.upper()} & {stats['mean']:.2f} & {stats['sd']:.2f} & {stats['p95']:.2f} & {delta} \\\\\n"

    latex += r"""
\bottomrule
\end{tabular}
\end{table}
"""

    print(latex)
    return latex


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/real-analysis.py <benchmark-json-file>")
        print("\nExample:")
        print("  python scripts/real-analysis.py data/raw/real-benchmarks/real-benchmark-2026-02-27T*.json")
        sys.exit(1)

    input_files = sys.argv[1:]
    all_results = []

    for input_file in input_files:
        if os.path.exists(input_file):
            results = analyze_benchmark(input_file)
            all_results.append(results)
            generate_latex_table(results)

    # Save analysis results
    if all_results:
        output_dir = Path(input_files[0]).parent
        output_file = output_dir / f"statistical-analysis-{datetime.now().strftime('%Y-%m-%dT%H-%M-%S')}.json"

        with open(output_file, 'w') as f:
            json.dump(all_results, f, indent=2)

        print(f"\nAnalysis saved to: {output_file}")

    print("\n" + "="*70)
    print("ANALYSIS COMPLETE")
    print("="*70)


if __name__ == '__main__':
    main()
