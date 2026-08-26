# furrow

A soft three.js farm diorama. Seeds are bought with simulated ETH and harvests
pay out in simulated fractional stock. The real chain backend comes later.

This chunk turns the diorama into a game: a playable farmer character,
proximity interaction, generated audio, a start screen, and a day cycle.

## Play

Click **start** (or press any key) to unlock sound and drop into the farm.

Walk with **wasd** or the arrow keys, camera-relative. Click a plot to walk
there automatically. Press **e** or **space** to act on the plot in front of
you: plant the selected seed on an empty plot, or harvest a fully grown one.
Clicking a plot does the same thing in one step, walking over if you're not
already close enough. Keys **1**-**5** pick which seed is selected; the tray
also picks up clicks. Drag to orbit the camera; scroll to zoom. On touch
devices there's no keyboard prompt: tap a plot to walk there and work it.

The floating prompt over the plot in front of you (or under the cursor)
reads `e · plant TSLA` or `e · harvest TSLA` when there's something to do,
or `TSLA · 62%` while a plant is growing.

`sound on` / `sound off` in the wallet panel toggles the music and effects;
**m** does the same from the keyboard. Mute is remembered across reloads.

A small label at the top center tracks the day and time of day (morning,
midday, golden hour), which loops every 4 minutes and never goes fully dark.

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

With a plot hovered: `g` skips its plant to the next growth stage in the sim.
`r` removes the hovered plant instantly, in both the sim and the scene, no
animation. `p` fires a camera punch.

Query flags: `?fast=1` shortens grow times to 20-40 seconds for testing.
`?reset=1` clears saved sim state on load.

## Assets

The farmer model, music, and sound effects were generated rather than
hand-authored; see `design/assets.csv` for what each one is.

## Deploy

Pushing to main runs the GitHub Actions workflow, which builds and publishes
to GitHub Pages.
