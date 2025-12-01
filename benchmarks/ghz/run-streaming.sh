#!/usr/bin/env bash
#
# gRPC Server Streaming Benchmark using ghz
#
# ghz is a gRPC benchmarking tool that properly supports streaming RPCs.
# This script benchmarks server streaming performance between:
#   - ConnectRPC server (nestjs-buf-connect)
#   - Standard NestJS gRPC server (@grpc/grpc-js)
#
# Prerequisites:
#   brew install ghz
#
# Usage:
#   ./run-streaming.sh              # Run full benchmark
#   ./run-streaming.sh quick        # Quick test (fewer requests)
#   ./run-streaming.sh connect      # Test only ConnectRPC
#   ./run-streaming.sh standard     # Test only Standard gRPC

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCHMARK_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$BENCHMARK_DIR")"
RESULTS_DIR="${BENCHMARK_DIR}/results"
PROTO_PATH="${REPO_ROOT}/proto/example/v1/example.proto"

CONNECT_PORT="${CONNECT_PORT:-50051}"
GRPC_PORT="${GRPC_PORT:-50052}"

# Benchmark settings
CONCURRENCY="${CONCURRENCY:-50}"        # Concurrent workers
TOTAL_REQUESTS="${TOTAL_REQUESTS:-10000}" # Total requests
MESSAGE_COUNT="${MESSAGE_COUNT:-5}"      # Messages per stream
DURATION="${DURATION:-30s}"             # Alternative: duration-based

# Quick mode settings
QUICK_CONCURRENCY=10
QUICK_REQUESTS=1000

# Server PIDs
CONNECT_PID=""
GRPC_PID=""

cleanup() {
  echo -e "\n${YELLOW}Cleaning up...${NC}"
  [[ -n "$CONNECT_PID" ]] && kill "$CONNECT_PID" 2>/dev/null || true
  [[ -n "$GRPC_PID" ]] && kill "$GRPC_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  echo -e "${GREEN}Cleanup complete${NC}"
}

trap cleanup EXIT INT TERM

print_banner() {
  echo -e "${CYAN}"
  echo "╔════════════════════════════════════════════════════════════════════╗"
  echo "║       Server Streaming Benchmark (ghz)                             ║"
  echo "╠════════════════════════════════════════════════════════════════════╣"
  echo "║  Comparing:                                                        ║"
  echo "║    • ConnectRPC (gRPC protocol) - nestjs-buf-connect               ║"
  echo "║    • Standard NestJS gRPC - @grpc/grpc-js                          ║"
  echo "╚════════════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

check_prerequisites() {
  echo -e "${BLUE}Checking prerequisites...${NC}"
  
  if ! command -v ghz &>/dev/null; then
    echo -e "${RED}Error: ghz is not installed${NC}"
    echo "Install with: brew install ghz"
    echo "Or visit: https://ghz.sh/docs/install"
    exit 1
  fi
  
  if [[ ! -f "$PROTO_PATH" ]]; then
    echo -e "${RED}Error: Proto file not found at $PROTO_PATH${NC}"
    exit 1
  fi
  
  echo -e "${GREEN}Prerequisites met${NC}"
}

build_servers() {
  if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
    echo -e "${YELLOW}Skipping build (SKIP_BUILD=1)${NC}"
    return
  fi
  
  echo -e "${BLUE}Building servers...${NC}"
  
  cd "${REPO_ROOT}/examples/connect-example"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  pnpm build
  
  cd "${BENCHMARK_DIR}/standard-grpc"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  pnpm build
  
  echo -e "${GREEN}Build complete${NC}"
}

wait_for_server() {
  local host="$1"
  local port="$2"
  local name="$3"
  local max_attempts=30
  local attempt=1
  
  echo -n "Waiting for $name on port $port..."
  
  while ! nc -z "$host" "$port" 2>/dev/null; do
    if [[ $attempt -ge $max_attempts ]]; then
      echo -e " ${RED}FAILED${NC}"
      return 1
    fi
    echo -n "."
    sleep 1
    ((attempt++))
  done
  
  echo -e " ${GREEN}OK${NC}"
}

start_servers() {
  echo -e "${BLUE}Starting servers...${NC}"
  
  mkdir -p "$RESULTS_DIR"
  
  cd "${REPO_ROOT}/examples/connect-example"
  PORT="$CONNECT_PORT" node dist/main.js > "${RESULTS_DIR}/connect-server-streaming.log" 2>&1 &
  CONNECT_PID=$!
  
  cd "${BENCHMARK_DIR}/standard-grpc"
  PORT="$GRPC_PORT" node dist/main.js > "${RESULTS_DIR}/grpc-server-streaming.log" 2>&1 &
  GRPC_PID=$!
  
  wait_for_server "localhost" "$CONNECT_PORT" "ConnectRPC" || exit 1
  wait_for_server "localhost" "$GRPC_PORT" "Standard gRPC" || exit 1
  
  sleep 2  # Extra time for full initialization
  echo -e "${GREEN}All servers started${NC}"
}

run_ghz_benchmark() {
  local name="$1"
  local host="$2"
  local port="$3"
  local output_file="$4"
  
  echo -e "\n${BLUE}Running benchmark: $name${NC}"
  echo "  Host: $host:$port"
  echo "  Concurrency: $CONCURRENCY"
  echo "  Total Requests: $TOTAL_REQUESTS"
  echo "  Messages per Stream: $MESSAGE_COUNT"
  echo ""
  
  ghz --insecure \
      --proto "$PROTO_PATH" \
      --call "example.v1.ExampleService/ServerStream" \
      --data "{\"data\":\"benchmark\",\"count\":$MESSAGE_COUNT}" \
      --concurrency "$CONCURRENCY" \
      --total "$TOTAL_REQUESTS" \
      --format json \
      --output "$output_file" \
      "$host:$port"
  
  # Also print summary to console
  ghz --insecure \
      --proto "$PROTO_PATH" \
      --call "example.v1.ExampleService/ServerStream" \
      --data "{\"data\":\"benchmark\",\"count\":$MESSAGE_COUNT}" \
      --concurrency "$CONCURRENCY" \
      --total "$TOTAL_REQUESTS" \
      "$host:$port" 2>/dev/null || true
}

extract_metric() {
  local file="$1"
  local key="$2"
  jq -r ".$key // 0" "$file" 2>/dev/null || echo "0"
}

format_duration() {
  local ns="$1"
  # Convert nanoseconds to milliseconds with 2 decimal places
  echo "scale=2; $ns / 1000000" | bc 2>/dev/null || echo "0"
}

generate_report() {
  local connect_file="$1"
  local standard_file="$2"
  local report_file="${RESULTS_DIR}/streaming-report-$(date +%Y%m%d-%H%M%S).txt"
  
  echo -e "\n${BLUE}Generating report...${NC}"
  
  # Extract metrics from JSON results
  local connect_avg=$(extract_metric "$connect_file" ".average")
  local connect_p50=$(extract_metric "$connect_file" ".latencyDistribution[4].latency" 2>/dev/null || echo "0")
  local connect_p90=$(extract_metric "$connect_file" ".latencyDistribution[7].latency" 2>/dev/null || echo "0")
  local connect_p95=$(extract_metric "$connect_file" ".latencyDistribution[8].latency" 2>/dev/null || echo "0")
  local connect_p99=$(extract_metric "$connect_file" ".latencyDistribution[9].latency" 2>/dev/null || echo "0")
  local connect_rps=$(extract_metric "$connect_file" ".rps")
  local connect_count=$(extract_metric "$connect_file" ".count")
  local connect_errors=$(extract_metric "$connect_file" ".errorCount")
  
  local standard_avg=$(extract_metric "$standard_file" ".average")
  local standard_p50=$(extract_metric "$standard_file" ".latencyDistribution[4].latency" 2>/dev/null || echo "0")
  local standard_p90=$(extract_metric "$standard_file" ".latencyDistribution[7].latency" 2>/dev/null || echo "0")
  local standard_p95=$(extract_metric "$standard_file" ".latencyDistribution[8].latency" 2>/dev/null || echo "0")
  local standard_p99=$(extract_metric "$standard_file" ".latencyDistribution[9].latency" 2>/dev/null || echo "0")
  local standard_rps=$(extract_metric "$standard_file" ".rps")
  local standard_count=$(extract_metric "$standard_file" ".count")
  local standard_errors=$(extract_metric "$standard_file" ".errorCount")
  
  # Generate report
  {
    echo "======================================================================"
    echo "  SERVER STREAMING BENCHMARK: gRPC via ConnectRPC vs Standard gRPC"
    echo "======================================================================"
    echo ""
    echo "Test Configuration:"
    echo "  Messages per stream: $MESSAGE_COUNT"
    echo "  Concurrency: $CONCURRENCY"
    echo "  Total Requests: $TOTAL_REQUESTS"
    echo ""
    echo "Note: Each implementation was tested in ISOLATION (not concurrently)"
    echo ""
    echo "Latency Comparison (from ghz):"
    echo "----------------------------------------------------------------------"
    printf "%-18s %-10s %-10s %-10s\n" "Implementation" "Avg" "RPS" "Errors"
    echo "----------------------------------------------------------------------"
    printf "%-18s %-10s %-10s %-10s\n" "gRPC (ConnectRPC)" "${connect_avg}ns" "$connect_rps" "$connect_errors"
    printf "%-18s %-10s %-10s %-10s\n" "gRPC (Standard)" "${standard_avg}ns" "$standard_rps" "$standard_errors"
    echo "----------------------------------------------------------------------"
    echo ""
    echo "Total Requests:"
    echo "  gRPC (ConnectRPC) : $connect_count"
    echo "  gRPC (Standard)   : $standard_count"
    echo ""
    echo "======================================================================"
    echo ""
    echo "Detailed results saved to:"
    echo "  - $(basename "$connect_file")"
    echo "  - $(basename "$standard_file")"
  } | tee "$report_file"
  
  echo ""
  echo -e "${GREEN}Report saved to: $report_file${NC}"
}

run_single_benchmark() {
  local target="$1"
  local timestamp=$(date +%Y%m%d-%H%M%S)
  
  case "$target" in
    connect)
      local output="${RESULTS_DIR}/streaming-connect-${timestamp}.json"
      run_ghz_benchmark "ConnectRPC (gRPC)" "localhost" "$CONNECT_PORT" "$output"
      echo -e "\n${GREEN}Results saved to: $output${NC}"
      ;;
    standard)
      local output="${RESULTS_DIR}/streaming-standard-${timestamp}.json"
      run_ghz_benchmark "Standard gRPC" "localhost" "$GRPC_PORT" "$output"
      echo -e "\n${GREEN}Results saved to: $output${NC}"
      ;;
  esac
}

run_full_benchmark() {
  local timestamp=$(date +%Y%m%d-%H%M%S)
  local connect_output="${RESULTS_DIR}/streaming-connect-${timestamp}.json"
  local standard_output="${RESULTS_DIR}/streaming-standard-${timestamp}.json"
  
  echo -e "\n${CYAN}Phase 1: Benchmarking ConnectRPC (gRPC protocol)${NC}"
  echo "============================================================"
  run_ghz_benchmark "ConnectRPC (gRPC)" "localhost" "$CONNECT_PORT" "$connect_output"
  
  echo -e "\n${CYAN}Phase 2: Benchmarking Standard gRPC${NC}"
  echo "============================================================"
  run_ghz_benchmark "Standard gRPC" "localhost" "$GRPC_PORT" "$standard_output"
  
  echo ""
  generate_report "$connect_output" "$standard_output"
}

main() {
  local mode="${1:-all}"
  
  print_banner
  check_prerequisites
  
  # Handle quick mode
  if [[ "$mode" == "quick" ]]; then
    echo -e "${YELLOW}Quick mode: Using reduced settings${NC}"
    CONCURRENCY=$QUICK_CONCURRENCY
    TOTAL_REQUESTS=$QUICK_REQUESTS
    mode="all"
  fi
  
  build_servers
  start_servers
  
  echo -e "\n${CYAN}Benchmark Settings:${NC}"
  echo "  Concurrency: $CONCURRENCY"
  echo "  Total Requests: $TOTAL_REQUESTS"
  echo "  Messages per Stream: $MESSAGE_COUNT"
  echo ""
  
  case "$mode" in
    connect)
      run_single_benchmark "connect"
      ;;
    standard)
      run_single_benchmark "standard"
      ;;
    all|*)
      run_full_benchmark
      ;;
  esac
  
  echo -e "\n${GREEN}════════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  Streaming benchmark completed successfully!${NC}"
  echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
}

main "$@"
