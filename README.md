# furrow

A soft three.js farm diorama. Seeds are bought with simulated ETH and harvests
pay out in simulated fractional stock. The real chain backend comes later.

This chunk adds plants and growth/harvest animation: five species (TSLA,
AAPL, NVDA, MSFT, AMZN), each with four growth stages, on top of the scene
and hover picking from chunk 1. No economy or HUD yet.

## Run

    npm install
    npm run dev

## Dev keys

Keys `1`-`5` select the ticker to plant (default TSLA). Click an empty tile
to plant the selected ticker; click a stage-3 (fully grown) plant to harvest
it. `g` grows the hovered tile's plant one stage. `p` fires a camera punch.
`r` removes the hovered plant instantly, no animation.

## Deploy

Pushing to main runs the GitHub Actions workflow, which builds and publishes
to GitHub Pages.
