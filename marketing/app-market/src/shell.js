// Fills <aside class="side" data-active="…"> with the dashboard sidebar from AppShell.tsx.
const NAV = [
  ['overview', 'layout-dashboard', 'Overview'],
  ['locations', 'map-pin', 'Locations'],
  ['rules', 'list-ordered', 'Pricing rules'],
  ['zones', 'map', 'Delivery zones'],
  ['simulator', 'gauge', 'Rate simulator'],
  ['checkout', 'plug', 'Checkout integration'],
  ['logs', 'activity', 'Calculations & logs'],
  ['billing', 'credit-card', 'Billing'],
  ['settings', 'settings', 'Settings'],
];
document.querySelectorAll('aside.side').forEach((el) => {
  const active = el.dataset.active;
  el.innerHTML = `
    <div class="logo"><b><i data-i="truck" data-s="18"></i></b><span>Distance-Based Shipping &amp; Delivery</span></div>
    <div style="padding:0 6px"><span class="badge ok"><i data-i="circle-check" data-s="13"></i>Live at checkout</span></div>
    <ul class="nav">${NAV.map(([id, icon, label]) => `<li class="${id === active ? 'on' : ''}"><i data-i="${icon}"></i>${label}</li>`).join('')}</ul>`;
});
