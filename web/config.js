// Public configuration. The key below is Supabase's publishable key: it is meant to be
// shipped to browsers and only grants what row-level security allows (read-only views).
export const CFG = {
  api: 'https://wpnbzpulkyogdeuuqffh.supabase.co/rest/v1',
  key: 'sb_publishable_iz4Bq-MFx4C0gY38cDtGYw_PPRumPqT',
  center: [34.9, 31.7],
  zoom: 6.1,
  bounds: [[26, 25], [42, 38]],   // must match the basemap extract in the build workflow
  pollMs: 15000,
  maxAgeSec: 180,                 // aircraft whose last position is older are not drawn
  staleSec: 180,                  // source considered silent after this
};

export const THEMES = {
  light: { sea: '#C7D6E0', land: '#EEF0EA', ink: '#16222E', sub: '#4A5866', panel: '#FFFFFF', line: '#D9DEE2',
    halo: '#EEF0EA', accent: '#0B4F8A', warn: '#A8195C', markink: '#FFFFFF', btn: '#FFFFFF',
    shadow: 'rgba(22,34,46,.22)', alt: ['#8A4B12', '#B8860B', '#1F7A6B', '#1B4F9C'], unk: '#6B7680' },
  dark: { sea: '#0D1822', land: '#1A2733', ink: '#EDF2F6', sub: '#A9B6C2', panel: '#15212C', line: '#2A3946',
    halo: '#0D1822', accent: '#7FB8F0', warn: '#FF7EB6', markink: '#0D1822', btn: '#15212C',
    shadow: 'rgba(0,0,0,.5)', alt: ['#F2A65A', '#F2D15A', '#6FD6C2', '#8FB8FF'], unk: '#8C99A5' },
};
