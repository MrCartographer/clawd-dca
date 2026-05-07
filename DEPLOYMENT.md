# CLAWD DCA Engine — Deployment

**Date:** 2026-05-06
**Network:** Base (chainId 8453)
**Job:** [LeftClaw Services #99](https://leftclaw.services)

## Live frontend

- **URL:** https://bafybeiapzctmy6cshifhiwor4rvqdowjjxq5xtbarhrrxazpfus6ppsxva.ipfs.community.bgipfs.com/
- **CID:** `bafybeiapzctmy6cshifhiwor4rvqdowjjxq5xtbarhrrxazpfus6ppsxva`
- **Host:** BGIPFS community gateway

## Deployed contracts

| Contract | Address | Notes |
| --- | --- | --- |
| CLAWDdca | [`0x8c81CAeCA48f521Df24B65F1C22c11150830F088`](https://basescan.org/address/0x8c81CAeCA48f521Df24B65F1C22c11150830F088) | Verified on Basescan |
| CLAWD (token) | [`0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07`](https://basescan.org/token/0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07) | ERC-20, target asset |
| USDC (token) | [`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`](https://basescan.org/token/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) | Native Base USDC |
| Uniswap V3 SwapRouter02 | [`0x2626664c2603336E57B271c5C0b26F421741e481`](https://basescan.org/address/0x2626664c2603336E57B271c5C0b26F421741e481) | Used for swap execution |
| Uniswap V3 QuoterV2 | [`0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a`](https://basescan.org/address/0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a) | Used for slippage quoting |
| WETH | [`0x4200000000000000000000000000000000000006`](https://basescan.org/address/0x4200000000000000000000000000000000000006) | Hop token in default path |

## Reproduce the upload

```bash
# from repo root
npx bgipfs upload config init --apiKey $BGIPFS_TOKEN --nodeUrl https://upload.bgipfs.com
npx bgipfs upload packages/nextjs/out
```
