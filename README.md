# DIDComm vs OpenID4VC Performance Benchmark

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This repository contains the benchmark implementation, raw data, and analysis scripts for the paper:

> **"A Hybrid DIDComm-OpenID4VC Architecture for Enterprise Verifiable Credentials: Design, Implementation, and Performance Analysis"**

## Abstract

Comparative performance analysis of DIDComm and OpenID for Verifiable Credentials (OpenID4VC) protocols, measuring protocol-level overhead through controlled benchmarks of 1,000 iterations per scenario. Results indicate OpenID4VC exhibits 27–46% lower protocol overhead due to fewer round-trips (2–4 vs 4–5) and smaller message sizes (50% reduction).

## Repository Structure

```
├── src/
│   ├── agents/                 # Credo-based agent implementations
│   │   ├── issuer.ts          # Issuer agent (DIDComm + OID4VCI)
│   │   ├── holder.ts          # Holder agent (wallet)
│   │   └── verifier.ts        # Verifier agent (DIDComm + OID4VP)
│   ├── benchmark/
│   │   ├── runner.ts          # Main benchmark orchestrator
│   │   ├── scenarios.ts       # Test scenarios (issuance, presentation, selective disclosure)
│   │   └── metrics.ts         # Timing and statistics collection
│   ├── bridge/
│   │   └── protocol-bridge.ts # DIDComm ↔ OpenID4VC translation
│   ├── docker-benchmark-runner.js  # Docker benchmark runner
│   └── config/
│       └── agent-config.ts    # Agent configuration
├── data/
│   ├── raw/                   # Raw benchmark results (JSON)
│   ├── processed/             # Processed statistics
│   └── figures/               # Generated plots
├── scripts/
│   ├── run-benchmark.sh       # Execute full benchmark suite
│   ├── analyze.py             # Statistical analysis
│   └── plot-figures.py        # Generate paper figures
├── docker/
│   ├── docker-compose.yaml    # Multi-container deployment
│   ├── Dockerfile.agent       # Agent container image
│   └── Dockerfile.benchmark   # Benchmark runner image
└── docs/
    └── METHODOLOGY.md         # Detailed methodology description
```

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Python >= 3.9 (for analysis scripts)

### Running Benchmarks with Docker

```bash
# Clone repository
git clone https://github.com/sefatuncer/didcomm-openid-performance.git
cd didcomm-openid-performance

# Run full benchmark suite with Docker Compose
docker-compose -f docker/docker-compose.yaml up --build

# Results will be saved to data/raw/
```

### Custom Configuration

You can customize benchmark parameters via environment variables:

```bash
# Run with custom iterations
ITERATIONS=500 WARMUP_ITERATIONS=50 docker-compose -f docker/docker-compose.yaml up --build
```

### Analyzing Results

```bash
# Generate statistics
python scripts/analyze.py data/raw/

# Generate figures for paper
python scripts/plot-figures.py data/processed/ data/figures/
```

## Benchmark Scenarios

| Scenario | Description | DIDComm Flow | OpenID4VC Flow |
|----------|-------------|--------------|----------------|
| Credential Issuance | Complete issuance from offer to storage | 5 messages | 4 exchanges |
| Credential Presentation | Proof request to verification | 4 messages | 2 exchanges |
| Selective Disclosure | Partial attribute revelation | 4 messages (CL predicates) | 2 exchanges (SD-JWT) |

## Key Results

| Scenario | DIDComm (ms) | OpenID4VC (ms) | Improvement |
|----------|--------------|----------------|-------------|
| Issuance | 192.54 ± 16.52 | 139.54 ± 11.28 | -27.5% |
| Presentation | 174.06 ± 14.89 | 106.58 ± 10.42 | -38.8% |
| Selective Disclosure | 218.96 ± 18.74 | 117.77 ± 12.86 | -46.2% |

All comparisons statistically significant (p < 0.001, Cohen's d > 3.0).

## Docker Services

The benchmark suite consists of three Docker containers:

| Service | Port | Description |
|---------|------|-------------|
| didcomm-agent | 3100 | DIDComm protocol agent |
| openid4vc-agent | 4100 | OpenID4VC protocol agent |
| benchmark | - | Benchmark runner (exits after completion) |

## Hardware Configuration

Benchmarks executed on:
- **CPU**: Intel Core i7-12700K
- **RAM**: 32GB DDR4-3200
- **Storage**: NVMe SSD
- **Container Resources**: 4 CPU cores, 8GB memory per agent
- **Network**: Docker bridge (sub-millisecond latency)

## Citation

```bibtex
@article{tuncer2024hybrid,
  title={A Hybrid DIDComm-OpenID4VC Architecture for Enterprise Verifiable Credentials: Design, Implementation, and Performance Analysis},
  author={Tuncer, Sefa},
  journal={IET Blockchain},
  year={2024},
  note={Under Review}
}
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contact

- **Author**: Sefa Tuncer
- **Email**: tuncersefa@gmail.com

## Acknowledgments

- Hyperledger Aries Community
- OpenID Foundation
- Credo Framework Contributors
