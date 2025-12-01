# gRPC/ConnectRPC Benchmark Suite

Performance comparison between ConnectRPC and standard NestJS gRPC implementations.

## Key Design Principle

**Each protocol is benchmarked in complete isolation.** The tests run sequentially, ensuring that:

- Only one protocol is under load at any given time
- Results are not contaminated by concurrent resource competition
- Latency measurements accurately reflect each protocol's performance

## Overview

This benchmark suite compares gRPC implementations:

| Configuration | Transport | Protocol | Port |
|--------------|-----------|----------|------|
| ConnectRPC (gRPC) | `@connectrpc/connect-node` | gRPC | 50051 |
| Standard NestJS gRPC | `@grpc/grpc-js` | gRPC | 50052 |

> **Note:** Connect protocol (HTTP/2) testing via k6 is not supported because k6's HTTP module only supports HTTP/1.x. Use `buf curl` for Connect protocol testing.

## Prerequisites

### k6 Installation

k6 is a modern load testing tool. Install it based on your platform:

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Docker
docker pull grafana/k6
```

### Other Requirements

- Node.js 18+
- pnpm

## Quick Start

```bash
# From the benchmarks directory
cd benchmarks

# Run unary benchmark (k6)
./k6/run-all.sh

# Run streaming benchmark (ghz) - requires: brew install ghz
./ghz/run-streaming.sh

# Quick streaming test
./ghz/run-streaming.sh quick

# Run both benchmarks
pnpm benchmark:all
```

## Manual Execution

If you prefer to run benchmarks manually:

```bash
# 1. Build servers
cd examples/connect-example && pnpm build
cd benchmarks/standard-grpc && pnpm build

# 2. Start ConnectRPC server (terminal 1)
cd examples/connect-example
PORT=50051 node dist/main.js

# 3. Start Standard gRPC server (terminal 2)
cd benchmarks/standard-grpc
PORT=50052 node dist/main.js

# 4. Run benchmarks (terminal 3)
cd benchmarks
k6 run ./k6/unary.js
k6 run ./k6/server-stream.js
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CONNECT_PORT` | 50051 | ConnectRPC server port |
| `GRPC_PORT` | 50052 | Standard gRPC server port |
| `SKIP_BUILD` | 0 | Set to 1 to skip building servers |
| `MESSAGE_COUNT` | 5 | Messages per stream (streaming tests) |
| `SCENARIO` | all | `connect`, `grpc-connect`, `grpc-standard`, or `all` |

### k6 Options

Pass k6 options via environment variable:

```bash
K6_OPTIONS="--vus 100 --duration 60s" ./k6/run-all.sh
```

## Test Scenarios

**IMPORTANT: Sequential Testing**

Each protocol is tested in **complete isolation**. The benchmarks do NOT stress multiple protocols simultaneously. This ensures accurate, comparable measurements without cross-contamination of results.

### Unary RPC (`unary.js`)

Tests the `SayHello` method with a simple request/response pattern.

**Execution Order:**

1. **gRPC via ConnectRPC** (0s - 115s)
2. **Standard gRPC** (115s - 230s)

**Total Duration:** ~4 minutes

**Per-Implementation Phases:**

1. **Warmup** (10s): 10 VUs to establish connections and warm JIT
2. **Ramp Up** (20s): Scale to 50 VUs
3. **Sustained** (40s): Hold at 50 VUs
4. **Peak** (20s): Scale to 100 VUs
5. **Ramp Down** (15s): Scale back to 0

### Server Streaming (`ghz/run-streaming.sh`)

Uses `ghz` (a dedicated gRPC benchmarking tool) since k6's gRPC module only supports unary RPCs.

**Prerequisites:**

```bash
brew install ghz
```

**Execution Order:**

1. **gRPC via ConnectRPC** - Full benchmark with 50 concurrent workers
2. **Standard gRPC** - Same benchmark for comparison

**Default Settings:**

- Concurrency: 50 workers
- Total Requests: 10,000
- Messages per Stream: 5

**Usage:**

```bash
# Full streaming benchmark
./ghz/run-streaming.sh

# Quick test (10 workers, 1000 requests)
./ghz/run-streaming.sh quick

# Test only ConnectRPC
./ghz/run-streaming.sh connect

# Test only Standard gRPC
./ghz/run-streaming.sh standard
```

## Interpreting Results

### Key Metrics

| Metric | Description | Good Value |
|--------|-------------|------------|
| `p50` (median) | Typical latency | < 10ms |
| `p95` | 95th percentile latency | < 50ms |
| `p99` | 99th percentile latency | < 100ms |
| `errors` | Error rate | < 1% |
| `iterations/s` | Throughput | Higher is better |

### Expected Observations

1. **gRPC via ConnectRPC vs Standard gRPC**
   - Should show **similar performance** since both use HTTP/2 with gRPC framing
   - Minor differences may occur due to:
     - ConnectRPC's routing/handler dispatch overhead
     - NestJS decorator processing differences
   - **This is the critical validation** - proves the ConnectRPC transport layer adds minimal overhead

2. **Streaming Tests**
   - Higher latency is expected (multiple messages per stream)
   - Look at throughput (messages/second)
   - Connection reuse patterns may affect results

3. **What to look for**
   - p95/p99 latencies should be within ~10-20% of each other
   - Error rates should be 0% for both implementations
   - If ConnectRPC shows significantly higher latency, investigate handler routing

### Sample Output

```
======================================================================
  UNARY RPC BENCHMARK: gRPC via ConnectRPC vs Standard gRPC
======================================================================

Note: Each implementation was tested in ISOLATION (not concurrently)

Latency Comparison (ms):
----------------------------------------------------------------------
Implementation     Avg      P50      P90      P95      P99      Max     
----------------------------------------------------------------------
gRPC (ConnectRPC)  0.43     0.00     1.00     1.00     3.00     18.00   
gRPC (Standard)    0.49     0.00     1.00     1.00     2.00     38.00   
----------------------------------------------------------------------

Error Rates:
  gRPC (ConnectRPC) : 0.00%
  gRPC (Standard)   : 0.00%

Total Iterations: 847735
======================================================================
```

**Key Insight:** ConnectRPC's gRPC implementation shows **equivalent or slightly better** performance compared to the standard `@grpc/grpc-js` transport, validating that `nestjs-buf-connect` adds minimal overhead.

## Results Directory

Benchmark results are saved to `benchmarks/results/`:

- `unary-<timestamp>.json` - Unary benchmark results
- `server-stream-<timestamp>.json` - Streaming benchmark results
- `summary-<timestamp>.txt` - Human-readable summary
- `connect-server.log` - ConnectRPC server logs
- `grpc-server.log` - Standard gRPC server logs

## Troubleshooting

### "Connection refused" errors

Ensure servers are running on the correct ports:

```bash
# Check if ports are in use
lsof -i :50051
lsof -i :50052
```

### k6 proto loading fails

k6 needs access to the proto files. Run from the repo root:

```bash
cd /path/to/nestjs-buf-connect
./benchmarks/k6/run-all.sh
```

### High error rates

1. Check server logs in `results/` directory
2. Reduce VU count: `K6_OPTIONS="--vus 10"`
3. Increase server resources

### "Address already in use"

Kill existing processes:

```bash
pkill -f "node.*main.js"
# or
kill $(lsof -t -i:50051)
kill $(lsof -t -i:50052)
```

## Architecture Notes

### ConnectRPC Server

The ConnectRPC server (`examples/connect-example`) uses `nestjs-buf-connect` which:

- Wraps `@connectrpc/connect-node`
- Supports Connect, gRPC, and gRPC-web protocols simultaneously
- Uses Buf-generated TypeScript types

### Standard gRPC Server

The standard gRPC server (`benchmarks/standard-grpc`) uses:

- `@nestjs/microservices` with `Transport.GRPC`
- `@grpc/grpc-js` as the underlying transport
- Dynamic proto loading (no code generation needed)

Both servers implement identical functionality for fair comparison.

## Contributing

When adding new benchmarks:

1. Create a new k6 script in `benchmarks/k6/`
2. Follow the existing pattern for metrics and reporting
3. Update `run-all.sh` to include the new benchmark
4. Document expected results and interpretation
