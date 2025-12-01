/**
 * k6 Server Streaming RPC Benchmark
 * 
 * Tests the ServerStream RPC comparing gRPC implementations SEQUENTIALLY:
 * 1. gRPC protocol through ConnectRPC server (nestjs-buf-connect)
 * 2. Standard NestJS gRPC using @grpc/grpc-js
 * 
 * NOTE: Connect protocol (HTTP/2) testing is not included because k6's http
 * module only supports HTTP/1.x. Use 'buf curl' for Connect protocol tests.
 * 
 * IMPORTANT: Each protocol is tested in isolation to ensure accurate measurements.
 * The scenarios run one after another, not concurrently.
 * 
 * Measures:
 * - Total stream completion time
 * - Messages received count
 * - Error rates per protocol
 * 
 * Usage:
 *   k6 run server-stream.js                          # Run all gRPC protocols sequentially
 *   k6 run server-stream.js --env SCENARIO=grpc-connect
 *   k6 run server-stream.js --env SCENARIO=grpc-standard
 *   k6 run server-stream.js --env MESSAGE_COUNT=10
 */

import grpc from 'k6/net/grpc';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Per-protocol error rates
const grpcConnectErrorRate = new Rate('grpc_connect_errors');
const grpcStandardErrorRate = new Rate('grpc_standard_errors');

// Latency metrics (time to complete full stream)
const grpcConnectStreamDuration = new Trend('grpc_connect_stream_duration', true);
const grpcStandardStreamDuration = new Trend('grpc_standard_stream_duration', true);

// Message count metrics
const grpcConnectMessages = new Counter('grpc_connect_messages_received');
const grpcStandardMessages = new Counter('grpc_standard_messages_received');

// Configuration
const CONNECT_SERVER = __ENV.CONNECT_SERVER || 'localhost:50051';
const GRPC_STANDARD_SERVER = __ENV.GRPC_STANDARD_SERVER || 'localhost:50052';
const SCENARIO = __ENV.SCENARIO || 'all';
const MESSAGE_COUNT = parseInt(__ENV.MESSAGE_COUNT || '5', 10);

// gRPC clients
const grpcConnectClient = new grpc.Client();
const grpcStandardClient = new grpc.Client();

// Load proto definitions in init context (required by k6)
// Path is relative to the k6 script location (benchmarks/k6/)
grpcConnectClient.load(['../../proto'], 'example/v1/example.proto');
grpcStandardClient.load(['../../proto'], 'example/v1/example.proto');

// Scenario timing configuration
const WARMUP_DURATION = '10s';
const RAMP_UP_DURATION = '15s';
const SUSTAINED_DURATION = '40s';
const PEAK_DURATION = '15s';
const RAMP_DOWN_DURATION = '15s';

// Calculate start times for sequential execution
const PHASE_DURATION = 105; // Total seconds per protocol phase

function buildScenarioOptions() {
  const scenarios = {};
  
  if (SCENARIO === 'all' || SCENARIO === 'grpc-connect') {
    scenarios.grpc_connect_warmup = {
      executor: 'constant-vus',
      vus: 5,
      duration: WARMUP_DURATION,
      startTime: '0s',
      exec: 'testGrpcConnect',
      tags: { protocol: 'grpc-connect', phase: 'warmup' },
    };
    scenarios.grpc_connect_load = {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: RAMP_UP_DURATION, target: 25 },
        { duration: SUSTAINED_DURATION, target: 25 },
        { duration: PEAK_DURATION, target: 50 },
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
      vus: 5,
      duration: WARMUP_DURATION,
      startTime: `${startOffset}s`,
      exec: 'testGrpcStandard',
      tags: { protocol: 'grpc-standard', phase: 'warmup' },
    };
    scenarios.grpc_standard_load = {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: RAMP_UP_DURATION, target: 25 },
        { duration: SUSTAINED_DURATION, target: 25 },
        { duration: PEAK_DURATION, target: 50 },
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
    'grpc_connect_errors': ['rate<0.01'],
    'grpc_standard_errors': ['rate<0.01'],
    // Stream completion time thresholds (more lenient for streaming)
    'grpc_connect_stream_duration': ['p(95)<500', 'p(99)<1000'],
    'grpc_standard_stream_duration': ['p(95)<500', 'p(99)<1000'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

export function setup() {
  console.log('='.repeat(60));
  console.log('Server Streaming RPC Benchmark - gRPC COMPARISON');
  console.log('='.repeat(60));
  console.log(`Mode: ${SCENARIO === 'all' ? 'Both gRPC implementations (sequential)' : SCENARIO}`);
  console.log(`Message Count per Stream: ${MESSAGE_COUNT}`);
  console.log(`ConnectRPC Server (gRPC): ${CONNECT_SERVER}`);
  console.log(`Standard gRPC Server: ${GRPC_STANDARD_SERVER}`);
  console.log('');
  if (SCENARIO === 'all') {
    console.log('Execution order:');
    console.log('  1. gRPC via ConnectRPC (0s - 105s)');
    console.log('  2. Standard gRPC (105s - 210s)');
  }
  console.log('='.repeat(60));
  
  return {
    connectServer: CONNECT_SERVER,
    grpcStandardServer: GRPC_STANDARD_SERVER,
    messageCount: MESSAGE_COUNT,
  };
}

/**
 * Test gRPC via ConnectRPC server - called by grpc_connect_* scenarios
 */
export function testGrpcConnect(data) {
  const request = {
    data: `Stream-${__VU}-${__ITER}`,
    count: data ? data.messageCount : MESSAGE_COUNT,
  };
  testGrpcConnectServerStream(data ? data.connectServer : CONNECT_SERVER, request);
  sleep(0.05);
}

/**
 * Test standard gRPC - called by grpc_standard_* scenarios
 */
export function testGrpcStandard(data) {
  const request = {
    data: `Stream-${__VU}-${__ITER}`,
    count: data ? data.messageCount : MESSAGE_COUNT,
  };
  testGrpcStandardServerStream(data ? data.grpcStandardServer : GRPC_STANDARD_SERVER, request);
  sleep(0.05);
}

// Default function (not used when scenarios have exec specified)
export default function() {}

/**
 * Test gRPC server streaming through ConnectRPC server
 * Called in isolation - no other protocols run concurrently.
 */
function testGrpcConnectServerStream(server, request) {
  grpcConnectClient.connect(server, {
    plaintext: true,
    reflect: false,
  });
  
  const startTime = Date.now();
  
  const stream = grpcConnectClient.invoke(
    'example.v1.ExampleService/ServerStream',
    request,
    { tags: { protocol: 'grpc-connect-stream' } }
  );
  
  const duration = Date.now() - startTime;
  grpcConnectStreamDuration.add(duration);
  
  let messageCount = 0;
  let success = false;
  
  if (stream && stream.status === grpc.StatusOK) {
    if (Array.isArray(stream.message)) {
      messageCount = stream.message.length;
    } else if (stream.message) {
      messageCount = 1;
    }
    success = messageCount > 0;
  }
  
  grpcConnectMessages.add(messageCount);
  
  check(stream, {
    'grpc-connect-stream: status is OK': (r) => r && r.status === grpc.StatusOK,
    'grpc-connect-stream: received messages': () => messageCount > 0,
  });
  
  grpcConnectErrorRate.add(!success);
  
  grpcConnectClient.close();
}

/**
 * Test standard NestJS gRPC server streaming
 * Called in isolation - no other protocols run concurrently.
 */
function testGrpcStandardServerStream(server, request) {
  grpcStandardClient.connect(server, {
    plaintext: true,
    reflect: false,
  });
  
  const startTime = Date.now();
  
  const stream = grpcStandardClient.invoke(
    'example.v1.ExampleService/ServerStream',
    request,
    { tags: { protocol: 'grpc-standard-stream' } }
  );
  
  const duration = Date.now() - startTime;
  grpcStandardStreamDuration.add(duration);
  
  let messageCount = 0;
  let success = false;
  
  if (stream && stream.status === grpc.StatusOK) {
    if (Array.isArray(stream.message)) {
      messageCount = stream.message.length;
    } else if (stream.message) {
      messageCount = 1;
    }
    success = messageCount > 0;
  }
  
  grpcStandardMessages.add(messageCount);
  
  check(stream, {
    'grpc-standard-stream: status is OK': (r) => r && r.status === grpc.StatusOK,
    'grpc-standard-stream: received messages': () => messageCount > 0,
  });
  
  grpcStandardErrorRate.add(!success);
  
  grpcStandardClient.close();
}

export function teardown(data) {
  console.log('');
  console.log('='.repeat(60));
  console.log('Server Streaming Benchmark Complete');
  console.log('='.repeat(60));
}

export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `results/server-stream-${timestamp}.json`;
  
  const summary = {
    timestamp: new Date().toISOString(),
    scenario: SCENARIO,
    testMode: 'sequential',
    messageCount: MESSAGE_COUNT,
    servers: {
      grpcConnect: CONNECT_SERVER,
      grpcStandard: GRPC_STANDARD_SERVER,
    },
    metrics: {
      grpcConnect: {
        duration: extractMetrics(data, 'grpc_connect_stream_duration'),
        messagesReceived: data.metrics.grpc_connect_messages_received?.values.count || 0,
        errorRate: data.metrics.grpc_connect_errors?.values.rate || 0,
      },
      grpcStandard: {
        duration: extractMetrics(data, 'grpc_standard_stream_duration'),
        messagesReceived: data.metrics.grpc_standard_messages_received?.values.count || 0,
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
  output += '  SERVER STREAMING: gRPC via ConnectRPC vs Standard gRPC\n';
  output += '='.repeat(70) + '\n\n';
  
  output += 'Note: Each implementation was tested in ISOLATION (not concurrently)\n';
  output += `Expected messages per stream: ${MESSAGE_COUNT}\n\n`;
  
  // Protocol comparison table
  output += 'Stream Completion Time (ms):\n';
  output += '-'.repeat(70) + '\n';
  output += formatRow(['Implementation', 'Avg', 'P50', 'P90', 'P95', 'P99', 'Max']);
  output += '-'.repeat(70) + '\n';
  
  const protocols = [
    { name: 'gRPC (ConnectRPC)', metric: 'grpc_connect_stream_duration', errors: 'grpc_connect_errors' },
    { name: 'gRPC (Standard)', metric: 'grpc_standard_stream_duration', errors: 'grpc_standard_errors' },
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
  
  // Message counts
  output += 'Messages Received:\n';
  output += '-'.repeat(40) + '\n';
  
  const msgMetrics = [
    { name: 'gRPC (ConnectRPC)', metric: 'grpc_connect_messages_received' },
    { name: 'gRPC (Standard)', metric: 'grpc_standard_messages_received' },
  ];
  
  for (const m of msgMetrics) {
    const count = data.metrics[m.metric]?.values.count || 0;
    output += `  ${m.name.padEnd(18)}: ${count}\n`;
  }
  
  output += '-'.repeat(40) + '\n\n';
  
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
