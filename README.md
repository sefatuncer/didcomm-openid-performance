# DIDComm vs OpenID4VC Protocol Simulation

Performance estimation of DIDComm v2 and OpenID4VC (OID4VCI/OID4VP) credential exchange protocols using protocol-compliant message structures with cryptographic timing derived from published benchmarks.

> **⚠️ Important Methodological Note**: This implementation uses **timing injection** rather than full cryptographic implementations. Results represent *estimations* based on published benchmark data, not direct measurements of cryptographic operations. This approach enables reproducible protocol comparison while capturing realistic overhead differentials.

## Quick Start

```bash
cd repo
docker-compose -f docker/docker-compose.yaml up --build
```

Results saved to `data/raw/benchmark-summary-*.csv`

## Methodology

This implementation uses **timing injection** based on published benchmarks rather than full cryptographic implementations. Protocol-compliant test agents simulate actual message exchange patterns while injecting cryptographic overhead derived from peer-reviewed literature. This approach enables reproducible measurements while capturing the cryptographic overhead differential between AnonCreds CL-signatures and SD-JWT ECDSA operations.

**Cryptographic Timing Sources:**

| Operation | DIDComm (AnonCreds) | OpenID4VC (SD-JWT) | Source |
|-----------|---------------------|-------------------|--------|
| Signature Generation | 15-25ms (CL) | 1-3ms (ECDSA) | libindy, jose |
| Proof Generation | 20-45ms (ZKP) | 0.2-0.5ms (hash) | Indy SDK |
| Verification | 10-20ms | 1-2ms | Published benchmarks |

## Test Configuration

- **Iterations**: 1000 per scenario (configurable via `ITERATIONS` env var)
- **Warmup**: 100 iterations
- **Inter-iteration delay**: 10ms
- **Statistical analysis**: Welch's t-test, Cohen's d, 95% CI

## Scenarios

| Scenario | DIDComm Messages | OpenID4VC Exchanges |
|----------|------------------|---------------------|
| Credential Issuance | 5 (propose→offer→request→issue→ack) | 4 (offer→auth→token→credential) |
| Credential Presentation | 4 (request→present→verify→ack) | 2 (request→response) |
| Selective Disclosure | 4 (predicate request→proof→verify→ack) | 2 (request→response) |

## Project Structure

```
repo/
├── docker/
│   ├── docker-compose.yaml      # Multi-container orchestration
│   ├── Dockerfile.didcomm       # DIDComm agent container
│   ├── Dockerfile.openid4vc     # OpenID4VC agent container
│   └── Dockerfile.benchmark     # Benchmark runner container
├── src/
│   ├── agents/
│   │   ├── real-didcomm-agent.js    # Protocol-compliant DIDComm v2
│   │   └── real-openid4vc-agent.js  # Protocol-compliant OID4VCI/VP
│   └── docker-benchmark-runner.js   # Statistical benchmark runner
└── data/raw/                        # Output CSV files
```

## License

MIT
