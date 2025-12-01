/**
 * k6 Unary RPC Benchmark
 * 
 * Tests the SayHello unary RPC comparing gRPC implementations SEQUENTIALLY:
 * 1. gRPC protocol through ConnectRPC server (nestjs-buf-connect)
 * 2. Standard NestJS gRPC using @grpc/grpc-js
 * 
 * NOTE: Connect protocol (HTTP/2) testing is not included because k6's http
 * module only supports HTTP/1.x. The ConnectRPC server uses HTTP/2 which is
 * incompatible with k6's HTTP client. Use 'buf curl' or grpcurl for Connect tests.
 * 
 * IMPORTANT: Each protocol is tested in isolation to ensure accurate measurements.
 * The scenarios run one after another, not concurrently.
 * 
 * Usage:
 *   k6 run unary.js                          # Run all gRPC protocols sequentially
 *   k6 run unary.js --env SCENARIO=grpc-connect
 *   k6 run unary.js --env SCENARIO=grpc-standard
 */

import grpc from 'k6/net/grpc';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics - one per protocol for isolated measurement
const grpcConnectErrorRate = new Rate('grpc_connect_errors');
const grpcStandardErrorRate = new Rate('grpc_standard_errors');

const grpcConnectLatency = new Trend('grpc_connect_latency', true);
const grpcStandardLatency = new Trend('grpc_standard_latency', true);

// Configuration
const CONNECT_SERVER = __ENV.CONNECT_SERVER || 'localhost:50051';
const GRPC_STANDARD_SERVER = __ENV.GRPC_STANDARD_SERVER || 'localhost:50052';
const SCENARIO = __ENV.SCENARIO || 'all';

// gRPC clients (created per-protocol to avoid connection reuse across tests)
const grpcConnectClient = new grpc.Client();
const grpcStandardClient = new grpc.Client();

// Load proto definitions in init context (required by k6)
// Path is relative to the k6 script location (benchmarks/k6/)
grpcConnectClient.load(['../../proto'], 'example/v1/example.proto');
grpcStandardClient.load(['../../proto'], 'example/v1/example.proto');

// Scenario timing configuration
// Each protocol gets its own isolated test window
const WARMUP_DURATION = '10s';
const RAMP_UP_DURATION = '20s';
const SUSTAINED_DURATION = '40s';
const PEAK_DURATION = '20s';
const RAMP_DOWN_DURATION = '15s';

// Calculate start times for sequential execution
// Protocol 1 (gRPC-Connect): 0s
// Protocol 2 (gRPC-Standard): after Protocol 1 completes
const PHASE_DURATION = 115; // Total seconds per protocol phase (10+20+40+20+15 + buffer)

function buildScenarioOptions() {
  const scenarios = {};
  
  if (SCENARIO === 'all' || SCENARIO === 'grpc-connect') {
    scenarios.grpc_connect_warmup = {
      executor: 'constant-vus',
      vus: 10,
      duration: WARMUP_DURATION,
      startTime: '0s',
      exec: 'testGrpcConnect',
      tags: { protocol: 'grpc-connect', phase: 'warmup' },
    };
    scenarios.grpc_connect_load = {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: RAMP_UP_DURATION, target: 50 },
        { duration: SUSTAINED_DURATION, target: 50 },
        { duration: PEAK_DURATION, target: 100 },
        { duration: RAMP_DOWN_DURATION, target: 0 },
      ],
      startTime: '10s',
      exec: 'testGrpcConnect',
      tags: { protocol: 'grpc-connect', phase: 'load' },
    };
  }
  
  if (SCENARIO === 'all' || SCENARIO === 'grpc-standard') {
    const startOffset = SCENARIO === 'all' ? PHASE_DURATION : 0;
    scenarios.grpc_standard_warmup = {
      executor: 'constant-vus',
      vus: 10,
      duration: WARMUP_DURATION,
      startTime: `${startOffset}s`,
      exec: 'testGrpcStandard',
      tags: { protocol: 'grpc-standard', phase: 'warmup' },
    };
    scenarios.grpc_standard_load = {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: RAMP_UP_DURATION, target: 50 },
        { duration: SUSTAINED_DURATION, target: 50 },
        { duration: PEAK_DURATION, target: 100 },
        { duration: RAMP_DOWN_DURATION, target: 0 },
      ],
      startTime: `${startOffset + 10}s`,
      exec: 'testGrpcStandard',
      tags: { protocol: 'grpc-standard', phase: 'load' },
    };
  }
  
  return scenarios;
}

export const options = {
  scenarios: buildScenarioOptions(),
  thresholds: {
    // Per-protocol error rates
    'grpc_connect_errors': ['rate<0.01'],
    'grpc_standard_errors': ['rate<0.01'],
    // Per-protocol latency thresholds
    'grpc_connect_latency': ['p(95)<100', 'p(99)<200'],
    'grpc_standard_latency': ['p(95)<100', 'p(99)<200'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

export function setup() {
  console.log('='.repeat(60));
  console.log('Unary RPC Benchmark - gRPC COMPARISON');
  console.log('='.repeat(60));
  console.log(`Mode: ${SCENARIO === 'all' ? 'Both gRPC implementations (sequential)' : SCENARIO}`);
  console.log(`ConnectRPC Server (gRPC): ${CONNECT_SERVER}`);
  console.log(`Standard gRPC Server: ${GRPC_STANDARD_SERVER}`);
  console.log('');
  if (SCENARIO === 'all') {
    console.log('Execution order:');
    console.log('  1. gRPC via ConnectRPC (0s - 115s)');
    console.log('  2. Standard gRPC (115s - 230s)');
  }
  console.log('='.repeat(60));
  
  return {
    connectServer: CONNECT_SERVER,
    grpcStandardServer: GRPC_STANDARD_SERVER,
  };
}

/**
 * Test gRPC via ConnectRPC server - called by grpc_connect_* scenarios
 */
export function testGrpcConnect(data) {
  const request = { name: `User-${__VU}-${__ITER}` };
  testGrpcConnectProtocol(data ? data.connectServer : CONNECT_SERVER, request);
  sleep(0.01);
}

/**
 * Test standard gRPC - called by grpc_standard_* scenarios
 */
export function testGrpcStandard(data) {
  const request = { name: `User-${__VU}-${__ITER}` };
  testGrpcStandardProtocol(data ? data.grpcStandardServer : GRPC_STANDARD_SERVER, request);
  sleep(0.01);
}

// Default function (not used when scenarios have exec specified)
export default function() {
  // This won't be called when using scenario-specific exec functions
}

/**
 * Test gRPC protocol through ConnectRPC server
 * This function is called in isolation - no other protocols run concurrently.
 */
function testGrpcConnectProtocol(server, request) {
  grpcConnectClient.connect(server, {
    plaintext: true,
    reflect: false,
  });
  
  const startTime = Date.now();
  const response = grpcConnectClient.invoke(
    'example.v1.ExampleService/SayHello',
    request,
    { tags: { protocol: 'grpc-connect' } }
  );
  const duration = Date.now() - startTime;
  
  grpcConnectLatency.add(duration);
  
  const success = check(response, {
    'grpc-connect: status is OK': (r) => r && r.status === grpc.StatusOK,
    'grpc-connect: has message': (r) => r && r.message && r.message.message && r.message.message.includes('Hello'),
  });
  
  grpcConnectErrorRate.add(!success);
  
  grpcConnectClient.close();
}

/**
 * Test standard NestJS gRPC using @grpc/grpc-js
 * This function is called in isolation - no other protocols run concurrently.
 */
function testGrpcStandardProtocol(server, request) {
  grpcStandardClient.connect(server, {
    plaintext: true,
    reflect: false,
  });
  
  const startTime = Date.now();
  const response = grpcStandardClient.invoke(
    'example.v1.ExampleService/SayHello',
    request,
    { tags: { protocol: 'grpc-standard' } }
  );
  const duration = Date.now() - startTime;
  
  grpcStandardLatency.add(duration);
  
  const success = check(response, {
    'grpc-standard: status is OK': (r) => r && r.status === grpc.StatusOK,
    'grpc-standard: has message': (r) => r && r.message && r.message.message && r.message.message.includes('Hello'),
  });
  
  grpcStandardErrorRate.add(!success);
  
  grpcStandardClient.close();
}

export function teardown(data) {
  console.log('');
  console.log('='.repeat(60));
  console.log('Benchmark Complete');
  console.log('='.repeat(60));
}

export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `results/unary-${timestamp}.json`;
  
  // Create summary object with per-protocol metrics
  const summary = {
    timestamp: new Date().toISOString(),
    scenario: SCENARIO,
    testMode: 'sequential', // Each protocol tested in isolation
    servers: {
      grpcConnect: CONNECT_SERVER,
      grpcStandard: GRPC_STANDARD_SERVER,
    },
    metrics: {
      grpcConnect: {
        latency: extractMetrics(data, 'grpc_connect_latency'),
        errorRate: data.metrics.grpc_connect_errors?.values.rate || 0,
      },
      grpcStandard: {
        latency: extractMetrics(data, 'grpc_standard_latency'),
        errorRate: data.metrics.grpc_standard_errors?.values.rate || 0,
      },
    },
    iterations: data.metrics.iterations ? data.metrics.iterations.values.count : 0,
  };
  
  return {
    [filename]: JSON.stringify(summary, null, 2),
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function extractMetrics(data, metricName) {
  const metric = data.metrics[metricName];
  if (!metric) return null;
  
  return {
    avg: metric.values.avg,
    min: metric.values.min,
    med: metric.values.med,
    max: metric.values.max,
    p90: metric.values['p(90)'],
    p95: metric.values['p(95)'],
    p99: metric.values['p(99)'],
    count: metric.values.count,
  };
}

function textSummary(data, options) {
  let output = '\n';
  output += '='.repeat(70) + '\n';
  output += '  UNARY RPC BENCHMARK: gRPC via ConnectRPC vs Standard gRPC\n';
  output += '='.repeat(70) + '\n\n';
  
  output += 'Note: Each implementation was tested in ISOLATION (not concurrently)\n\n';
  
  // Protocol comparison table
  output += 'Latency Comparison (ms):\n';
  output += '-'.repeat(70) + '\n';
  output += formatRow(['Implementation', 'Avg', 'P50', 'P90', 'P95', 'P99', 'Max']);
  output += '-'.repeat(70) + '\n';
  
  const protocols = [
    { name: 'gRPC (ConnectRPC)', metric: 'grpc_connect_latency', errors: 'grpc_connect_errors' },
    { name: 'gRPC (Standard)', metric: 'grpc_standard_latency', errors: 'grpc_standard_errors' },
  ];
  
  for (const proto of protocols) {
    const m = data.metrics[proto.metric];
    if (m) {
      output += formatRow([
        proto.name,
        m.values.avg?.toFixed(2) || 'N/A',
        m.values.med?.toFixed(2) || 'N/A',
        m.values['p(90)']?.toFixed(2) || 'N/A',
        m.values['p(95)']?.toFixed(2) || 'N/A',
        m.values['p(99)']?.toFixed(2) || 'N/A',
        m.values.max?.toFixed(2) || 'N/A',
      ]);
    }
  }
  
  output += '-'.repeat(70) + '\n\n';
  
  // Error rates per protocol
  output += 'Error Rates:\n';
  for (const proto of protocols) {
    const errMetric = data.metrics[proto.errors];
    if (errMetric) {
      const errRate = (errMetric.values.rate * 100).toFixed(2);
      output += `  ${proto.name.padEnd(18)}: ${errRate}%\n`;
    }
  }
  output += '\n';
  
  // Summary stats
  if (data.metrics.iterations) {
    const iters = data.metrics.iterations.values;
    output += `Total Iterations: ${iters.count}\n`;
  }
  
  output += '\n' + '='.repeat(70) + '\n';
  
  return output;
}

function formatRow(columns) {
  const widths = [18, 8, 8, 8, 8, 8, 8];
  return columns.map((col, i) => String(col).padEnd(widths[i])).join(' ') + '\n';
}
