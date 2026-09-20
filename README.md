# CloseLine

After-hours board for tokenized US stocks.

Cash session is shut (nights, weekends). Onchain prices are not.
CloseLine shows last close vs live token price, then a $5–$20 ticket.
You confirm. The model does not trade.

**Live:** https://closeline.ai.studio  
**Demo:** https://x.com/iAmOweezY/status/2101474076456075764

Not for US persons. Not equity. Demo only.

## What you will see
- Session banner: Weekend / NYSE closed / After hours
- Gap vs last close on a short list (TSLA, META, NVDA, …)
- After-hours desk: largest gap + 2-line Gemini note
- $5 / $10 / $20 → quote → receipt
- Guest path = paper trade (Firestore)
- Connected wallet = Jupiter swap for TSLAx when the route is live

## Stack
Google AI Studio, Firebase / Firestore, Gemini (desk copy), Solana wallets, Jupiter (TSLAx).

## How to run
Open the live URL. No signup.

Local:
```bash

npm run dev
