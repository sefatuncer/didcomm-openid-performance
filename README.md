# DIDComm vs OpenID4VC Benchmark

Performance comparison of DIDComm and OpenID4VC credential exchange protocols.

## Quick Start

```bash
docker-compose -f docker/docker-compose.yaml up --build
```

Results will be saved to `data/raw/`.

## Scenarios

| Scenario | DIDComm | OpenID4VC |
|----------|---------|-----------|
| Credential Issuance | 5 messages | 4 exchanges |
| Credential Presentation | 4 messages | 2 exchanges |
| Selective Disclosure | 4 messages | 2 exchanges |

## License

MIT
