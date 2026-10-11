import { Asset, Networks, rpc, Contract } from "@stellar/stellar-sdk";
import { save } from "./testnet.mjs";
const issuers = {
  testnet: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  mainnet: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
};
const catalog = {
  researchedAt: new Date().toISOString(),
  source: "https://developers.circle.com/stablecoins/usdc-contract-addresses",
  status: "Research only. No USDC strategy or backing activated.",
  assets: [],
};
for (const [network, issuer] of Object.entries(issuers)) {
  const response = await fetch(
    `https://horizon${network === "testnet" ? "-testnet" : ""}.stellar.org/accounts/${issuer}`,
  );
  if (!response.ok) throw new Error(`Issuer read failed ${network}`);
  const account = await response.json();
  const sac = new Asset("USDC", issuer).contractId(
    network === "testnet" ? Networks.TESTNET : Networks.PUBLIC,
  );
  const item = {
    code: "USDC",
    network,
    issuer,
    derivedSac: sac,
    issuerFlags: account.flags,
    homeDomain: account.home_domain ?? null,
    sacVerified: false,
  };
  if (network === "testnet") {
    const server = new rpc.Server("https://soroban-testnet.stellar.org");
    const result = await server.getLedgerEntries(
      new Contract(sac).getFootprint(),
    );
    const entry = result.entries[0];
    item.sacVerified =
      !!entry &&
      JSON.parse(JSON.stringify(entry.val))?.contract_data?.val
        ?.contract_instance?.executable === "stellar_asset";
  }
  catalog.assets.push(item);
}
save("config/asset-research.json", catalog);
console.log(
  "Recorded issuer identity, flags and deterministic SAC addresses; nothing activated.",
);
