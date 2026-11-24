export function* largeTrack(points: number, timed = false) {
  yield Buffer.from('<gpx version="1.1"><trk><trkseg>');
  const batch = 512;
  for (let start = 0; start < points; start += batch) {
    const rows = [];
    for (let index = start; index < Math.min(points, start + batch); index++) {
      const longitude = (index / 1e6).toFixed(6);
      rows.push(
        timed
          ? `<trkpt lat="45" lon="${longitude}"><time>${new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString()}</time></trkpt>`
          : `<trkpt lat="45" lon="${longitude}"/>`,
      );
    }
    yield Buffer.from(rows.join(""));
  }
  yield Buffer.from("</trkseg></trk></gpx>");
}
