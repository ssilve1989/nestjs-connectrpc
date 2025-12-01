#!/usr/bin/env bash
#
# gRPC/ConnectRPC Benchmark Suite Orchestration Script
#
# This script:
# 1. Builds all server applications
# 2. Starts servers in background
# 3. Waits for health checks
# 4. Runs k6 benchmarks
# 5. Collects results
# 6. Cleans up servers
#
# Usage:
#   ./run-all.sh              # Run all benchmarks
#   ./run-all.sh unary        # Run only unary benchmark
#   ./run-all.sh streaming    # Run only streaming benchmark
#
# Environment variables:
#   SKIP_BUILD=1              # Skip build step
#   CONNECT_PORT=50051        # ConnectRPC server port
#   GRPC_PORT=50052           # Standard gRPC server port
#   K6_VUS=50                 # Override default VUs
#   K6_DURATION=60s           # Override default duration

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCHMARK_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$BENCHMARK_DIR")"
RESULTS_DIR="${BENCHMARK_DIR}/results"

CONNECT_PORT="${CONNECT_PORT:-50051}"
GRPC_PORT="${GRPC_PORT:-50052}"
CONNECT_SERVER="localhost:${CONNECT_PORT}"
GRPC_SERVER="localhost:${GRPC_PORT}"

# PIDs for cleanup
CONNECT_PID=""
GRPC_PID=""

# Cleanup function
cleanup() {
  echo -e "\n${YELLOW}Cleaning up...${NC}"
  
  if [[ -n "$CONNECT_PID" ]] && kill -0 "$CONNECT_PID" 2>/dev/null; then
    echo "Stopping ConnectRPC server (PID: $CONNECT_PID)"
    kill "$CONNECT_PID" 2>/dev/null || true
    wait "$CONNECT_PID" 2>/dev/null || true
  fi
  
  if [[ -n "$GRPC_PID" ]] && kill -0 "$GRPC_PID" 2>/dev/null; then
    echo "Stopping Standard gRPC server (PID: $GRPC_PID)"
    kill "$GRPC_PID" 2>/dev/null || true
    wait "$GRPC_PID" 2>/dev/null || true
  fi
  
  echo -e "${GREEN}Cleanup complete${NC}"
}

# Set trap for cleanup
trap cleanup EXIT INT TERM

# Print banner
print_banner() {
  echo -e "${BLUE}"
  echo "╔════════════════════════════════════════════════════════════════════╗"
  echo "║           gRPC / ConnectRPC Benchmark Suite                        ║"
  echo "╠════════════════════════════════════════════════════════════════════╣"
  echo "║  Comparing:                                                        ║"
  echo "║    • ConnectRPC (Connect protocol)                                 ║"
  echo "║    • ConnectRPC (gRPC protocol)                                    ║"
  echo "║    • Standard NestJS gRPC (@grpc/grpc-js)                          ║"
  echo "╚════════════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

# Check prerequisites
check_prerequisites() {
  echo -e "${BLUE}Checking prerequisites...${NC}"
  
  # Check for k6
  if ! command -v k6 &>/dev/null; then
    echo -e "${RED}Error: k6 is not installed${NC}"
    echo "Install k6:"
    echo "  macOS: brew install k6"
    echo "  Linux: https://k6.io/docs/getting-started/installation/"
    echo "  Docker: docker run --rm -i grafana/k6 run - <script.js"
    exit 1
  fi
  
  # Check for Node.js
  if ! command -v node &>/dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    exit 1
  fi
  
  # Check for pnpm
  if ! command -v pnpm &>/dev/null; then
    echo -e "${RED}Error: pnpm is not installed${NC}"
    exit 1
  fi
  
  echo -e "${GREEN}All prerequisites met${NC}"
}

# Build servers
build_servers() {
  if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
    echo -e "${YELLOW}Skipping build (SKIP_BUILD=1)${NC}"
    return
  fi
  
  echo -e "${BLUE}Building servers...${NC}"
  
  # Build ConnectRPC example
  echo "Building ConnectRPC server..."
  cd "${REPO_ROOT}/examples/connect-example"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  pnpm build
  
  # Build standard gRPC server
  echo "Building Standard gRPC server..."
  cd "${BENCHMARK_DIR}/standard-grpc"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  pnpm build
  
  echo -e "${GREEN}Build complete${NC}"
}

# Wait for server to be ready
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
      echo "Server $name did not start within ${max_attempts} seconds"
      return 1
    fi
    echo -n "."
    sleep 1
    ((attempt++))
  done
  
  echo -e " ${GREEN}OK${NC}"
}

# Start servers
start_servers() {
  echo -e "${BLUE}Starting servers...${NC}"
  
  # Create results directory
  mkdir -p "$RESULTS_DIR"
  
  # Start ConnectRPC server
  echo "Starting ConnectRPC server on port $CONNECT_PORT..."
  cd "${REPO_ROOT}/examples/connect-example"
  PORT="$CONNECT_PORT" node dist/main.js > "${RESULTS_DIR}/connect-server.log" 2>&1 &
  CONNECT_PID=$!
  echo "ConnectRPC server PID: $CONNECT_PID"
  
  # Start standard gRPC server
  echo "Starting Standard gRPC server on port $GRPC_PORT..."
  cd "${BENCHMARK_DIR}/standard-grpc"
  PORT="$GRPC_PORT" node dist/main.js > "${RESULTS_DIR}/grpc-server.log" 2>&1 &
  GRPC_PID=$!
  echo "Standard gRPC server PID: $GRPC_PID"
  
  # Wait for servers to be ready
  wait_for_server "localhost" "$CONNECT_PORT" "ConnectRPC" || exit 1
  wait_for_server "localhost" "$GRPC_PORT" "Standard gRPC" || exit 1
  
  echo -e "${GREEN}All servers started${NC}"
}

# Run benchmark
run_benchmark() {
  local script="$1"
  local name="$2"
  
  echo -e "\n${BLUE}Running $name benchmark...${NC}"
  echo "Script: $script"
  echo ""
  
  cd "$BENCHMARK_DIR"
  
  # Build k6 command arguments
  local k6_args=(
    run
    --env "CONNECT_SERVER=$CONNECT_SERVER"
    --env "GRPC_STANDARD_SERVER=$GRPC_SERVER"
    --env "PROTO_PATH=${REPO_ROOT}/proto/example/v1/example.proto"
  )
  
  # Add optional K6_OPTIONS if set
  if [[ -n "${K6_OPTIONS:-}" ]]; then
    # shellcheck disable=SC2206
    k6_args+=($K6_OPTIONS)
  fi
  
  # Add the script path
  k6_args+=("$script")
  
  # Run k6
  k6 "${k6_args[@]}" || {
    echo -e "${RED}Benchmark $name failed${NC}"
    return 1
  }
  
  echo -e "${GREEN}$name benchmark complete${NC}"
}

# Generate comparison summary
generate_summary() {
  echo -e "\n${BLUE}Generating summary...${NC}"
  
  local summary_file="${RESULTS_DIR}/summary-$(date +%Y%m%d-%H%M%S).txt"
  
  {
    echo "═══════════════════════════════════════════════════════════════════"
    echo "  BENCHMARK SUMMARY"
    echo "  Generated: $(date)"
    echo "═══════════════════════════════════════════════════════════════════"
    echo ""
    echo "Servers:"
    echo "  ConnectRPC: $CONNECT_SERVER"
    echo "  Standard gRPC: $GRPC_SERVER"
    echo ""
    echo "Test Results:"
    echo ""
    
    # List all result files
    for result in "${RESULTS_DIR}"/*.json; do
      if [[ -f "$result" ]]; then
        echo "  - $(basename "$result")"
      fi
    done
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    echo ""
    echo "Key Observations:"
    echo ""
    echo "1. Compare p95 latencies across all three protocols"
    echo "2. ConnectRPC (gRPC) should be similar to Standard gRPC"
    echo "3. Connect protocol may show different characteristics"
    echo ""
    echo "For detailed analysis, examine the JSON result files in:"
    echo "  ${RESULTS_DIR}/"
    echo ""
  } > "$summary_file"
  
  echo "Summary written to: $summary_file"
  cat "$summary_file"
}

# Main execution
main() {
  local benchmark_type="${1:-all}"
  
  print_banner
  check_prerequisites
  build_servers
  start_servers
  
  # Give servers a moment to fully initialize
  sleep 2
  
  case "$benchmark_type" in
    unary|all|*)
      run_benchmark "${SCRIPT_DIR}/unary.js" "Unary RPC"
      ;;
    streaming|stream)
      echo -e "${YELLOW}WARNING: k6's gRPC module only supports unary RPCs.${NC}"
      echo -e "${YELLOW}Server streaming benchmark will show 100% errors - this is a k6 limitation.${NC}"
      echo -e "${YELLOW}For streaming benchmarks, use 'ghz' instead:${NC}"
      echo ""
      echo "  ghz --insecure --proto proto/example/v1/example.proto \\"
      echo "      --call example.v1.ExampleService/ServerStream \\"
      echo "      -d '{\"data\":\"test\",\"count\":5}' localhost:50051"
      echo ""
      echo -e "${YELLOW}Skipping streaming benchmark.${NC}"
      ;;
  esac
  
  generate_summary
  
  echo -e "\n${GREEN}═══════════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  All benchmarks completed successfully!${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════════${NC}"
}

main "$@"
