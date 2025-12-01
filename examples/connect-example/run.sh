#!/bin/bash

# Run from the connect-example directory
cd "$(dirname "$0")"

# Test unary RPC
echo "=== Testing SayHello (Unary) ==="
pnpm buf curl --protocol grpc --http2-prior-knowledge \
  --schema ../../proto \
  http://localhost:50051/example.v1.ExampleService/SayHello \
  -d '{"name": "World"}'

echo ""
echo "=== Testing ServerStream (Server Streaming) ==="
pnpm buf curl --protocol grpc --http2-prior-knowledge \
  --schema ../../proto \
  http://localhost:50051/example.v1.ExampleService/ServerStream \
  -d '{"data": "Hello", "count": 3}'
