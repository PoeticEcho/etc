// Older comparison endpoints can still serve any single KMA grid by coordinate.
export async function loadPointForecast(region, endpoint, fetchPoint, force) {
  const url = new URL(endpoint);
  url.searchParams.set('lat', region.lat);
  url.searchParams.set('lon', region.lon);
  if (force) url.searchParams.set('force', '1');
  try {
    const response = await fetchPoint(url);
    if (response.ok) return await response.json();
  } catch {
    // Keep the rest of the comparison usable if this grid is temporarily unavailable.
  }
  return null;
}

export function insertGayaRow(batch, roster, point, summarize) {
  const { id, admin, county, name, group, color, routeOrder, lat, lon, grid } = roster.find(r => r.id === 'gaya');
  const row = { id, admin, county, name, group, color, routeOrder, lat, lon, grid,
    hours: [], sources: { short: null, ultra: null }, sharedGridRegions: [] };
  if (point?.ok && point.grid?.nx === grid.nx && point.grid?.ny === grid.ny) {
    const times = new Map();
    for (const region of batch.regions) {
      for (const hour of region.hours) times.set(hour.time, hour);
    }
    for (const hour of point.hours || []) {
      const column = times.get(hour.time);
      if (!column) continue;
      const { dateLabel, dayNum, isTomorrow, hourKst, isNight } = column;
      row.hours.push({
        ...hour, dateLabel, dayNum, isTomorrow, hourKst, isNight, offset: row.hours.length,
        temp: hour.temp == null ? null : Number(hour.temp),
        humidity: hour.humidity == null ? null : Number(hour.humidity), pop: hour.chance
      });
    }
    row.sources = { short: point.sources?.short ?? null, ultra: point.sources?.ultra ?? null };
  }
  row.summaries = { tomorrow: summarize(row.hours) };
  for (const n of [6, 12, 24]) row.summaries['h' + n] = summarize(row.hours.slice(0, n));

  const order = new Map(roster.map(r => [r.id, r.routeOrder]));
  const regions = batch.regions.map(r => ({ ...r, routeOrder: order.get(r.id) ?? r.routeOrder }));
  const yaro = regions.findIndex(r => r.id === 'yaro');
  regions.splice(yaro < 0 ? regions.length : yaro, 0, row);
  return regions;
}
