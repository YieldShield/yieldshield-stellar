import { assertTestnet, cliRun, readJson } from "./testnet.mjs";
if (!process.argv.includes("--broadcast"))
  throw new Error(
    "Pass --broadcast to extend testnet storage using the disposable sponsor",
  );
await assertTestnet();
const m = readJson("config/testnet.json");
for (const name of ["vault", "pool", "faucet"]) {
  cliRun(
    [
      "contract",
      "extend",
      "--id",
      m[name],
      "--ledgers-to-extend",
      "1000000",
      "--network",
      "testnet",
      "--source-account",
      "ys-stellar-sponsor",
    ],
    `extend-${name}-instance`,
  );
  cliRun(
    [
      "contract",
      "extend",
      "--wasm-hash",
      m[`${name}WasmHash`],
      "--ledgers-to-extend",
      "1000000",
      "--network",
      "testnet",
      "--source-account",
      "ys-stellar-sponsor",
    ],
    `extend-${name}-code`,
  );
}
cliRun(
  [
    "contract",
    "extend",
    "--id",
    m.backing,
    "--ledgers-to-extend",
    "1000000",
    "--network",
    "testnet",
    "--source-account",
    "ys-stellar-sponsor",
  ],
  "extend-backing-instance",
);
console.log(
  "Extended active contract code and instance lifetime by up to1,000,000 ledgers. Network resets can still erase testnet state.",
);
