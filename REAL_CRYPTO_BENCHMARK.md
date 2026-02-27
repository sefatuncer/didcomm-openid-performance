# Real Cryptographic Benchmark Implementation

Bu belge, DIDComm+AnonCreds ve OpenID4VC+SD-JWT protokollerinin gerçek kriptografik operasyonlarla benchmark edilmesi için oluşturulan implementasyonu açıklar.

## Motivasyon

Hakem değerlendirmelerinde belirlenen kritik sorun: **Simülasyon bazlı benchmark gerçekliği yansıtmıyor**

Mevcut implementasyon `simulateDIDCommEncryption()`, `simulateAnonCredsSigning()` gibi fonksiyonlarla yapay gecikme ekliyordu. Bu revizyon gerçek kriptografik operasyonları kullanır.

## Yeni Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `src/agents/real-crypto-didcomm.js` | Gerçek AnonCreds CL-signature operasyonları |
| `src/agents/real-crypto-openid4vc.js` | Gerçek ECDSA ES256 ve SD-JWT operasyonları |
| `src/benchmark/real-benchmark-runner.js` | Benchmark orchestrator |
| `scripts/real-analysis.py` | İstatistiksel analiz (Welch's t-test, Cohen's d) |
| `docker/docker-compose.real.yaml` | Docker compose yapılandırması |
| `docker/Dockerfile.real-didcomm` | DIDComm agent Dockerfile |
| `docker/Dockerfile.real-openid4vc` | OpenID4VC agent Dockerfile |
| `docker/Dockerfile.real-benchmark` | Benchmark runner Dockerfile |

## Kriptografik Operasyonlar

### DIDComm + AnonCreds

| Operasyon | Açıklama | Gerçek İmplementasyon |
|-----------|----------|----------------------|
| DIDComm Encryption | XChaCha20-Poly1305 | `crypto.createCipheriv('chacha20-poly1305')` |
| Blinding Factor | Link secret blinding | RSA-based modular exponentiation |
| CL Signature | Camenisch-Lysyanskaya | RSA modular operations |
| ZKP Proof Gen | Zero-knowledge proof | Schnorr-like proof with hash chains |
| ZKP Verification | Proof verification | Hash verification |
| Predicate Proof | Range proof (GPA >= 3.0) | Extended ZKP with range commitments |

### OpenID4VC + SD-JWT

| Operasyon | Açıklama | Gerçek İmplementasyon |
|-----------|----------|----------------------|
| ECDSA Signing | ES256 (P-256) | `crypto.createSign('SHA256')` |
| ECDSA Verification | ES256 verification | `crypto.createVerify('SHA256')` |
| SD-JWT Creation | Selective disclosures | SHA-256 hash + base64url encoding |
| Key Binding JWT | Holder proof of possession | ECDSA signing |
| SD-JWT Verification | Signature + hash verify | Multiple SHA-256 + ECDSA verify |

## Çalıştırma

### Yerel Çalıştırma

```bash
# Bağımlılıkları kur
cd repo
npm install

# DIDComm agent'ı başlat (terminal 1)
npm run agent:didcomm

# OpenID4VC agent'ı başlat (terminal 2)
npm run agent:openid4vc

# Benchmark çalıştır (terminal 3)
npm run benchmark:real
```

### Docker ile Çalıştırma

```bash
# Build ve çalıştır
docker compose -f docker/docker-compose.real.yaml up --build

# Sonuçları kontrol et
ls data/raw/real-benchmarks/
```

### Tek Protokol Testi

```bash
# Sadece DIDComm
PROTOCOL=didcomm npm run benchmark:real

# Sadece OpenID4VC
PROTOCOL=openid4vc npm run benchmark:real
```

## Benchmark Endpoint'leri

### DIDComm Agent (Port 13000)

```
POST /didcomm/issue           - Credential issuance (5 round-trips)
POST /didcomm/present         - Credential presentation (4 round-trips)
POST /didcomm/selective-disclose - Predicate proof (4 round-trips)
GET  /health                  - Agent status
```

### OpenID4VC Agent (Port 14000)

```
POST /openid4vc/issue         - OID4VCI issuance (4 round-trips)
POST /openid4vc/present       - OID4VP presentation (2 round-trips)
POST /openid4vc/selective-disclose - SD-JWT selective disclosure (2 round-trips)
GET  /health                  - Agent status
```

## İstatistiksel Analiz

```bash
# Benchmark sonuçlarını analiz et
python scripts/real-analysis.py data/raw/real-benchmarks/real-benchmark-*.json
```

Çıktılar:
- Welch's t-test (bağımsız gruplar)
- Mann-Whitney U test (non-parametric)
- Cohen's d effect size
- 95% Confidence Intervals
- Percentile distributions (P50, P95, P99)
- LaTeX table (makale için)

## Beklenen Sonuçlar

Gerçek kriptografik operasyonlarla beklenen latency değerleri:

| Senaryo | DIDComm+AnonCreds | OpenID4VC+SD-JWT | Δ% |
|---------|-------------------|------------------|-----|
| Issuance | 80-120 ms | 15-25 ms | ~75-85% |
| Presentation | 90-150 ms | 8-15 ms | ~85-90% |
| Selective Disclosure | 120-200 ms | 10-18 ms | ~88-92% |

**Not:** AnonCreds CL-signature operasyonları CPU-yoğun olduğundan simülasyondan daha yavaş çalışacaktır.

## Doğrulama Kriterleri

- [ ] DIDComm mesajları gerçek chacha20-poly1305 ile şifrelendi
- [ ] CL signature hesaplamaları RSA modular operations kullanıyor
- [ ] ZKP proof generation Schnorr-like hash chains içeriyor
- [ ] SD-JWT ECDSA P-256 (ES256) ile imzalandı
- [ ] Key binding JWT holder private key ile imzalandı
- [ ] Latency değerleri literatür ile tutarlı (±20%)
- [ ] İstatistiksel anlamlılık sağlandı (p < 0.001)

## Referanslar

- DIF DIDComm Performance Study (2023)
- Hyperledger Indy Performance Analysis (Thwin & Vasupongayya, 2021)
- Camenisch-Lysyanskaya Signatures Performance Analysis
- jose library benchmarks
- draft-ietf-oauth-sd-jwt-vc specification
