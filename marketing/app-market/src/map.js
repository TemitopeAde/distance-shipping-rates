// Stylised street map with a road route, injected into any <div class="map" data-w data-h>.
// Shared by the main image, the simulator screen and the banner so the route looks identical.
document.querySelectorAll('div.map').forEach((el) => {
  const w = +el.dataset.w, h = +el.dataset.h;
  const labels = el.dataset.labels !== 'off';
  const vb = el.dataset.vb || '0 0 1000 800';
  // Blocks cover a large area so any viewBox crop (data-vb) stays filled.
  const blocks = [];
  const cols = [-300, -150, 0, 150, 300, 470, 620, 780, 920, 1070, 1220];
  const rows = [-260, -130, 0, 130, 260, 400, 540, 680, 820, 960, 1100];
  for (let c = 0; c < cols.length - 1; c++)
    for (let r = 0; r < rows.length - 1; r++) {
      if ((c === 5 || c === 6) && r === 3) continue; // park
      blocks.push(`<rect x="${cols[c] + 14}" y="${rows[r] + 14}" width="${cols[c + 1] - cols[c] - 28}" height="${rows[r + 1] - rows[r] - 28}" rx="14" fill="#fff"/>`);
    }
  const route = 'M150 680 L150 540 L300 540 L300 400 L470 400 L470 260 L780 260 L780 130';
  el.innerHTML = `
  <svg width="${w}" height="${h}" viewBox="${vb}" preserveAspectRatio="xMidYMid slice" style="display:block">
    <rect x="-400" y="-400" width="1800" height="1600" fill="oklch(0.93 0.015 250)"/>
    
    ${blocks.join('')}
    <rect x="484" y="144" width="282" height="102" rx="14" fill="oklch(0.9 0.07 150)"/>
        <path d="${route}" fill="none" stroke="#fff" stroke-width="30" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${route}" fill="none" stroke="oklch(0.52 0.19 258)" stroke-width="16" stroke-linejoin="round" stroke-linecap="round"/>
    <g transform="translate(150 680)">
      <circle r="38" fill="oklch(0.42 0.17 260)" stroke="#fff" stroke-width="8"/>
      <g transform="translate(-18 -18) scale(1.5)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${window.ICONS.store}</g>
    </g>
    <g transform="translate(780 130)">
      <path d="M0 0 C -40 -50 -46 -60 -46 -86 A46 46 0 1 1 46 -86 C 46 -60 40 -50 0 0Z" fill="oklch(0.6 0.2 30)" stroke="#fff" stroke-width="7"/>
      <circle cy="-88" r="16" fill="#fff"/>
    </g>
    ${labels ? `
    <g transform="translate(320 440)">
      <rect x="-4" y="-4" width="238" height="74" rx="37" fill="#fff" style="filter:drop-shadow(0 8px 18px rgba(20,30,70,.18))"/>
      <circle cx="33" cy="33" r="25" fill="oklch(0.95 0.02 255)"/>
      <g transform="translate(19 19) scale(1.15)" fill="none" stroke="oklch(0.52 0.19 258)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${window.ICONS.route}</g>
      <text x="72" y="31" font-family="Roboto" font-size="26" font-weight="700" fill="oklch(0.21 0.02 260)">12.4 mi</text>
      <text x="72" y="56" font-family="Roboto" font-size="18" fill="oklch(0.5 0.02 257)">road distance</text>
    </g>` : ''}
  </svg>`;
});
