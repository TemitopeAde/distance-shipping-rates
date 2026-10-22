# App Market listing: Distance-Based Shipping & Delivery

Paste into the App Dashboard. Images are rendered from `src/` by `./render.sh` into `out/`.

## App Profile > App Info

**App name**
Distance-Based Shipping & Delivery

**Teaser** (61 characters)
Charge delivery fees by real road distance, live at checkout.

**App icon**
`out/icon.png`: 1000 x 1000, 24-bit PNG, sRGB, solid background, no text.

**Features** (best first)
1. Price delivery by real road distance, not straight-line estimates
2. Base fee plus a rate per mile or km, with minimum and maximum fees
3. Distance brackets, surcharges and free delivery over a set order value
4. Delivery zones by country, region or postal code, with exclusions
5. Rate simulator that previews any address with a full fee breakdown

**Full description** (446 characters, so none of it is hidden under "Read more")

Stop guessing delivery fees. Distance-Based Shipping & Delivery calculates the actual driving distance from your store or warehouse to each customer's address and adds an accurate delivery rate to your cart and checkout. Set a base fee and a per-mile or per-kilometer rate, cap how far you deliver, and offer free local delivery on larger orders. Ideal for bakeries, florists, furniture stores, restaurants and any business that delivers locally.

**Wix demo site URL**
Leave blank unless you publish a demo store with the app enabled at checkout.

**Terms & conditions URL**
TODO: add your hosted terms page before submitting.

## App Profile > App Market > Get Found

**Category**
Sell Online (the app adds delivery rates to the store's cart and checkout)

**Search keywords** (5 of 5)
1. local delivery
2. shipping rates
3. delivery fee
4. distance shipping
5. delivery zones

## Pricing > Plan benefits

Limits match `src/lib/billing/plans.ts`. Update these sentences if you change the limits there.
A lookup is one new customer address; repeat addresses are cached and don't count.

**Basic (free)**
Distance-based delivery rates at checkout from one location, with every pricing option and delivery zone. Includes 10 new addresses a month and 7 days of history.

**Pro ($19/month)**
Price 1,500 new addresses a month from up to 3 locations, using your primary or nearest one. Every pricing option included, with 30 days of history.

**Business ($49/month)**
Price 6,000 new addresses a month from up to 25 locations, using your primary or nearest one. Every pricing option included, with 90 days of history.

## App Profile > Media

**Images** (upload in this order; each is 2400 x 1800 PNG, 4:3, above the 1200 x 900 minimum)

| # | File | Shows |
|---|------|-------|
| 1 | `out/1-main.png` | Main image: app name, tagline, route and checkout price |
| 2 | `out/2-overview.png` | Overview: setup checklist, checkout health, recent calculations |
| 3 | `out/3-pricing-rules.png` | Pricing rule editor |
| 4 | `out/4-rate-simulator.png` | Rate simulator with fee breakdown |
| 5 | `out/5-zones-locations.png` | Fulfillment locations and delivery zones |
| 6 | `out/6-checkout.png` | Mobile checkout showing the delivery option |

**Video**
Optional YouTube URL: a short promotional overview, not a tutorial.

**Promotional banner**
`out/banner.jpg` (540 x 360 JPG). `out/banner@2x.jpg` is a sharper 1080 x 720 copy if the uploader accepts it. It has no text and no logo, as Wix recommends.
