# furrow

A soft three.js farm diorama. Seeds are bought with simulated ETH and harvests
pay out in simulated fractional stock. The real chain backend comes later.

This chunk adds the simulated economy and HUD on top of the scene, hover
picking, and plant growth/harvest animation from chunks 1 and 2.

## The economy

Each species costs a fixed amount of simulated ETH to plant (TSLA 0.002,
MSFT 0.003, AAPL 0.0035, AMZN 0.004, NVDA 0.005) and takes 6 to 15 minutes to
grow. Planting swaps that ETH into fractional shares of the ticker at the
current reference price and fixes the share count right away, mirroring what
the future on-chain hook will do (swap on plant, not on harvest). Harvesting a
ready plant just moves those shares into your holdings.

Reference prices (five stocks plus ETH/USD) are a seeded daily random walk
plus a small per-minute wiggle, so every visitor sees the same tape and prices
still move while you watch. If your ETH balance runs dry, it accrues back at
0.01/hour up to a cap of 0.05, so the demo never dead-ends.

Everything is simulated and stored in `localStorage`. Nothing here touches a
real chain.

## Run

    npm install
    npm run dev

## Dev keys

Keys `1`-`5` select the ticker to plant (default TSLA). Click an empty tile
to plant the selected ticker; click a stage-3 (fully grown) plant to harvest
it. `g` skips the hovered tile's plant to its next growth stage in the sim.
`p` fires a camera punch. `r` removes the hovered plant instantly, in both
the sim and the scene, no animation.

Query flags: `?fast=1` shortens grow times to 20-40 seconds for testing.
`?reset=1` clears saved sim state on load.

## Deploy

Pushing to main runs the GitHub Actions workflow, which builds and publishes
to GitHub Pages.
