#!/bin/sh
set -eu
# Factory tests execute the current pool Wasm, so build it before native tests.
stellar contract build --package yieldshield-pool-v3
cargo test --workspace --locked
stellar contract build
