const config = __CONFIG__;
let selected = config.accounts[0], rejectNext = false, wrongNetwork = false;
window.addEventListener("DOMContentLoaded", () => {
  const panel = document.createElement("aside");
  panel.style.cssText = "position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#142b27;color:white;padding:8px;display:flex;gap:16px;align-items:center;font:13px monospace";
  panel.innerHTML = '<strong>LOCAL TEST WALLET · disposable Testnet only</strong><label>Test wallet <select aria-label="E2E wallet"><option value="0">Tester</option><option value="1">Sponsor</option><option value="2">Fresh E2E wallet</option></select></label><button type="button">Reject next signature</button><label><input type="checkbox" aria-label="Report wrong network"> Report wrong network</label><span role="status" id="e2e-status">Ready</span>';
  panel.querySelector("select").addEventListener("change", e => { selected = config.accounts[Number(e.target.value)]; });
  panel.querySelector("button").addEventListener("click", () => { rejectNext = true; panel.querySelector("#e2e-status").textContent = "Next signature will be rejected"; });
  panel.querySelector("input").addEventListener("change", e => { wrongNetwork = e.target.checked; });
  document.body.append(panel);
});
window.addEventListener("message", async event => {
  const m = event.data;
  if (event.source !== window || event.origin !== location.origin || m?.source !== "FREIGHTER_EXTERNAL_MSG_REQUEST") return;
  const respond = data => window.postMessage({ source: "FREIGHTER_EXTERNAL_MSG_RESPONSE", messagedId: m.messageId, ...data }, location.origin);
  switch (m.type) {
    case "REQUEST_CONNECTION_STATUS": respond({ isConnected: true }); break;
    case "REQUEST_ACCESS": case "REQUEST_PUBLIC_KEY": respond({ publicKey: selected }); break;
    case "REQUEST_ALLOWED_STATUS": case "SET_ALLOWED_STATUS": respond({ isAllowed: true }); break;
    case "REQUEST_NETWORK_DETAILS": respond({ networkDetails: { network: wrongNetwork ? "PUBLIC" : "TESTNET", networkPassphrase: wrongNetwork ? "Public Global Stellar Network ; September 2015" : config.passphrase, networkUrl: "https://horizon-testnet.stellar.org", sorobanRpcUrl: "https://soroban-testnet.stellar.org" } }); break;
    case "SUBMIT_TRANSACTION":
      try {
        if (rejectNext) { rejectNext = false; throw Error("Test wallet rejected the signature."); }
        if (m.accountToSign !== selected) throw Error("Wallet account changed. Reconnect before continuing.");
        const r = await fetch("/__e2e/sign", { method: "POST", headers: { "Content-Type": "application/json", "X-E2E-Token": config.token }, body: JSON.stringify(m) });
        const result = await r.json();
        if (!r.ok) throw Error(result.error);
        respond(result);
        document.getElementById("e2e-status").textContent = "Signed disposable Testnet transaction";
      } catch (e) { respond({ apiError: { code: -1, message: e.message } }); }
      break;
    default: respond({ apiError: { code: -1, message: "Unsupported test wallet request" } });
  }
});
